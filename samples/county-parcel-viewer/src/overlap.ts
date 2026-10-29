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
}

export interface OverlapGroup {
  readonly code: string;
  readonly label: string;
  readonly areaM2: number;
  /** Share of the parcel's area, 0..1. */
  readonly share: number;
  readonly geometry: GeoJsonGeometry;
}

export const ZONING_MIN_SHARE = 0.01;
export const ZONING_MIN_AREA_M2 = 10;

const isPolygonal = (geometry: GeoJsonGeometry | null | undefined): geometry is GeoJsonGeometry =>
  geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";

/** Every code that overlaps the parcel at all, largest first. */
export function overlapByCode(parcel: GeoJsonGeometry, candidates: readonly OverlapCandidate[], ops: GeometryOps): { parcelAreaM2: number; groups: OverlapGroup[] } {
  const parcelAreaM2 = ops.area(parcel);
  if (!(parcelAreaM2 > 0)) throw new Error("The parcel geometry has no area.");
  const byCode = new Map<string, { label: string; polygons: GeoJsonGeometry[] }>();
  for (const candidate of candidates) {
    if (!isPolygonal(candidate.geometry)) continue;
    const group = byCode.get(candidate.code) ?? { label: candidate.label, polygons: [] };
    group.polygons.push(candidate.geometry);
    byCode.set(candidate.code, group);
  }
  const groups: OverlapGroup[] = [];
  for (const [code, { label, polygons }] of byCode) {
    // Merge each code's polygons first, then clip once: parcel ∩ (A ∪ B) is
    // (parcel ∩ A) ∪ (parcel ∩ B), and a large parcel's long outline is
    // clipped once per code instead of once per polygon.
    const merged = polygons.length === 1 ? polygons[0] : ops.union(...polygons);
    const pieces = merged ? [ops.intersect(parcel, merged)] : polygons.map((polygon) => ops.intersect(parcel, polygon));
    const parts = pieces.filter(isPolygonal);
    if (parts.length === 0) continue;
    // union() returns null only when its inputs do not form a polygon; the
    // separate pieces' areas are then the honest total.
    const areaM2 = parts.reduce((sum, part) => sum + ops.area(part), 0);
    if (!(areaM2 > 0)) continue;
    groups.push({ code, label, areaM2, share: Math.min(1, areaM2 / parcelAreaM2), geometry: parts[0] });
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
