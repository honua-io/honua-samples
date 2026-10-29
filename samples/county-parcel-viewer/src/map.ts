// The map: MapLibre GL JS with every tile read from the one Honua server.
//   - basemap: the server's Protomaps archive (maui-basemap), or a plain
//     background when it is unavailable. No SDK or third-party default basemap.
//   - parcel outlines: the static PMTiles archive maui-parcels-static, mounted
//     through @honua/sdk-js/pmtiles registerPmtilesSource (source-layer
//     "layer"). Parcels are drawn only from these tiles, never from REST.
//   - the selected parcel: a filter on those same tiles.
//   - flood zones near the parcel: the REST candidates from the flood check.
// Each PMTiles byte-range read is recorded in the request log.

import "./maplibre-worker.js";
import "maplibre-gl/dist/maplibre-gl.css";

import { registerPmtilesSource } from "@honua/sdk-js/pmtiles";
import type { GeoJsonGeometry } from "@honua/sdk-js/geometry";
import * as maplibregl from "maplibre-gl";
import { FetchSource, PMTiles, Protocol, type RangeResponse, type Source } from "pmtiles";

import type { ViewerConfig } from "./config.js";
import { isAbort, logRequest, settle } from "./request-log.js";

/** Below this zoom a click would pick a parcel too small to see, so it only hints. */
export const CLICK_MIN_ZOOM = 15;
const OUTLINE_MIN_ZOOM = 12;
const PARCEL_TILES_MIN_ZOOM = 10;
const PARCEL_SOURCE_LAYER = "layer";
const MAUI_VIEW = { center: [-156.33, 20.8] as [number, number], zoom: 8.6 };

/** A PMTiles source that records each byte range it reads. */
class LoggedSource implements Source {
  constructor(private readonly inner: FetchSource) {}
  getKey(): string {
    return this.inner.getKey();
  }
  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    const entry = logRequest({ method: "GET", url: this.inner.getKey(), note: `PMTiles range bytes=${offset}-${offset + length - 1}` });
    try {
      const response = await this.inner.getBytes(offset, length, signal, etag);
      settle(entry, 206);
      return response;
    } catch (error) {
      // MapLibre cancels tile reads it no longer needs while the map moves.
      settle(entry, isAbort(error, signal) ? "cancelled" : "failed");
      throw error;
    }
  }
}

let protocol: Protocol | undefined;

function pmtilesArchive(archiveUrl: string): PMTiles {
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
  }
  const existing = protocol.get(archiveUrl);
  if (existing) return existing;
  const archive = new PMTiles(new LoggedSource(new FetchSource(archiveUrl)));
  protocol.add(archive);
  return archive;
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface ParcelMap {
  readonly map: maplibregl.Map;
  readonly ready: Promise<void>;
  /** Highlight the parcel (from the tiles) and fit the map to its bounds. */
  select(tmk: string, geometry: GeoJsonGeometry): void;
  clearSelection(): void;
  showFlood(geometries: readonly GeoJsonGeometry[]): void;
  /** True when the selected parcel's outline is in the loaded tiles. */
  selectedOutlineRendered(): boolean;
}

export interface MapEvents {
  onPick(lngLat: [number, number]): void;
  onNote(text: string | null, kind?: "info" | "error"): void;
  onBasemap(state: string): void;
}

function boundsOf(geometry: GeoJsonGeometry): [[number, number], [number, number]] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === "number") {
      const [x, y] = coords as [number, number];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    } else if (Array.isArray(coords)) coords.forEach(visit);
  };
  visit((geometry as { coordinates?: unknown }).coordinates);
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

async function addBasemap(map: maplibregl.Map, config: ViewerConfig): Promise<string> {
  if (!config.basemapUrl) return "off (basemap=none)";
  try {
    const archive = pmtilesArchive(config.basemapUrl);
    await archive.getHeader();
    map.addSource("basemap", { type: "vector", url: `pmtiles://${config.basemapUrl}` });
    // Under every data layer.
    const before = map.getStyle().layers.find((layer) => layer.id !== "background")?.id;
    map.addLayer({ id: "basemap-earth", type: "fill", source: "basemap", "source-layer": "earth", paint: { "fill-color": token("--land") } }, before);
    map.addLayer({ id: "basemap-water", type: "fill", source: "basemap", "source-layer": "water", paint: { "fill-color": token("--water") } }, before);
    map.addLayer(
      {
        id: "basemap-roads",
        type: "line",
        source: "basemap",
        "source-layer": "roads",
        paint: { "line-color": token("--road"), "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 4] },
      },
      before,
    );
    map.setPaintProperty("background", "background-color", token("--water"));
    return "Protomaps PMTiles from the same server";
  } catch (error) {
    return `not available (${error instanceof Error ? error.message : String(error)}), plain background`;
  }
}

function addParcelOutlines(map: maplibregl.Map, config: ViewerConfig): void {
  if (!config.parcelTilesUrl) return;
  const descriptor = registerPmtilesSource({
    directArchiveUrl: config.parcelTilesUrl,
    directTileKind: "mvt",
    directMinZoom: PARCEL_TILES_MIN_ZOOM,
    directMaxZoom: 13,
    honuaBaseUrl: config.baseUrl,
  });
  pmtilesArchive(descriptor.archiveUrl);
  map.addSource("parcels", { ...descriptor.maplibreSource } as maplibregl.VectorSourceSpecification);
  map.addLayer({
    id: "parcel-outlines",
    type: "line",
    source: "parcels",
    "source-layer": PARCEL_SOURCE_LAYER,
    minzoom: OUTLINE_MIN_ZOOM,
    paint: { "line-color": token("--parcel"), "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 16, 1.2, 19, 2] },
  });
  map.addLayer({
    id: "parcel-selected-fill",
    type: "fill",
    source: "parcels",
    "source-layer": PARCEL_SOURCE_LAYER,
    filter: ["==", ["get", "tmk_txt"], ""],
    paint: { "fill-color": token("--yellow"), "fill-opacity": 0.45 },
  });
  map.addLayer({
    id: "parcel-selected-line",
    type: "line",
    source: "parcels",
    "source-layer": PARCEL_SOURCE_LAYER,
    filter: ["==", ["get", "tmk_txt"], ""],
    paint: { "line-color": token("--ink"), "line-width": 3 },
  });
}

export function createParcelMap(container: HTMLElement, config: ViewerConfig, events: MapEvents): ParcelMap {
  const map = new maplibregl.Map({
    container,
    style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": token("--land") } }] },
    center: MAUI_VIEW.center,
    zoom: MAUI_VIEW.zoom,
    attributionControl: { compact: true, customAttribution: "Basemap © OpenStreetMap contributors (Protomaps) · Parcels, zoning: County of Maui · Flood zones: FEMA" },
    cooperativeGestures: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  // On a phone the expanded credit line covers a third of the 38vh map; it
  // starts collapsed there behind MapLibre's (i) button.
  if (window.matchMedia("(max-width: 640px)").matches) {
    map.once("load", () => container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
  }
  (window as unknown as { sampleMap: maplibregl.Map }).sampleMap = map;

  let selectedTmk: string | null = null;

  const ready = new Promise<void>((resolve) => {
    map.once("load", async () => {
      try {
        addParcelOutlines(map, config);
      } catch (error) {
        events.onNote(`Parcel outlines are unavailable (${error instanceof Error ? error.message : String(error)}). Search still works.`, "error");
      }
      // Flood zones sit over the selected parcel's fill and under its outline.
      const underOutline = map.getLayer("parcel-selected-line") ? "parcel-selected-line" : undefined;
      map.addSource("flood", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "flood-fill", type: "fill", source: "flood", paint: { "fill-color": token("--flood"), "fill-opacity": 0.18 } }, underOutline);
      map.addLayer({ id: "flood-line", type: "line", source: "flood", paint: { "line-color": token("--fail"), "line-opacity": 0.6, "line-width": 1, "line-dasharray": [3, 2] } }, underOutline);
      events.onBasemap(await addBasemap(map, config));
      resolve();
    });
  });

  map.on("error", (event) => {
    const message = event.error instanceof Error ? event.error.message : "a map resource failed to load";
    events.onNote(`Part of the map did not load (${message}). The results panel keeps working.`, "error");
  });

  map.on("click", (event) => {
    if (map.getZoom() < CLICK_MIN_ZOOM) {
      events.onNote("Zoom in to pick a parcel on the map, or search above.");
      return;
    }
    events.onPick([event.lngLat.lng, event.lngLat.lat]);
  });

  const setSelectedFilter = (tmk: string) => {
    for (const id of ["parcel-selected-fill", "parcel-selected-line"]) {
      if (map.getLayer(id)) map.setFilter(id, ["==", ["get", "tmk_txt"], tmk]);
    }
  };

  return {
    map,
    ready,
    select(tmk, geometry) {
      selectedTmk = tmk;
      void ready.then(() => {
        setSelectedFilter(tmk);
        map.fitBounds(boundsOf(geometry), { padding: 48, maxZoom: 18, duration: reducedMotion() ? 0 : 600 });
        // The outline comes from the tiles only. Say so when they do not draw it
        // here, instead of drawing the REST geometry in its place.
        map.once("idle", () => {
          if (selectedTmk !== tmk || !config.parcelTilesUrl) return;
          const drawn = map.queryRenderedFeatures({ layers: ["parcel-selected-line"] }).length > 0;
          container.dataset.outlineRendered = String(drawn);
          if (drawn) return;
          events.onNote(
            map.getZoom() < PARCEL_TILES_MIN_ZOOM
              ? "This parcel is too large to outline at this zoom. Zoom in to see its lot lines."
              : "This parcel's outline is not in the map tiles. The results above come from the county parcel layer.",
          );
        });
      });
    },
    clearSelection() {
      selectedTmk = null;
      void ready.then(() => {
        setSelectedFilter("");
        (map.getSource("flood") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
      });
    },
    showFlood(geometries) {
      void ready.then(() => {
        const data = {
          type: "FeatureCollection",
          features: geometries.map((geometry) => ({ type: "Feature", properties: {}, geometry })),
        } as unknown as Parameters<maplibregl.GeoJSONSource["setData"]>[0];
        (map.getSource("flood") as maplibregl.GeoJSONSource | undefined)?.setData(data);
      });
    },
    selectedOutlineRendered() {
      if (!selectedTmk || !map.getLayer("parcel-selected-line")) return false;
      return map.queryRenderedFeatures({ layers: ["parcel-selected-line"] }).length > 0;
    },
  };
}
