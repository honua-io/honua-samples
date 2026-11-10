function geojsonGeometry(geometry) {
  if (geometry?.type === 'Point') return geojsonGeometry({ x: geometry.coordinates?.[0], y: geometry.coordinates?.[1] });
  if (geometry?.type === 'LineString') return geojsonGeometry({ paths: [geometry.coordinates] });
  if (geometry?.type === 'MultiLineString') return geojsonGeometry({ paths: geometry.coordinates });
  if (geometry && Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) {
    return { type: 'Point', coordinates: [geometry.x, geometry.y] };
  }
  if (geometry?.paths?.length && geometry.paths.every((path) => Array.isArray(path) && path.length >= 2)) return { type: 'MultiLineString', coordinates: geometry.paths };
  throw new Error('Exercise request needs a road line or point geometry in WGS84');
}

export function positions(geometry) {
  return geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates.flat();
}

export function wgs84Geometry(value) {
  const geometry = geojsonGeometry(value);
  if (positions(geometry).some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90)) {
    throw new Error('Exercise geometry is outside WGS84 bounds');
  }
  return geometry;
}
