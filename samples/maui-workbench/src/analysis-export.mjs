import { geoServicesGeometryToGeoJSON } from '@honua/sdk-js/geometry';
import { csvCell } from '../../../shared/state-local/csv.mjs';

const MAX_ROWS = 10_000;
const MAX_BYTES = 8 * 1024 * 1024;

export async function collectAnalysisExport(model, query, signal) {
  const count = (await model.source.queryExtent({ ...query, signal })).count;
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_ROWS) {
    throw new Error('Export requires an exact count of at most 10,000 records. Narrow the filter.');
  }
  const features = [];
  const ids = new Set();
  for (let offset = 0; offset <= MAX_ROWS; offset += 200) {
    const page = await model.source.query({ ...query, outFields: model.columns,
      returnGeometry: true, outSr: 4326, orderBy: [{ field: model.identity, direction: 'asc' }],
      pagination: { limit: 200, offset }, signal });
    if (page.degraded?.length) throw new Error('Export stopped: the server could not apply every filter.');
    if (page.features.length > 200) throw new Error('Export stopped: the server exceeded the requested page size.');
    for (const feature of page.features) {
      model.catalog.validateRecord?.(feature.attributes);
      const id = feature.attributes[model.identity];
      if (id == null || ids.has(id)) throw new Error('Export stopped: missing or repeated object IDs.');
      ids.add(id);
      features.push({ type: 'Feature', id, properties: feature.attributes,
        geometry: geoServicesGeometryToGeoJSON(feature.geometry ?? null) });
    }
    if (features.length > MAX_ROWS) throw new Error('Export exceeds 10,000 records. Add a narrower filter.');
    if (new TextEncoder().encode(JSON.stringify(features)).byteLength > MAX_BYTES) {
      throw new Error('Export exceeds 8 MiB. Add a narrower filter.');
    }
    if (!page.exceededTransferLimit) {
      const finalCount = (await model.source.queryExtent({ ...query, signal })).count;
      if (features.length !== count || finalCount !== count) throw new Error('Export stopped: records changed or pagination ended early. Retry.');
      return { type: 'FeatureCollection', features };
    }
    if (page.features.length !== 200) throw new Error('Export stopped: the server returned an incomplete page.');
  }
  throw new Error('Export exceeds 10,000 records. Add a narrower filter.');
}

export function encodeAnalysisExport(collection, columns, format) {
  if (format === 'geojson') return JSON.stringify(collection);
  if (format !== 'csv') throw new Error('Choose CSV or GeoJSON.');
  return [columns.map(csvCell).join(','), ...collection.features.map((feature) =>
    columns.map((field) => csvCell(feature.properties[field])).join(','))].join('\r\n');
}
