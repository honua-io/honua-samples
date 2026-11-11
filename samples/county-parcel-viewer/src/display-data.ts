import { booleanIntersects } from '@turf/boolean-intersects';
import { bbox } from '@turf/bbox';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { Parcel } from './data.js';
import type { OverlapCandidate } from './overlap.js';
import { readSnapshotFeatures } from '../../../shared/state-local/display-snapshot.mjs';

type Area = Feature<Polygon | MultiPolygon>;
const cache = new Map<string, Promise<Area[]>>();

async function features(url: string, signal: AbortSignal): Promise<Area[]> {
  signal.throwIfAborted();
  let pending = cache.get(url);
  if (!pending) {
    pending = readSnapshotFeatures<Area>(url);
    cache.set(url, pending);
    pending.catch(() => cache.delete(url));
  }
  const result = await pending;
  signal.throwIfAborted();
  return result;
}

function parcel(feature: Area | undefined): Parcel | null {
  if (!feature) return null;
  const p = feature.properties ?? {};
  const geometry = feature.geometry;
  return { tmk: String(p.tmk_txt), gisAcres: p.gisacres ?? null, taxAcres: p.taxacres ?? null,
    qpubLink: p.qpub_link, geometry,
    rings: geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat() };
}

export async function displayParcelByTmk(url: string, digits: string, signal: AbortSignal): Promise<Parcel | null> {
  return parcel((await features(url, signal)).find((feature) => String(feature.properties?.tmk_txt).replace(/\D/g, '') === digits));
}

export async function displayParcelAtPoint(url: string, point: readonly [number, number], signal: AbortSignal): Promise<Parcel | null> {
  return parcel((await features(url, signal)).find((feature) => booleanIntersects({ type: 'Point', coordinates: [...point] }, feature)));
}

export async function displayCandidates(url: string, target: Parcel,
  options: { code: string; label?: string; signal: AbortSignal }): Promise<OverlapCandidate[]> {
  const bounds = bbox(target.geometry as Polygon | MultiPolygon);
  return (await features(url, options.signal)).filter((feature) => {
    const box = bbox(feature);
    return box[0] <= bounds[2] && box[2] >= bounds[0] && box[1] <= bounds[3] && box[3] >= bounds[1];
  }).map((feature) => {
    const properties = feature.properties ?? {};
    const code = properties[options.code];
    if (code === null || code === undefined || code === '') throw new Error('Incomplete polygon snapshot; applicability unknown');
    return { code: String(code), label: String(options.label ? properties[options.label] ?? code : code),
      geometry: feature.geometry, sourceId: feature.id ?? null, sourceIdField: 'OBJECTID' };
  });
}
