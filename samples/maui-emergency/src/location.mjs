import { geoServicesToGeoJson } from '@honua/sdk-js/geometry';

export function zoneGeometry(geometry) {
  if (geometry?.spatialReference?.wkid && ![4326, 4269].includes(geometry.spatialReference.wkid)) throw new Error('Zone geometry must be WGS84');
  const geojson = ['Polygon', 'MultiPolygon'].includes(geometry?.type);
  const rings = geometry?.type === 'Polygon' ? geometry.coordinates : geometry?.type === 'MultiPolygon' ? geometry.coordinates.flat() : geometry?.rings;
  if (!Array.isArray(rings) || !rings.length || rings.some((ring) => !Array.isArray(ring) || ring.length < 4
    || ring.some((p) => !Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)
    || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) throw new Error('Invalid zone polygon');
  const result = geojson ? geometry : geoServicesToGeoJson(geometry);
  if (!['Polygon', 'MultiPolygon'].includes(result?.type)) throw new Error('Invalid zone polygon');
  return result;
}
export function containsPoint([x, y], geometry) {
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((coordinates) => containsPoint([x, y], { type: 'Polygon', coordinates }));
  let inside = false;
  for (const ring of geometry.coordinates) for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-12 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}
export function parseLocation(value) {
  const parts = value.trim().split(',').map((part) => part.trim());
  if (parts.length !== 2 || parts.some((part) => !/^-?\d+(?:\.\d+)?$/.test(part))) throw new Error('Enter latitude, longitude, for example 20.89, -156.47');
  const [lat, lon] = parts.map(Number);
  if (lat < 20.45 || lat > 21.25 || lon < -157.4 || lon > -155.95) throw new Error('Choose a location within the Maui exercise area');
  return [lon, lat];
}
export function nearestShelter(point, records) {
  const rad = Math.PI / 180;
  return records.filter(({ properties: p }) => p.record_type === 'exercise_shelter' && p.status !== 'exercise_closed')
    .map((feature) => {
      const [lon, lat] = feature.geometry.coordinates;
      const a = Math.sin((lat - point[1]) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(point[1] * rad) * Math.sin((lon - point[0]) * rad / 2) ** 2;
      return { feature, km: 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) };
    }).sort((a, b) => a.km - b.km)[0];
}
