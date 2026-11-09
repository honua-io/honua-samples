import { readFile } from 'node:fs/promises';
import { HonuaClient } from '@honua/sdk-js';

const scenarios = JSON.parse(await readFile(new URL('./scenarios.json', import.meta.url), 'utf8'));
const scenario = scenarios[process.argv[2]];
if (!scenario) throw new Error('Choose property, emergency, 311 or public-works');
const baseUrl = process.env.HONUA_BASE_URL;
const serviceId = process.env.HONUA_SERVICE_ID;
const layerId = Number(process.env.HONUA_LAYER_ID);
if (!baseUrl || !serviceId || !/^\d+$/.test(process.env.HONUA_LAYER_ID ?? '') || !Number.isSafeInteger(layerId)) {
  throw new Error('Set HONUA_BASE_URL, HONUA_SERVICE_ID and a non-negative numeric HONUA_LAYER_ID');
}
const client = new HonuaClient({ baseUrl });
const result = await client.queryFeatures({ serviceId, layerId, where: scenario.where,
  outFields: ['*'], returnGeometry: true, outSr: 4326, resultRecordCount: 20, method: 'GET' });
if (!Array.isArray(result.features)) throw new Error('Query omitted features');
for (const feature of result.features) {
  const row = feature.attributes;
  if (scenario.exercise && (row?.data_origin !== 'synthetic_demo' || row.is_demo !== true
    || row.exercise_only !== true || !row.display_label?.includes('DEMO DATA'))) {
    throw new Error('Exercise record is missing its DEMO DATA provenance');
  }
}
console.log(JSON.stringify({ source: `${baseUrl.replace(/\/$/, '')}/rest/services/${encodeURIComponent(serviceId)}/FeatureServer/${layerId}`,
  scenario: process.argv[2], limit: 20, completeDataset: false, features: result.features }));
