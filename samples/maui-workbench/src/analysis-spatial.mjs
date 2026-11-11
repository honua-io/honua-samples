import { envelope, polygon } from '@honua/sdk-js';

export function boundingBoxClause(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) {
    throw new Error('Enter four finite bounding box coordinates.');
  }
  const [west, south, east, north] = bounds;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new Error('Use a WGS84 bounding box with west < east and south < north.');
  }
  return { id: 'spatial', value: [...bounds], spatialScope: { filter: envelope(west, south, east, north) } };
}

const invalidPolygon = () => new Error('Draw one simple WGS84 polygon with 3 to 100 vertices, then close its ring.');
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function intersects(first, second) {
  const [a, b] = first;
  const [c, d] = second;
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0])
    || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false;
  return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
}

function validateRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 101
    || ring.some((point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)
      || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)) throw invalidPolygon();
  if (ring[0].some((value, index) => value !== ring.at(-1)[index])
    || new Set(ring.slice(0, -1).map((point) => point.join(','))).size !== ring.length - 1) throw invalidPolygon();
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += cross(ring[0], ring[i], ring[i + 1]);
    if (Math.abs(ring[i][0] - ring[i + 1][0]) > 180) throw invalidPolygon();
    for (let j = i + 2; j < ring.length - 1; j += 1) {
      if (i === 0 && j === ring.length - 2) continue;
      if (intersects([ring[i], ring[i + 1]], [ring[j], ring[j + 1]])) throw invalidPolygon();
    }
  }
  if (area === 0) throw invalidPolygon();
  return area;
}

export function polygonClause(geometry) {
  if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)
    || Object.keys(geometry).some((key) => !['type', 'coordinates'].includes(key))
    || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 1) throw invalidPolygon();
  const ring = geometry.coordinates[0];
  const area = validateRing(ring);
  const value = { type: 'Polygon', coordinates: [ring.map((point) => [...point])] };
  // GeoServices exterior rings run clockwise; keep the original GeoJSON shape in shared state.
  const exterior = (area > 0 ? [...ring].reverse() : ring).map((point) => [...point]);
  return { id: 'spatial', value, spatialScope: { filter: polygon([exterior]) } };
}

export const spatialClause = (value) => Array.isArray(value) ? boundingBoxClause(value) : polygonClause(value);
