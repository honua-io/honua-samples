import booleanIntersects from "@turf/boolean-intersects";
import type { Geometry, Polygon } from "geojson";

type Attributes = Record<string, string | number>;
interface Row { attributes: Attributes; geometry: { rings: number[][][]; spatialReference: { wkid: number } } }
interface FixtureLayer { name: string; rows: Row[] }
const rectangle = (bounds: number[]): number[][][] => {
  const [west, south, east, north] = bounds;
  return [[[west, south], [west, north], [east, north], [east, south], [west, south]]];
};
const row = (attributes: Attributes, bounds: number[]): Row => ({
  attributes, geometry: { rings: rectangle(bounds), spatialReference: { wkid: 4326 } },
});
const layers: Record<string, FixtureLayer> = {
  "maui-parcels/1": { name: "Synthetic Maui parcels", rows: [
    row({ id: 2, tmk_txt: "234008053", gisacres: 1, taxacres: 1, qpub_link: "" }, [-156.502, 20.882, -156.501, 20.883]),
    row({ id: 10, tmk_txt: "234008054", gisacres: 2, taxacres: 2, qpub_link: "" }, [-156.500, 20.882, -156.499, 20.883]),
    row({ id: 30, tmk_txt: "234008055", gisacres: 3, taxacres: 3, qpub_link: "" }, [-156.498, 20.882, -156.497, 20.883]),
  ] },
  "maui-zoning/2": { name: "Synthetic zoning", rows: [
    row({ id: 1, zone_code: "R-1", zone_dist: "Synthetic residential" }, [-156.503, 20.881, -156.5005, 20.884]),
    row({ id: 2, zone_code: "B-3", zone_dist: "Synthetic business" }, [-156.5005, 20.881, -156.496, 20.884]),
  ] },
  "maui-flood-hazard/4": { name: "Synthetic flood zones", rows: [
    row({ id: 1, fld_zone: "AE" }, [-156.503, 20.881, -156.5005, 20.884]),
    row({ id: 2, fld_zone: "X" }, [-156.5005, 20.881, -156.496, 20.884]),
  ] },
};
const polygon = (feature: Row): Polygon => ({ type: "Polygon", coordinates: feature.geometry.rings });
const fields = (layer: FixtureLayer) => Object.entries(layer.rows[0].attributes).map(([name, value]) => ({
  name, alias: name, type: name === "id" ? "esriFieldTypeOID" : typeof value === "number" ? "esriFieldTypeDouble" : "esriFieldTypeString",
}));

function metadata(layer: FixtureLayer, id: number) {
  return { id, name: layer.name, type: "Feature Layer", geometryType: "esriGeometryPolygon", objectIdField: "id",
    spatialReference: { wkid: 4326 }, fields: fields(layer), capabilities: "Query", maxRecordCount: 2000,
    supportedQueryFormats: "JSON", advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: true } };
}

function filterWhere(rows: Row[], where: string): Row[] {
  const trimmed = where.trim();
  const expression = trimmed.startsWith("(") && trimmed.endsWith(")") ? trimmed.slice(1, -1).trim() : trimmed;
  if (/^1\s*=\s*1$/u.test(expression)) return rows;
  const id = /^id\s*=\s*(\d+)$/u.exec(expression);
  if (id) return rows.filter((feature) => feature.attributes.id === Number(id[1]));
  const match = /^tmk_txt\s*=\s*'(\d{9})'$/u.exec(expression);
  if (!match) throw new Error("Fixture supports only 1=1, numeric ID equality and exact TMK equality.");
  return rows.filter((feature) => feature.attributes.tmk_txt === match[1]);
}

function spatialFilter(rows: Row[], params: URLSearchParams): Row[] {
  if (!params.has("geometry")) return rows;
  if (params.get("spatialRel") !== "esriSpatialRelIntersects") throw new Error("Fixture supports intersects only.");
  const input = JSON.parse(params.get("geometry")!);
  const wkid = input.spatialReference?.wkid ?? Number(params.get("inSR") ?? 4326);
  if (wkid !== 4326) throw new Error("Fixture supports WGS84 only.");
  let geometry: Geometry;
  if (params.get("geometryType") === "esriGeometryPolygon") geometry = { type: "Polygon", coordinates: input.rings };
  else if (params.get("geometryType") === "esriGeometryPoint") geometry = { type: "Point", coordinates: [input.x, input.y] };
  else throw new Error("Fixture supports point and polygon queries only.");
  return rows.filter((feature) => booleanIntersects(polygon(feature), geometry));
}

function nonnegativeInteger(params: URLSearchParams, key: string, fallback: number): number {
  const value = params.get(key);
  if (value === null) return fallback;
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid ${key}.`);
  return Number(value);
}

function orderedRows(rows: Row[], order: string | null): Row[] {
  if (!order) return rows;
  const match = /^(id|tmk_txt|gisacres|taxacres)(?: (ASC|DESC))?$/iu.exec(order);
  if (!match) throw new Error("Unsupported fixture sort.");
  const direction = match[2]?.toUpperCase() === "DESC" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = a.attributes[match[1].toLowerCase()], right = b.attributes[match[1].toLowerCase()];
    return direction * (typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right)));
  });
}

function query(layer: FixtureLayer, params: URLSearchParams) {
  const allowed = new Set(["f", "where", "outFields", "returnGeometry", "objectIds", "returnCountOnly", "returnIdsOnly",
    "resultOffset", "resultRecordCount", "orderByFields", "geometry", "geometryType", "spatialRel", "inSR", "outSR"]);
  for (const key of params.keys()) if (!allowed.has(key)) throw new Error(`Unsupported fixture query parameter: ${key}`);
  if (params.has("outSR") && params.get("outSR") !== "4326") throw new Error("Fixture supports WGS84 only.");
  let rows = filterWhere(layer.rows, params.get("where") ?? "1=1");
  if (params.has("objectIds")) rows = rows.filter((feature) => params.get("objectIds")!.split(",").includes(String(feature.attributes.id)));
  rows = orderedRows(spatialFilter(rows, params), params.get("orderByFields"));
  if (params.get("returnCountOnly") === "true") return { count: rows.length };
  if (params.get("returnIdsOnly") === "true") return { objectIdFieldName: "id", objectIds: rows.map((feature) => feature.attributes.id) };
  const offset = nonnegativeInteger(params, "resultOffset", 0);
  const limit = Math.min(nonnegativeInteger(params, "resultRecordCount", 2000), 2000);
  const selected = params.get("outFields")?.split(",") ?? ["*"];
  if (selected.some((name) => name !== "*" && !fields(layer).some((field) => field.name === name))) throw new Error("Unknown fixture field.");
  return { objectIdFieldName: "id", geometryType: "esriGeometryPolygon", spatialReference: { wkid: 4326 }, fields: fields(layer),
    exceededTransferLimit: offset + limit < rows.length, features: rows.slice(offset, offset + limit).map((feature) => ({
      attributes: Object.fromEntries(Object.entries(feature.attributes).filter(([name]) => selected.includes("*") || selected.includes(name))),
      ...(params.get("returnGeometry") === "false" ? {} : { geometry: feature.geometry }),
    })) };
}

export function fixtureResponse(path: string, params: URLSearchParams): { status: number; body: unknown } {
  if (path === "/fixture/parcels.geojson") return { status: 200, body: { type: "FeatureCollection",
    features: layers["maui-parcels/1"].rows.map((feature) => ({ type: "Feature", id: feature.attributes.id,
      properties: feature.attributes, geometry: polygon(feature) })) } };
  const match = /^\/rest\/services\/([^/]+)\/FeatureServer\/(\d+)(\/query)?$/u.exec(path);
  const layer = match && layers[`${match[1]}/${match[2]}`];
  if (!layer) return { status: 404, body: { error: { code: 404, message: "Unknown fixture endpoint." } } };
  try { return { status: 200, body: match[3] ? query(layer, params) : metadata(layer, Number(match[2])) }; }
  catch (error) { return { status: 400, body: { error: { code: 400, message: String(error) } } }; }
}
