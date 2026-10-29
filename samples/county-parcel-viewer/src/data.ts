// Every FeatureServer and GeocodeServer call the viewer makes, through the
// published @honua/sdk-js. connect() discovers each layer with a client whose
// fetch is the request logger; QueryBuilder then runs the queries on that
// client. Parcels are never drawn from these responses: outlines come from
// PMTiles (map.ts). REST is for lookups, identify and overlap only.

import {
  type HonuaClient,
  HonuaGeocodingClient,
  QueryBuilder,
  connect,
  esriGeometryToGeoJSON,
  point,
  polygon,
} from "@honua/sdk-js/honua";
import type { GeoJsonGeometry } from "@honua/sdk-js/geometry";

import type { ViewerConfig } from "./config.js";
import type { OverlapCandidate } from "./overlap.js";
import { loggedFetch } from "./request-log.js";
import { tmkWhere } from "./tmk.js";

export interface Parcel {
  readonly tmk: string;
  readonly gisAcres: number | null;
  readonly taxAcres: number | null;
  /** The assessor link exactly as the layer stores it (checked before use). */
  readonly qpubLink: unknown;
  /** WGS84 GeoJSON, for the overlap math and fitting the map. Never drawn. */
  readonly geometry: GeoJsonGeometry;
  /** The Esri JSON rings, sent back as the candidate-query polygon. */
  readonly rings: number[][][];
}

interface LayerHandle {
  readonly client: HonuaClient;
  readonly serviceId: string;
  readonly layerId: number;
}

const handles = new Map<string, Promise<LayerHandle>>();

function parseLayerUrl(url: string): { serviceId: string; layerId: number } {
  const match = /\/rest\/services\/(.+)\/FeatureServer\/(\d+)$/u.exec(new URL(url).pathname);
  if (!match) throw new Error(`${url} is not a FeatureServer layer URL (…/rest/services/<service>/FeatureServer/<layer>)`);
  return { serviceId: decodeURIComponent(match[1]), layerId: Number(match[2]) };
}

/** connect() once per layer; the connection's client runs every query. */
export function layer(url: string): Promise<LayerHandle> {
  let handle = handles.get(url);
  if (!handle) {
    handle = (async () => {
      const { serviceId, layerId } = parseLayerUrl(url);
      const connection = await connect({
        endpoint: url,
        protocol: "geoservices-feature-service",
        authorizationScopeFingerprint: "anonymous-public",
        clientOptions: { fetchFn: loggedFetch, timeoutMs: 30_000 },
      });
      return { client: connection.dataset.client, serviceId, layerId };
    })();
    // A failed discovery is retried on the next call, not cached.
    handle.catch(() => handles.delete(url));
    handles.set(url, handle);
  }
  return handle;
}

function toParcel(feature: { attributes: Record<string, unknown>; geometry?: unknown }): Parcel {
  const attributes = feature.attributes;
  const esri = feature.geometry as { rings?: number[][][] } | null | undefined;
  const geometry = esriGeometryToGeoJSON(esri as Record<string, unknown> | null);
  if (!esri?.rings?.length || !geometry) throw new Error("The parcel layer returned a parcel without a polygon.");
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    tmk: String(attributes["tmk_txt"] ?? ""),
    gisAcres: number(attributes["gisacres"]),
    taxAcres: number(attributes["taxacres"]),
    qpubLink: attributes["qpub_link"],
    geometry,
    rings: esri.rings,
  };
}

const PARCEL_FIELDS = ["tmk_txt", "gisacres", "taxacres", "qpub_link"];

/** The parcel with this TMK, or null. `digits` must already be validated. */
export async function parcelByTmk(config: ViewerConfig, digits: string, signal: AbortSignal): Promise<Parcel | null> {
  const where = tmkWhere(digits);
  const { client, serviceId, layerId } = await layer(config.parcelsUrl);
  const response = await QueryBuilder.for(client, serviceId, layerId)
    .where(where)
    .outFields(...PARCEL_FIELDS)
    .returnGeometry(true)
    .limit(2)
    .extraParams({ outSR: 4326 })
    .signal(signal)
    .run();
  const feature = response.features?.[0];
  return feature ? toParcel(feature) : null;
}

/** The parcel under a WGS84 point (map click or geocoded address), or null. */
export async function parcelAtPoint(config: ViewerConfig, lngLat: readonly [number, number], signal: AbortSignal): Promise<Parcel | null> {
  const { client, serviceId, layerId } = await layer(config.parcelsUrl);
  const filter = point(lngLat[0], lngLat[1], { wkid: 4326 });
  const response = await QueryBuilder.for(client, serviceId, layerId)
    .where("1=1")
    .geometry(filter.geometry)
    .geometryType(filter.geometryType)
    .spatialRel("esriSpatialRelIntersects")
    .outFields(...PARCEL_FIELDS)
    .returnGeometry(true)
    .limit(1)
    .extraParams({ outSR: 4326 })
    .signal(signal)
    .run();
  const feature = response.features?.[0];
  return feature ? toParcel(feature) : null;
}

/**
 * Zoning or flood polygons that intersect the parcel, fetched by POST with the
 * parcel polygon itself (design R8): long rings never hit URL limits, and the
 * server returns only polygons that truly touch the parcel.
 */
export async function candidatesFor(
  layerUrl: string,
  parcel: Parcel,
  fields: { code: string; label?: string },
  signal: AbortSignal,
): Promise<OverlapCandidate[]> {
  const { client, serviceId, layerId } = await layer(layerUrl);
  const filter = polygon(parcel.rings, { wkid: 4326 });
  const outFields = fields.label ? [fields.code, fields.label] : [fields.code];
  const candidates: OverlapCandidate[] = [];
  const pageSize = 2000;
  for (let offset = 0; ; offset += pageSize) {
    const response = await QueryBuilder.for(client, serviceId, layerId)
      .where("1=1")
      .geometry(filter.geometry)
      .geometryType(filter.geometryType)
      .spatialRel("esriSpatialRelIntersects")
      .outFields(...outFields)
      .returnGeometry(true)
      .offset(offset)
      .limit(pageSize)
      .extraParams({ outSR: 4326 })
      .method("POST")
      .signal(signal)
      .run();
    for (const feature of response.features ?? []) {
      const geometry = esriGeometryToGeoJSON(feature.geometry ?? null);
      const code = feature.attributes[fields.code];
      if (!geometry || code === null || code === undefined || code === "") continue;
      const label = fields.label ? feature.attributes[fields.label] : undefined;
      candidates.push({ code: String(code), label: String(label ?? code), geometry });
    }
    if (!response.exceededTransferLimit || !response.features?.length) return candidates;
    if (offset > 20 * pageSize) throw new Error(`${layerUrl} returned more than ${20 * pageSize} polygons for one parcel`);
  }
}

export interface AddressMatch {
  readonly address: string;
  readonly lngLat: readonly [number, number];
}

export class GeocoderUnavailableError extends Error {}

let providerCheck: Promise<string> | undefined;

// The approved geocoder is OpenStreetMap data through Nominatim, credited on
// the page (design R17). The server reports its provider; any other provider
// (for example Amazon Location or Esri) is refused before an address is sent.
const OSM_PROVIDER = /nominatim|openstreetmap|\bosm\b/iu;

async function checkGeocoderProvider(config: ViewerConfig): Promise<string> {
  const url = `${config.baseUrl}/rest/services/${encodeURIComponent(config.geocoderLocator)}/GeocodeServer?f=json`;
  const response = await loggedFetch(url);
  if (!response.ok) throw new GeocoderUnavailableError(`GeocodeServer metadata answered HTTP ${response.status}`);
  const body = (await response.json()) as { locatorProperties?: { Provider?: string } };
  const provider = String(body.locatorProperties?.Provider ?? "unknown");
  if (!OSM_PROVIDER.test(provider)) {
    throw new GeocoderUnavailableError(`the GeocodeServer provider is "${provider}", not the OpenStreetMap (Nominatim) geocoder this page credits`);
  }
  return provider;
}

/** Up to five address matches. Throws GeocoderUnavailableError when address search cannot run. */
export async function geocode(config: ViewerConfig, text: string): Promise<AddressMatch[]> {
  providerCheck ??= checkGeocoderProvider(config);
  providerCheck.catch(() => (providerCheck = undefined));
  try {
    await providerCheck;
    const geocoder = new HonuaGeocodingClient({ baseUrl: config.baseUrl, locatorName: config.geocoderLocator, fetchFn: loggedFetch, timeoutMs: 20_000 });
    const results = await geocoder.forwardGeocode(text, { maxResults: 5, spatialReferenceWkid: 4326 });
    const seen = new Set<string>();
    const matches: AddressMatch[] = [];
    for (const result of results) {
      if (!OSM_PROVIDER.test(String(result.attributes["Provider"] ?? "nominatim"))) continue;
      if (!Number.isFinite(result.longitude) || !Number.isFinite(result.latitude) || seen.has(result.address)) continue;
      seen.add(result.address);
      matches.push({ address: result.address, lngLat: [result.longitude, result.latitude] });
    }
    return matches.slice(0, 5);
  } catch (error) {
    if (error instanceof GeocoderUnavailableError) throw error;
    throw new GeocoderUnavailableError(error instanceof Error ? error.message : String(error));
  }
}
