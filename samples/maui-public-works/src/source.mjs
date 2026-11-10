import { displaySnapshot, snapshotFeatures } from '../../../shared/state-local/display-snapshot.mjs';
import { HonuaClient } from '@honua/sdk-js';
import { sourceBinding } from '../../../shared/state-local/binding.mjs';
import { collectFeatures } from '../../../shared/state-local/features.mjs';
import { wgs84Geometry } from '../../../shared/state-local/geometry.mjs';
import { bridgeRecord, exerciseRecord } from './records.mjs';

export function bindings(search) {
  const params = new URLSearchParams(search);
  const read = (prefix) => sourceBinding(new URLSearchParams({ baseUrl: params.get('baseUrl') ?? 'https://demo.honua.io',
    ...(params.has(`${prefix}Service`) ? { service: params.get(`${prefix}Service`) } : {}),
    ...(params.has(`${prefix}Layer`) ? { layer: params.get(`${prefix}Layer`) } : {}) }));
  const orders = read('order');
  const inspections = read('inspection');
  const bridges = read('bridge');
  if (![orders, inspections, bridges].some(Boolean)) return null;
  if (![orders, inspections, bridges].every(Boolean)) throw new Error('Connect all three layers from the approved import receipts: orders, inspections and bridges');
  return { orders, inspections, bridges };
}

async function readExercise(binding, kind) {
  const client = new HonuaClient({ baseUrl: binding.baseUrl });
  return collectFeatures(client, binding, (feature) => {
    const properties = exerciseRecord(feature.attributes);
    if (properties.record_type !== kind) throw new Error(`Expected ${kind} records`);
    return { type: 'Feature', id: properties.record_id, properties, geometry: wgs84Geometry(feature.geometry) };
  });
}

async function readBridges(binding) {
  const client = new HonuaClient({ baseUrl: binding.baseUrl });
  const metadata = await client.getLayerMetadata(binding.serviceId, binding.layerId);
  if (!metadata.description?.includes('Data vintage 2025-06-20')) throw new Error('Bridge layer is missing its verified 2025-06-20 vintage. Re-import with the current pipeline');
  return collectFeatures(client, binding, (feature) => {
    const properties = bridgeRecord(feature.attributes);
    const geometry = wgs84Geometry(feature.geometry);
    if (geometry.type !== 'Point') throw new Error('NBI bridge inventory needs point geometry');
    return { type: 'Feature', id: properties.record_id, properties, geometry };
  });
}

async function displayInventory() {
  const normalize = async (name, validator) => (await snapshotFeatures(name)).map((feature) => {
    const properties = validator(feature.properties);
    return { ...feature, id: properties.record_id, properties, geometry: wgs84Geometry(feature.geometry) };
  });
  const [orders, inspections, bridges] = await Promise.all([
    normalize('maui-demo-work-orders', exerciseRecord), normalize('maui-demo-inspections', exerciseRecord),
    normalize('maui-bridges', bridgeRecord),
  ]);
  return { orders, inspections, bridges };
}

export async function loadInventory(source) {
  if (displaySnapshot) return displayInventory();
  const [orders, inspections, bridges] = await Promise.all([
    readExercise(source.orders, 'work_order'), readExercise(source.inspections, 'inspection'), readBridges(source.bridges) ]);
  if (new Set([...orders, ...inspections].map(({ properties }) => properties.scenario_date)).size > 1) throw new Error('Exercise layers have different scenario dates');
  return { orders, inspections, bridges };
}
