const defaultImportLimits = { vertices: 10_000, rings: 100 };

function vertexCount(coordinates) {
  return Array.isArray(coordinates[0])
    ? coordinates.reduce((total, child) => total + vertexCount(child), 0) : 1;
}

function ringCount(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates.length;
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce((total, polygon) => total + polygon.length, 0);
  }
  return 0;
}

// This checks the pinned default server's size limits, not topology or repair outcomes.
export function assertDefaultImportGeometry(geojson) {
  for (const feature of geojson.features) {
    const vertices = vertexCount(feature.geometry.coordinates);
    const rings = ringCount(feature.geometry);
    if (vertices > defaultImportLimits.vertices || rings > defaultImportLimits.rings) {
      throw new Error(`Source feature ${feature.id ?? feature.properties?.objectid ?? "unknown"} exceeds default import geometry limits: ${vertices} vertices (maximum ${defaultImportLimits.vertices}), ${rings} rings (maximum ${defaultImportLimits.rings}). Resolve geometry or the supported server import contract before staging; no features were discarded.`);
    }
  }
}
