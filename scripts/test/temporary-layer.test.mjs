import assert from 'node:assert/strict';
import test from 'node:test';
import { withTemporaryLayer } from '../state-local/deployment.mjs';

const env = { baseUrl: 'https://build.example', adminApiKey: 'private' };

function stagedLayer(t) {
  const receipt = { connection: 'local', serviceName: 'parcels', layerId: 1,
    schema: 'honua_data', table: 'parcels', cleanSha256: 'checksum', folderId: 'planning' };
  const layer = { ...receipt, enabled: false, description: 'SHA-256 checksum' };
  const states = [];
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    if (request.method === 'PUT') {
      assert.ok(url.endsWith('/layers/1/enabled?serviceName=parcels'));
      layer.enabled = JSON.parse(request.body).enabled;
      states.push(layer.enabled);
      return Response.json({ success: true });
    }
    if (url.includes('/services/?q=')) return Response.json({ data: { items: [
      { ...receipt, folderName: 'planning', publicName: 'parcels' },
    ] } });
    assert.ok(url.includes('/connections/local/layers?serviceName=parcels'));
    return Response.json({ data: { items: [layer] } });
  });
  return { receipt, layer, states };
}

test('temporary tile export restores disabled state after success and failure without changing access policy', async (t) => {
  const { receipt, layer, states } = stagedLayer(t);
  const result = await withTemporaryLayer(env, receipt, async () => {
    assert.equal(layer.enabled, true);
    return 'archive';
  });
  assert.equal(result, 'archive');
  assert.equal(layer.enabled, false);
  await assert.rejects(withTemporaryLayer(env, receipt, async () => {
    throw new Error('export failed');
  }), /export failed/);
  assert.equal(layer.enabled, false);
  assert.deepEqual(states, [true, false, true, false]);
});

test('temporary export refuses a layer that was already enabled', async (t) => {
  const { receipt, layer, states } = stagedLayer(t);
  layer.enabled = true;
  await assert.rejects(withTemporaryLayer(env, receipt, () => assert.fail('must not export')), /disabled staged/);
  assert.deepEqual(states, []);
});
