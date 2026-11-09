import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fetchSnapshot } from '../state-local/snapshot.mjs';
import { activateDeployment, saveDeployment } from '../state-local/deployment.mjs';
import { propertyApp, propertyLayers } from '../state-local/property-app.mjs';

const json = (body) => new Response(JSON.stringify(body));
const polygon = { type: 'Polygon', coordinates: [[[-156.5, 20.8], [-156.49, 20.8], [-156.49, 20.81], [-156.5, 20.8]]] };

test('PRM-05 property URL binds every regulatory source to an active verified deployment without legacy tiles', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'honua-property-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/query')) return json(url.searchParams.has('returnIdsOnly') ? { objectIds: [1] }
      : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { objectid: 1 }, geometry: polygon }] });
    if (url.searchParams.get('f') === 'json') return json({ name: 'Maui source', fields: [{ name: 'objectid', type: 'esriFieldTypeOID' }],
      extent: { spatialReference: { wkid: 102202, latestWkid: 3750 } } });
    return new Response(url.pathname.endsWith('.pdf') ? 'source summary' : 'The contents of this web page are public domain');
  });
  const snapshots = [];
  for (const name of Object.keys(propertyLayers)) snapshots.push(await fetchSnapshot(name, directory));
  const env = { baseUrl: 'https://server.test', adminApiKey: 'private-key' };
  const layers = snapshots.map((receipt, layerId) => ({ source: receipt.source, serviceName: `source-${layerId}`, layerId,
    folderName: 'planning', publicName: `public-${layerId}`, schema: 'honua_data', table: `table_${layerId}`, folderId: 'planning', enabled: false,
    cleanSha256: receipt.cleanSha256, description: `SHA-256 ${receipt.cleanSha256}` }));
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/services/')) return json({ data: { items: layers } });
    const layer = layers.find((item) => item.serviceName === url.searchParams.get('serviceName'));
    assert.ok(layer);
    if (options.method === 'PUT') layer.enabled = true;
    return json({ data: { items: [layer] } });
  };
  for (const staged of layers) {
    await saveDeployment(env, { staged, directory, connection: 'managed' });
    await activateDeployment(env, { name: staged.source, directory });
  }
  const result = await propertyApp(env, directory);
  const url = new URL(result.appUrl);
  assert.equal(result.sources.length, 9);
  assert.equal(url.searchParams.get('parcelTilesUrl'), 'none');
  assert.equal(url.searchParams.get('baseUrl'), env.baseUrl);
  for (const layer of layers) assert.equal(url.searchParams.get(propertyLayers[layer.source]),
    `${env.baseUrl}/rest/services/planning/${layer.publicName}/FeatureServer/${layer.layerId}`);
  assert.equal(result.appUrl.includes(env.adminApiKey), false);
  layers.at(-1).enabled = false;
  await assert.rejects(propertyApp(env, directory), /activation was not confirmed/);
  layers.at(-1).enabled = true;
  layers[0].table = 'replacement';
  await assert.rejects(propertyApp(env, directory), /no longer matches/);
});
