import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sha256 } from '../lib/checksum.mjs';
import { fetchMauiSnapshot } from '../state-local/maui-snapshot.mjs';
import { islandSources } from '../state-local/approved/sources.mjs';
import { readIslandSnapshot } from '../state-local/approved/island-snapshot.mjs';
import { readIslandDeployment, stageIsland } from '../state-local/approved/stage-island.mjs';

async function snapshot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'honua-island-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = { name: 'roads', directory: path.join(root, 'prepared'), sourceDirectory: path.join(root, 'sources') };
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    let body;
    if (url.pathname.endsWith('/query')) {
      body = url.searchParams.has('returnIdsOnly') ? { objectIds: [19] }
        : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { objectid: 19 },
          geometry: { type: 'LineString', coordinates: [[-156.5, 20.8], [-156.49, 20.81]] } }] };
    } else if (url.searchParams.get('f') === 'json') {
      body = { name: 'Maui roads', fields: [{ name: 'objectid', type: 'esriFieldTypeOID' }],
        extent: { spatialReference: { latestWkid: 3750 } } };
    } else return new Response('The contents of this web page are public domain');
    return new Response(JSON.stringify(body));
  });
  const original = await fetchMauiSnapshot({ name: options.name, directory: options.sourceDirectory, source: islandSources.roads });
  t.mock.restoreAll();
  const collection = JSON.parse(await readFile(path.join(options.sourceDirectory, 'roads.geojson'), 'utf8'));
  collection.features[0].properties.source_objectid = 19;
  collection.features[0].properties.source_part = 0;
  const bytes = JSON.stringify(collection);
  const manifest = { schemaVersion: 1, crs: 'EPSG:4326', layers: { roads: { sourceSha256: original.cleanSha256,
    cleanSha256: sha256(bytes), bytes: Buffer.byteLength(bytes), outputFeatures: 1,
    engine: { shapely: '2.1.2', geos: 'test-engine' } } } };
  await mkdir(options.directory);
  await writeFile(path.join(options.directory, 'roads.geojson'), bytes);
  await writeFile(path.join(options.directory, 'manifest.json'), JSON.stringify(manifest));
  return { options, collection, manifest };
}

test('prepared island snapshots retain verified source attribution and both checksum chains', async (t) => {
  const { options } = await snapshot(t);
  const result = await readIslandSnapshot(options);
  assert.equal(result.geojson.features[0].properties.source_objectid, 19);
  assert.equal(result.receipt.license, 'public-domain');
  assert.equal(result.receipt.preparation.cleanSha256, result.receipt.cleanSha256);
  assert.match(result.receipt.selection.kind, /subdivision/);
});

test('prepared island snapshots reject changed bytes, source identities and engine receipts', async (t) => {
  const { options, collection, manifest } = await snapshot(t);
  const filename = path.join(options.directory, 'roads.geojson');
  const original = await readFile(filename);
  await writeFile(filename, Buffer.concat([original, Buffer.from(' ')]));
  await assert.rejects(readIslandSnapshot(options), /checksum/);
  collection.features[0].properties.source_objectid = 20;
  const changed = JSON.stringify(collection);
  await writeFile(filename, changed);
  Object.assign(manifest.layers.roads, { cleanSha256: sha256(changed), bytes: Buffer.byteLength(changed) });
  await writeFile(path.join(options.directory, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(readIslandSnapshot(options), /source identities/);
  manifest.layers.roads.engine.shapely = 'unknown';
  await writeFile(path.join(options.directory, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(readIslandSnapshot(options), /checksum/);
});

test('island staging preflights every snapshot before creating any server resources', async (t) => {
  const { options } = await snapshot(t);
  t.mock.method(globalThis, 'fetch', () => assert.fail('incomplete snapshots must not reach the server'));
  await assert.rejects(stageIsland({ baseUrl: 'https://server.test' }, { ...options,
    connection: 'managed', deploymentDirectory: path.join(options.directory, 'deployments') }), /ENOENT/);
});

test('resumed island deployments refuse an enabled layer', async (t) => {
  const { options } = await snapshot(t);
  const receipt = { source: 'roads', baseUrl: 'https://server.test', connection: 'managed',
    cleanSha256: 'checksum', serviceName: 'roads', layerId: 1, schema: 'public', table: 'roads', folderId: 'works' };
  await writeFile(path.join(options.directory, 'roads.deployment.json'), JSON.stringify(receipt));
  t.mock.method(globalThis, 'fetch', async (url) => Response.json({ data: { items: url.includes('/services/?q=')
    ? [{ ...receipt, folderName: 'Public Works', publicName: 'roads' }]
    : [{ ...receipt, enabled: true, description: 'SHA-256 checksum' }] } }));
  await assert.rejects(readIslandDeployment({ baseUrl: receipt.baseUrl }, { name: 'roads',
    directory: options.directory, connection: receipt.connection, cleanSha256: receipt.cleanSha256 }), /remain disabled/);
});
