import { HonuaClient } from '@honua/sdk-js';
import { validateRecord } from './records.mjs';

const PAGE_SIZE = 200;
const MAX_RECORDS = 10_000;

export function sourceBinding(search) {
  const params = new URLSearchParams(search);
  const serviceId = params.get('service');
  const layer = params.get('layer');
  if (!serviceId && !layer) return null;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(serviceId ?? '') || !/^\d{1,9}$/.test(layer ?? '')) {
    throw new Error('Use the service and numeric layer from the approved deployment receipt');
  }
  const url = new URL(params.get('baseUrl') ?? 'https://demo.honua.io');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!local && url.origin !== 'https://demo.honua.io') || !['http:', 'https:'].includes(url.protocol)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Connect to demo.honua.io or a disposable localhost server');
  }
  return { baseUrl: url.origin, serviceId, layerId: Number(layer) };
}

function geojsonGeometry(geometry) {
  if (geometry && Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) {
    return { type: 'Point', coordinates: [geometry.x, geometry.y] };
  }
  if (geometry?.paths?.length && geometry.paths.every((path) => Array.isArray(path) && path.length >= 2)) return { type: 'MultiLineString', coordinates: geometry.paths };
  throw new Error('Exercise request needs a road line or point geometry in WGS84');
}

export function requestFeature(feature) {
  const geometry = geojsonGeometry(feature.geometry);
  const positions = geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates.flat();
  if (positions.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90)) {
    throw new Error('Exercise geometry is outside WGS84 bounds');
  }
  return { type: 'Feature', id: feature.attributes?.record_id, geometry, properties: validateRecord(feature.attributes) };
}

export async function loadRequests(binding) {
  return collectRequests(new HonuaClient({ baseUrl: binding.baseUrl }), binding);
}

export async function collectRequests(client, binding) {
  const query = { serviceId: binding.serviceId, layerId: binding.layerId, where: '1=1', method: 'GET' };
  const count = (await client.queryFeatures({ ...query, extraParams: { returnCountOnly: true } })).count;
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_RECORDS) throw new Error('Request count is missing or exceeds the 10,000-record demo limit');
  const records = [];
  for (let offset = 0; offset < count; offset += PAGE_SIZE) {
    const result = await client.queryFeatures({ ...query, outFields: ['*'], returnGeometry: true, outSr: 4326,
      orderByFields: 'objectid ASC', resultOffset: offset, resultRecordCount: PAGE_SIZE });
    if (!Array.isArray(result.features) || !result.features.length) throw new Error('Request pagination ended before the reported count');
    records.push(...result.features.map(requestFeature));
  }
  const ids = new Set(records.map((feature) => feature.id));
  const dates = new Set(records.map(({ properties }) => properties.asOf));
  const finalCount = (await client.queryFeatures({ ...query, extraParams: { returnCountOnly: true } })).count;
  if (records.length !== count || finalCount !== count || ids.size !== count || dates.size > 1) {
    throw new Error('Request data changed or pagination repeated records. Refresh to try again');
  }
  return records;
}
