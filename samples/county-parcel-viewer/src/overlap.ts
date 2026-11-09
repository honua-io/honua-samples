// How much of a parcel each zoning district and flood zone covers.
//
// The math runs on WGS84 GeoJSON with intersect, union and area from
// @honua/sdk-js/geometry (geodesic square meters; design R1). Polygons are
// grouped by code and merged with union before ranking, so a district split
// into several polygons counts once with its whole share (R11). The counting rules:
//   - zoning counts when it covers at least 1% of the parcel AND 10 m², so
//     digitizing slivers along lot lines drop out;
//   - flood is a safety field: any non-zero overlap counts (R10).

import type { GeoJsonGeometry } from "@honua/sdk-js/geometry";

export interface GeometryOps {
  intersect(a: GeoJsonGeometry, b: GeoJsonGeometry): GeoJsonGeometry | null;
  union(...polygons: GeoJsonGeometry[]): GeoJsonGeometry | null;
  area(input: GeoJsonGeometry): number;
}

export interface OverlapCandidate {
  /** Grouping key: zone_code for zoning, fld_zone for flood. */
  readonly code: string;
  /** Display text: the layer's zone_dist for zoning, the code for flood. */
  readonly label: string;
  readonly geometry: GeoJsonGeometry;
  readonly sourceId?: unknown;
  readonly sourceIdField?: string;
}

export interface OverlapGroup {
  readonly code: string;
  readonly label: string;
  readonly areaM2: number;
  /** Share of the parcel's area, 0..1. */
  readonly share: number;
  readonly geometry: GeoJsonGeometry;
  readonly sources: readonly OverlapCandidate[];
}

export const ZONING_MIN_SHARE = 0.01;
export const ZONING_MIN_AREA_M2 = 10;

const isPolygonal = (geometry: GeoJsonGeometry | null | undefined): geometry is GeoJsonGeometry =>
  geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";

/** Every code with positive-area parcel overlap, largest first. */
export function overlapByCode(parcel: GeoJsonGeometry, candidates: readonly OverlapCandidate[], ops: GeometryOps): { parcelAreaM2: number; groups: OverlapGroup[] } {
  const parcelAreaM2 = ops.area(parcel);
  if (!(parcelAreaM2 > 0)) throw new Error("The parcel geometry has no area.");
  const byCode = new Map<string, { label: string; polygons: GeoJsonGeometry[]; sources: OverlapCandidate[] }>();
  for (const candidate of candidates) {
    if (!isPolygonal(candidate.geometry)) continue;
    const clipped = ops.intersect(parcel, candidate.geometry);
    if (!isPolygonal(clipped) || !(ops.area(clipped) > 0)) continue;
    const group = byCode.get(candidate.code) ?? { label: candidate.label, polygons: [], sources: [] };
    group.polygons.push(clipped);
    group.sources.push(candidate);
    byCode.set(candidate.code, group);
  }
  const groups: OverlapGroup[] = [];
  for (const [code, { label, polygons, sources }] of byCode) {
    const merged = polygons.length === 1 ? polygons[0] : ops.union(...polygons);
    if (!isPolygonal(merged)) throw new Error("Could not merge overlap polygons; coverage is unknown.");
    const areaM2 = ops.area(merged);
    if (!(areaM2 > 0)) continue;
    groups.push({ code, label, areaM2, share: Math.min(1, areaM2 / parcelAreaM2), geometry: merged, sources });
  }
  groups.sort((a, b) => b.areaM2 - a.areaM2);
  return { parcelAreaM2, groups };
}

export function countedZoning(groups: readonly OverlapGroup[]): OverlapGroup[] {
  return groups.filter((group) => group.share >= ZONING_MIN_SHARE && group.areaM2 >= ZONING_MIN_AREA_M2);
}

export function countedFlood(groups: readonly OverlapGroup[]): OverlapGroup[] {
  return groups.filter((group) => group.areaM2 > 0);
}

/** Whole-number percent of the parcel; "<1%" only when the share is truly under 1% (D10). */
export function shareLabel(share: number): string {
  return share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`;
}
