import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sources } from '../state-local/sources.mjs';
import { cleanRows } from '../state-local/clean.mjs';
import { ensureDepartments, departments } from '../state-local/departments.mjs';
import { fetchSnapshot, readSnapshot } from '../state-local/snapshot.mjs';
import { readMauiSnapshot } from '../state-local/maui-snapshot.mjs';
import { stageSnapshot, stagingServiceName, stagingTableName } from '../state-local/import.mjs';

test('staging service names fit the server limit without truncating run identity', () => {
  const runId = 'f'.repeat(32);
  const name = stagingServiceName('maui-fire-stations', runId);
  assert.ok(name.length <= 64);
  assert.ok(!name.includes('--'));
  assert.ok(name.endsWith(`-${runId}`));
  assert.match(name, /^[a-z0-9-]+$/);
});

const response = (body) => new Response(JSON.stringify(body));
const metadata = { name: 'Maui roads', fields: [{ name: 'objectid', type: 'esriFieldTypeOID' }],
  extent: { spatialReference: { wkid: 102202, latestWkid: 3750 } } };
const feature = (id) => ({ type: 'Feature', properties: { objectid: id, fullname: `Road ${id}`, owner: 'excluded' },
  geometry: { type: 'LineString', coordinates: [[-156.5, 20.8], [-156.49, 20.81]] } });

async function directory(t) {
  const value = await mkdtemp(path.join(os.tmpdir(), 'honua-maui-'));
  t.after(() => rm(value, { recursive: true, force: true }));
  return value;
}

function sourceFetch(t, overrides = {}) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    requests.push(url);
    if (url.pathname.endsWith('/query')) {
      if (url.searchParams.has('returnIdsOnly')) return response(overrides.selection ?? { objectIds: Array.from({ length: 101 }, (_, i) => i + 1) });
      const ids = url.searchParams.get('objectIds').split(',').map(Number);
      return response(overrides.page ?? { type: 'FeatureCollection', features: ids.map(feature) });
    }
    if (url.searchParams.get('f') === 'json') return response(overrides.metadata ?? metadata);
    if (url.pathname.endsWith('.pdf')) return new Response('source summary');
    return new Response(overrides.policy ?? 'The contents of this web page are public domain');
  });
  return requests;
}

test('Maui pagination preserves all selected IDs, explicit reprojection and attribution', async (t) => {
  const output = await directory(t);
  const requests = sourceFetch(t);
  const receipt = await fetchSnapshot('maui-roads', output);
  const snapshot = await readSnapshot('maui-roads', output);
  assert.equal(snapshot.geojson.features.length, 101);
  assert.equal(snapshot.geojson.features.at(-1).id, '101');
  assert.equal(snapshot.geojson.features[0].properties.owner, undefined);
  assert.deepEqual(receipt.sourceCrs, { wkid: 102202, latestWkid: 3750 });
  assert.equal(receipt.outputCrs, 'EPSG:4326');
  assert.equal(receipt.license, 'public-domain');
  assert.match(receipt.attribution, /County of Maui/);
  assert.equal(receipt.selection.completeDataset, false);
  const pages = requests.filter((url) => url.searchParams.has('objectIds'));
  assert.deepEqual(pages.map((url) => url.searchParams.get('objectIds').split(',').length), [100, 1]);
  assert.ok(pages.every((url) => url.searchParams.get('outSR') === '4326'));
  assert.ok(pages.every((url) => url.searchParams.get('maxAllowableOffset') === '0.00002' && !url.searchParams.has('geometryPrecision')));
  assert.equal(receipt.displayGeometry.maxAllowableOffset, 0.00002);
  assert.match(receipt.displayGeometry.warning, /not legal boundaries/);
});

test('Maui zoning retains narrow polygon coordinates without decimal quantization', async (t) => {
  const output = await directory(t);
  const coordinates = [[-156.32934949752473, 20.821258123441],
    [-156.32935570852428, 20.821258234709205], [-156.3293516922591, 20.821257931040343],
    [-156.32934949752473, 20.821258123441]];
  const requests = sourceFetch(t, { selection: { objectIds: [3255] },
    page: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { objectid: 3255 },
      geometry: { type: 'Polygon', coordinates: [coordinates] } }] } });
  await fetchSnapshot('maui-zoning', output);
  const snapshot = await readSnapshot('maui-zoning', output);
  const ring = snapshot.geojson.features[0].geometry.coordinates[0];
  assert.deepEqual(ring, coordinates);
  const [a, b, c] = ring;
  assert.notEqual((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]), 0);
  assert.ok(requests.filter((url) => url.searchParams.has('objectIds'))
    .every((url) => !url.searchParams.has('geometryPrecision')));
});

test('Maui rejects changed terms and unknown native CRS before accepting a snapshot', async (t) => {
  const output = await directory(t);
  sourceFetch(t, { policy: 'All rights reserved' });
  await assert.rejects(fetchSnapshot('maui-roads', output), /terms changed/);
  t.mock.restoreAll();
  sourceFetch(t, { metadata: { ...metadata, extent: {} } });
  await assert.rejects(fetchSnapshot('maui-roads', output), /Unexpected source CRS/);
});

test('Maui rejects duplicate or truncated ID selections and incomplete pages', async (t) => {
  const output = await directory(t);
  for (const selection of [{ objectIds: [1, 1] }, { objectIds: [1], exceededTransferLimit: true }, { objectIds: ['1'] }]) {
    sourceFetch(t, { selection });
    await assert.rejects(fetchSnapshot('maui-roads', output), /ID selection/);
    t.mock.restoreAll();
  }
  for (const page of [{ type: 'FeatureCollection', features: [] },
    { type: 'FeatureCollection', features: [feature(1)], exceededTransferLimit: true },
    { type: 'FeatureCollection', features: [feature(1)], crs: { properties: { name: 'EPSG:3857' } } }]) {
    sourceFetch(t, { selection: { objectIds: [1] }, page });
    await assert.rejects(fetchSnapshot('maui-roads', output), /missing|untruncated/);
    t.mock.restoreAll();
  }
});

test('Maui detects source inventory changes during download', async (t) => {
  const output = await directory(t);
  let selections = 0;
  const original = sourceFetch(t);
  const mockedFetch = globalThis.fetch;
  globalThis.fetch = async (input) => new URL(input).searchParams.has('returnIdsOnly')
    ? response({ objectIds: ++selections === 1 ? [1] : [1, 2] }) : mockedFetch(input);
  await assert.rejects(fetchSnapshot('maui-roads', output), /changed during download/);
  assert.ok(original.length > 0);
});

test('Maui checksum and query provenance are verified before any server import', async (t) => {
  const output = await directory(t);
  sourceFetch(t);
  await fetchSnapshot('maui-roads', output);
  for (const suffix of ['raw', 'geojson', 'metadata', 'policy', 'summary']) {
    const file = path.join(output, `maui-roads.${suffix}`);
    const original = await readFile(file);
    await writeFile(file, Buffer.concat([original, Buffer.from('corrupt')]));
    await assert.rejects(readSnapshot('maui-roads', output), /checksum mismatch/);
    await writeFile(file, original);
  }
  const file = path.join(output, 'maui-roads.receipt.json');
  const original = JSON.parse(await readFile(file, 'utf8'));
  for (const changed of [{ requests: ['https://example.test/unrelated'] }, { department: 'wrong' },
    { outputCrs: 'EPSG:3857' }, { displayGeometry: {} }, { selectedIds: [1] }, { retrievedAt: 'invalid' }]) {
    await writeFile(file, JSON.stringify({ ...original, ...changed }));
    await assert.rejects(readSnapshot('maui-roads', output), /provenance mismatch/);
  }
});

test('SR-02/SR-03: 468 fictional requests cover twelve weeks with labels, joins and anchor checksum', async (t) => {
  const output = await directory(t);
  sourceFetch(t);
  await fetchSnapshot('maui-roads', output);
  await fetchSnapshot('maui-demo-requests', output);
  const snapshot = await readSnapshot('maui-demo-requests', output);
  assert.equal(snapshot.geojson.features.length, 468);
  assert.equal(new Set(snapshot.geojson.features.map(({ properties }) => properties.opened_at)).size, 84);
  for (const { properties } of snapshot.geojson.features) {
    assert.ok(Date.parse(properties.opened_at) <= Date.parse(`${properties.scenario_date}T23:59:59.999Z`));
    if (properties.closed_at) assert.ok(Date.parse(properties.closed_at) <= Date.parse(`${properties.scenario_date}T23:59:59.999Z`));
    assert.equal(properties.is_demo, true);
    assert.equal(properties.exercise_only, true);
    assert.equal(properties.data_origin, 'synthetic_demo');
    assert.match(properties.display_label, /DEMO DATA/);
    assert.match(properties.operational_use, /Not a real/);
    assert.equal(properties.asset_id, `maui-roads:${properties.anchor_feature_id}`);
  }
  assert.equal(snapshot.receipt.license, 'CC0-1.0');
  const file = path.join(output, 'maui-demo-requests.geojson');
  const edited = JSON.parse(await readFile(file, 'utf8'));
  edited.features[0].properties.is_demo = false;
  await writeFile(file, JSON.stringify(edited));
  await assert.rejects(readSnapshot('maui-demo-requests', output), /anchor provenance mismatch/);
});

test('PW-03: fictional work orders cover 34 records and all five exercise stages', async (t) => {
  const output = await directory(t);
  sourceFetch(t);
  await fetchSnapshot('maui-roads', output);
  await fetchSnapshot('maui-demo-work-orders', output);
  const { geojson } = await readSnapshot('maui-demo-work-orders', output);
  assert.equal(geojson.features.length, 34);
  assert.equal(new Set(geojson.features.map(({ properties }) => properties.status)).size, 5);
  for (const { properties } of geojson.features) {
    assert.equal(properties.closed_at !== null, properties.status === 'exercise_closed');
  }
});

test('PRM-04: fictional permit records are unavailable', async (t) => {
  await assert.rejects(fetchSnapshot('maui-demo-permits', await directory(t)), /Unknown source/);
});

test('all source identifiers retain full run identity within publication and PostgreSQL limits', () => {
  const runId = 'f'.repeat(32);
  const readableNames = new Set();
  for (const name of Object.keys(sources)) {
    const service = stagingServiceName(name, runId);
    const readable = service.slice(0, -runId.length - 1);
    assert.ok(!readableNames.has(readable), name);
    readableNames.add(readable);
    const table = stagingTableName(name, runId);
    assert.ok(service.length <= 64, name);
    assert.ok(table.length <= 63, name);
    assert.match(service, /^[a-z][a-z0-9-]+$/);
    assert.match(table, /^[a-z][a-z0-9_]+$/);
    assert.ok(service.endsWith(runId));
    assert.ok(table.endsWith(runId));
  }
});

test('whole intersecting Maui features may extend beyond the query envelope', () => {
  const row = { ':id': '1', the_geom: { type: 'LineString', coordinates: [[-156.5, 20.8], [-158, 21.5]] } };
  assert.equal(cleanRows([row], sources['maui-roads']).rejected, 0);
  row.the_geom.coordinates[1] = [10, 40];
  assert.equal(cleanRows([row], sources['maui-roads']).rejected, 1);
});

test('department creation skips active titles, replaces deleted titles and sends the listing ETag', async (t) => {
  const writes = [];
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    if (request.method === 'GET') return new Response(JSON.stringify({ data: [
      { metadata: { title: 'Planning' }, deleted: false },
      { metadata: { title: 'Public Works' }, deleted: true },
    ] }), { headers: { ETag: '"version-1"' } });
    writes.push(request);
    return response({ success: true });
  });
  await ensureDepartments({ baseUrl: 'https://example.test', adminApiKey: 'test' });
  assert.deepEqual(writes.map(({ body }) => JSON.parse(body)), departments.slice(1));
  assert.ok(writes.every(({ headers }) => headers['If-Match'] === '"version-1"'));
});

test('department creation refuses an unversioned listing before writing', async (t) => {
  const methods = [];
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    methods.push(request.method);
    return response({ data: [] });
  });
  await assert.rejects(ensureDepartments({ baseUrl: 'https://example.test', adminApiKey: 'test' }), /concurrency ETag/);
  assert.deepEqual(methods, ['GET']);
});

test('NBI snapshot preserves real ratings and vintage with an explicit Maui county selection', async (t) => {
  const output = await directory(t);
  const bridge = { type: 'Feature', properties: { objectid: 1, county_code_003: '009',
    structure_number_008: 'TEST-BRIDGE', deck_cond_058: '7', superstructure_cond_059: '6',
    substructure_cond_060: '5', culvert_cond_062: 'N', bridge_condition: 'F', date_of_inspect_090: '624' },
    geometry: { type: 'Point', coordinates: [-156.5, 20.8] } };
  const requests = sourceFetch(t, { metadata: { ...metadata, description: 'NBI as of June 20, 2025' },
    selection: { objectIds: [1] },
    page: { type: 'FeatureCollection', features: [bridge] } });
  const receipt = await fetchSnapshot('maui-bridges', output);
  const snapshot = await readSnapshot('maui-bridges', output);
  assert.equal(receipt.dataVintage, '2025-06-20');
  assert.equal(receipt.selection.where, "county_code_003 = '009'");
  assert.match(receipt.selection.kind, /^Attribute filter and/);
  assert.match(receipt.attribution, /Federal Highway Administration/);
  assert.match(receipt.metadataUrl, /bridges_nbi.html$/);
  const selections = requests.filter((url) => url.searchParams.has('returnIdsOnly'));
  assert.equal(selections.length, 2);
  assert.ok(selections.every((url) => url.searchParams.get('where') === "county_code_003 = '009'"));
  assert.deepEqual(snapshot.geojson.features[0].properties, bridge.properties);
  await assert.rejects(readMauiSnapshot({ name: 'maui-bridges', directory: output,
    source: { ...sources['maui-bridges'], vintageStatement: 'as of June 20, 2026' } }), /Source vintage changed/);
  let published;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/folders')) return new Response(JSON.stringify({ data: [{ metadata: { id: 'works-folder', title: 'Public Works' } }] }), { headers: { ETag: '"version-1"' } });
    if (url.endsWith('/import/upload')) return response({ featureCount: 1, physicalTableName: 'nbi_fixture', schema: 'honua_data' });
    published = JSON.parse(options.body);
    return response({ success: true, data: { layerId: 7, enabled: false } });
  };
  await stageSnapshot({ baseUrl: 'https://server.test', adminApiKey: 'test-key' },
    { name: 'maui-bridges', directory: output, connection: 'managed' });
  assert.match(published.description, /Data vintage 2025-06-20/);
  const receiptFile = path.join(output, 'maui-bridges.receipt.json');
  for (const changed of [{ dataVintage: '2026-01-01' }, { selection: { ...receipt.selection, where: '1=1' } }]) {
    await writeFile(receiptFile, JSON.stringify({ ...receipt, ...changed }));
    await assert.rejects(readSnapshot('maui-bridges', output), /provenance mismatch/);
  }
});

test('NBI refuses an unrecognized source vintage before downloading rows', async (t) => {
  const output = await directory(t);
  const requests = sourceFetch(t, { metadata: { ...metadata, description: 'NBI as of June 20, 2026' } });
  await assert.rejects(fetchSnapshot('maui-bridges', output), /Source vintage changed/);
  assert.ok(requests.every((url) => !url.pathname.endsWith('/query')));
});

test('NBI rejects a vintage change during download', async (t) => {
  const output = await directory(t);
  sourceFetch(t, { metadata: { ...metadata, description: 'NBI as of June 20, 2025' } });
  const mockedFetch = globalThis.fetch;
  let metadataRequests = 0;
  globalThis.fetch = async (input) => {
    if (new URL(input).searchParams.get('f') === 'json' && !new URL(input).pathname.endsWith('/query')) {
      return response({ ...metadata, description: ++metadataRequests === 1
        ? 'NBI as of June 20, 2025' : 'NBI as of June 20, 2026' });
    }
    return mockedFetch(input);
  };
  await assert.rejects(fetchSnapshot('maui-bridges', output), /changed during download/);
  assert.equal(metadataRequests, 2);
});
