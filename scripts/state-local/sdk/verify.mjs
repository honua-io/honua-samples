import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adminFetch, serverEnv } from '../../lib/admin-api.mjs';
import { ensureConnection } from '../../lib/sample-connection.mjs';
import { layersPath, uploadSnapshotTable } from '../import.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const scenarios = JSON.parse(await readFile(new URL('./scenarios.json', import.meta.url), 'utf8'));
const name = process.argv[2];
const scenario = scenarios[name];
if (!scenario) throw new Error('Choose property, emergency, 311 or public-works');
const env = serverEnv();
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.baseUrl).hostname)) {
  throw new Error('SDK contract fixture imports are restricted to a disposable localhost server');
}

function fixture() {
  const kinds = { emergency: 'exercise_shelter', '311': 'service_request', 'public-works': 'work_order' };
  return { type: 'FeatureCollection', features: ['exercise_open', 'exercise_closed', 'exercise_scheduled'].map((status, index) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [-156.47 + index * 0.001, 20.88] },
    properties: { record_id: `sdk-${index + 1}`, record_type: kinds[name] ?? 'test_zoning',
      status, zone_code: index === 1 ? null : 'TEST_ONLY', data_origin: 'synthetic_demo',
      is_demo: true, exercise_only: true, display_label: 'DEMO DATA — synthetic SDK contract fixture' },
  })) };
}

async function importFixture() {
  const connection = process.env.HONUA_SAMPLE_CONNECTION ?? 'local';
  await ensureConnection(env, connection);
  const serviceName = `sdk-${name}-${randomUUID().replaceAll('-', '')}`;
  const imported = await uploadSnapshotTable(env, { tableName: `sdk_${randomUUID().replaceAll('-', '')}`, geojson: fixture() });
  const published = await adminFetch(env, { method: 'POST', apiPath: layersPath(connection), body: {
    schema: imported.schema ?? 'honua_data', table: imported.physicalTableName,
    layerName: 'DEMO DATA SDK contract fixture', serviceName, srid: 4326, enabled: true } });
  assert.equal(published.data?.enabled, true, 'SDK fixture publication must confirm enablement');
  assert.ok(Number.isSafeInteger(published.data.layerId), 'SDK fixture must return a layer ID');
  await adminFetch(env, { method: 'PUT', apiPath: `/api/v1/admin/services/${serviceName}/access-policy`,
    body: { allowAnonymous: true, allowAnonymousWrite: false } });
  return { serviceName, layerId: published.data.layerId };
}

function runSdk(command, args, binding) {
  const child = spawnSync(command, args, { cwd: directory, encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, HONUA_ADMIN_API_KEY: '', HONUA_ADMIN_PASSWORD: '',
      HONUA_SERVICE_ID: binding.serviceName, HONUA_LAYER_ID: String(binding.layerId) } });
  assert.equal(child.status, 0, `${command} failed: ${child.stderr || child.stdout || child.error}`);
  const output = JSON.parse(child.stdout.trim().split('\n').at(-1));
  const expected = name === 'public-works' ? ['sdk-3'] : ['sdk-1', 'sdk-3'];
  assert.deepEqual(output.features.map((feature) => feature.attributes.record_id).sort(), expected,
    `${scenario.requirement} SDK portion: filter must exclude non-matching records`);
  assert.equal(output.scenario, name);
  assert.equal(output.completeDataset, false);
  assert.equal(output.source, `${env.baseUrl}/rest/services/${binding.serviceName}/FeatureServer/${binding.layerId}`);
  for (const feature of output.features) {
    assert.equal(feature.attributes.data_origin, 'synthetic_demo');
    assert.ok([true, 1].includes(feature.attributes.is_demo), 'is_demo must remain affirmative');
    assert.ok([true, 1].includes(feature.attributes.exercise_only), 'exercise_only must remain affirmative');
    assert.match(feature.attributes.display_label, /DEMO DATA/);
    assert.ok(feature.geometry, 'SDK portion: query must return geometry');
  }
  console.log(`PASS ${scenario.requirement} SDK portion: ${name}; ${command}; anonymous filter, geometry and DEMO DATA markers`);
}

const binding = await importFixture();
runSdk(process.execPath, ['query.mjs', name], binding);
runSdk(process.env.HONUA_SAMPLE_PYTHON ?? 'python3', ['query.py', name], binding);
runSdk('dotnet', ['run', '--no-restore', '--project', 'StateLocal.csproj', '--', name], binding);
