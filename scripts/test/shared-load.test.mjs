import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadSources, prepare, verifyPlan, runSharedLoad, verifyStagedSource } from '../state-local/shared-load.mjs';
import { saveDeployment } from '../state-local/deployment.mjs';
import { uploadSnapshotTable } from '../state-local/import.mjs';

const json = (body) => new Response(JSON.stringify(body));
const polygon = { type: 'Polygon', coordinates: [[[-156.5, 20.8], [-156.49, 20.8], [-156.49, 20.81], [-156.5, 20.8]]] };

async function prepared(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'honua-shared-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/query')) return json(url.searchParams.has('returnIdsOnly') ? { objectIds: [1] }
      : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { objectid: 1 }, geometry: polygon }] });
    if (url.searchParams.get('f') === 'json') return json({ name: 'Maui source', fields: [{ name: 'objectid', type: 'esriFieldTypeOID' }],
      extent: { spatialReference: { wkid: 102202, latestWkid: 3750 } } });
    return new Response(url.pathname.endsWith('.pdf') ? 'source summary' : 'The contents of this web page are public domain');
  });
  return { directory, plan: await prepare(directory) };
}

test('shared prepare is repeatable and binds every layer byte to the reviewed inventory', async (t) => {
  const { directory, plan } = await prepared(t);
  globalThis.fetch = () => { throw new Error('repeat prepare must not download'); };
  assert.deepEqual(await prepare(directory), plan);
  assert.equal(plan.layers.length, 9);
  assert.ok(plan.reservedBytes < plan.maximumBytes);
  await assert.rejects(verifyPlan(directory, '0'.repeat(64)), /digest/);
  const file = path.join(directory, `${loadSources[0]}.geojson`);
  await writeFile(file, `${await readFile(file, 'utf8')} `);
  await assert.rejects(verifyPlan(directory, plan.planSha256), /checksum/);
});

test('URL imports use the import API and require physical table and exact count receipts', async (t) => {
  const env = { baseUrl: 'https://server.test', adminApiKey: 'private-key' };
  const snapshot = { sourceUrl: 'https://staging.test/snapshot.geojson?signed=private', tableName: 'demo_test',
    geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: polygon }] } };
  let count = 1;
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    assert.equal(new URL(input).pathname, '/api/v1/admin/import/upload-url');
    assert.deepEqual(JSON.parse(options.body), { sourceUrl: snapshot.sourceUrl, fileName: 'snapshot.geojson',
      tableName: 'demo_test', overwriteExisting: false, sourceSrid: 4326, targetSrid: 4326 });
    return json({ featureCount: count, physicalTableName: 'demo_test' });
  });
  assert.equal((await uploadSnapshotTable(env, snapshot)).physicalTableName, 'demo_test');
  count = 0;
  await assert.rejects(uploadSnapshotTable(env, snapshot), /feature count/);
});

test('interrupted shared stage retains intent and refuses to duplicate an import', async (t) => {
  const { directory, plan } = await prepared(t);
  const env = { baseUrl: 'https://server.test', adminApiKey: 'private-key',
    importSourceUrls: Object.fromEntries(plan.layers.map(({name, cleanSha256}) => [name, `https://staging.test/${cleanSha256}/${name}.geojson`])) };
  let uploads = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.hostname === 'staging.test') return new Response(await readFile(path.join(directory, path.basename(url.pathname))));
    if (url.pathname.endsWith('/folders')) return json({ data: ['Planning', 'Public Works', 'Emergency Management', '311']
      .map((title) => ({ metadata: { title, id: title.toLowerCase().replaceAll(' ', '-') } })) });
    if (url.pathname.endsWith('/connections')) return json({ data: { items: [{ name: 'demo-rds', connectionId: 'managed' }] } });
    if (url.pathname.endsWith('/upload-url')) { uploads++; throw new Error('interrupted response'); }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  await assert.rejects(runSharedLoad(env, { action: 'stage', directory, expectedSha256: plan.planSha256 }), /interrupted/);
  const intent = JSON.parse(await readFile(path.join(directory, `${loadSources[0]}.intent.json`), 'utf8'));
  assert.equal(intent.expectedSha256, plan.planSha256);
  assert.match(intent.runId, /^[a-f0-9]{32}$/);
  assert.ok(intent.tableName.includes(intent.runId));
  assert.ok(intent.serviceName.includes(intent.runId));
  await assert.rejects(runSharedLoad(env, { action: 'rollback', directory, expectedSha256: plan.planSha256 }), /Intent without receipt/);
  assert.equal(JSON.stringify(intent).includes('private'), false);
  await assert.rejects(runSharedLoad(env, { action: 'stage', directory, expectedSha256: plan.planSha256 }), { code: 'EEXIST' });
  assert.equal(uploads, 1);
});

test('rollback disables only a verified owned layer and never imports or deletes', async (t) => {
  const { directory, plan } = await prepared(t);
  const env = { baseUrl: 'https://server.test', adminApiKey: 'private-key' };
  const layer = { source: loadSources[0], serviceName: 'owned-service', layerId: 7, schema: 'honua_data',
    table: 'owned_table', folderId: 'planning', enabled: false, cleanSha256: plan.layers[0].cleanSha256 };
  let mutations = 0;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/connections')) return json({ data: [{ name: 'demo-rds', connectionId: 'managed' }] });
    if (url.pathname.endsWith('/services/')) return json({ data: { items: [{ serviceName: layer.serviceName,
      folderId: 'planning', folderName: 'planning', publicName: 'owned' }] } });
    if (options.method !== 'GET') {
      assert.equal(options.method, 'PUT');
      assert.equal(url.pathname, '/api/v1/admin/connections/managed/layers/7/enabled');
      assert.equal(url.searchParams.get('serviceName'), 'owned-service');
      assert.deepEqual(JSON.parse(options.body), { enabled: false });
      mutations++;
      layer.enabled = false;
    }
    return json({ data: { items: [{ ...layer, description: `SHA-256 ${layer.cleanSha256}` }] } });
  };
  await saveDeployment(env, { directory, connection: 'managed', staged: layer });
  layer.enabled = true;
  await runSharedLoad(env, { action: 'rollback', directory, expectedSha256: plan.planSha256 });
  assert.equal(mutations, 1);
  layer.table = 'unrelated_table';
  await assert.rejects(runSharedLoad(env, { action: 'rollback', directory, expectedSha256: plan.planSha256 }), /no longer matches/);
  assert.equal(mutations, 1);
});

test('successful shared stage reuses verified receipts and never repeats imports', async (t) => {
  const { directory, plan } = await prepared(t);
  const env = { baseUrl: 'https://server.test', adminApiKey: 'private-key',
    importSourceUrls: Object.fromEntries(plan.layers.map(({name, cleanSha256}) => [name, `https://staging.test/${cleanSha256}/${name}.geojson`])) };
  const folders = ['Planning', 'Public Works', 'Emergency Management', '311']
    .map((title, index) => ({ metadata: { title, id: `folder-${index}` } }));
  const layers = [];
  let uploads = 0;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.hostname === 'staging.test') return new Response(await readFile(path.join(directory, path.basename(url.pathname))));
    if (url.pathname.endsWith('/folders')) return json({ data: folders });
    if (url.pathname.endsWith('/connections')) return json({ data: [{ name: 'demo-rds', connectionId: 'managed' }] });
    if (url.pathname.endsWith('/upload-url')) {
      uploads++;
      return json({ featureCount: 1, physicalTableName: JSON.parse(options.body).tableName, schema: 'honua_data' });
    }
    if (url.pathname.endsWith('/services/')) return json({ data: { items: layers.map((layer) => ({ ...layer,
      folderName: 'planning', publicName: layer.serviceName })) } });
    assert.equal(url.pathname, '/api/v1/admin/connections/managed/layers');
    if (options.method === 'POST') {
      const layer = { ...JSON.parse(options.body), layerId: layers.length };
      assert.equal(layer.enabled, false);
      layers.push(layer);
      return json({ data: layer });
    }
    return json({ data: { items: layers.filter((layer) => layer.serviceName === url.searchParams.get('serviceName')) } });
  };
  await runSharedLoad(env, { action: 'stage', directory, expectedSha256: plan.planSha256 });
  assert.equal(uploads, 9);
  await runSharedLoad(env, { action: 'stage', directory, expectedSha256: plan.planSha256 });
  assert.equal(uploads, 9);
  assert.ok(layers.every((layer) => layer.enabled === false));
  layers[0].table = 'unrelated_table';
  await assert.rejects(runSharedLoad(env, { action: 'stage', directory, expectedSha256: plan.planSha256 }), /no longer matches/);
  assert.equal(uploads, 9);
});


test('staged bytes must match the reviewed hash and size before import', async (t) => {
  const { directory, plan } = await prepared(t);
  const layer = plan.layers[0];
  const bytes = await readFile(path.join(directory, `${layer.name}.geojson`));
  const url = `https://staging.test/${layer.cleanSha256}/snapshot.geojson`;
  globalThis.fetch = async () => new Response(bytes);
  await verifyStagedSource(layer, url);
  await assert.rejects(verifyStagedSource(layer, 'https://staging.test/mutable.geojson'), /content-addressed/);
  globalThis.fetch = async () => new Response(Buffer.from(bytes.toString().replace('20.8', '20.9')));
  await assert.rejects(verifyStagedSource(layer, url), /checksum/);
  globalThis.fetch = async () => new Response(Buffer.concat([bytes, Buffer.from(' ')]));
  await assert.rejects(verifyStagedSource(layer, url), /reviewed size/);
});
