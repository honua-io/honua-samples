import { HonuaClient } from '@honua/sdk-js';
import { validateRecord } from './records.mjs';
import { collectFeatures } from '../../../shared/state-local/features.mjs';
import { wgs84Geometry } from '../../../shared/state-local/geometry.mjs';
export { sourceBinding } from '../../../shared/state-local/binding.mjs';
export { positions } from '../../../shared/state-local/geometry.mjs';

export function requestFeature(feature) {
  return { type: 'Feature', id: feature.attributes?.record_id,
    geometry: wgs84Geometry(feature.geometry), properties: validateRecord(feature.attributes) };
}

export async function loadRequests(binding) {
  return collectRequests(new HonuaClient({ baseUrl: binding.baseUrl }), binding);
}

export async function collectRequests(client, binding) {
  const records = await collectFeatures(client, binding, requestFeature);
  if (new Set(records.map(({ properties }) => properties.asOf)).size > 1) {
    throw new Error('Request data changed or pagination repeated records. Refresh to try again');
  }
  return records;
}
