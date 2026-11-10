import assert from 'node:assert/strict';
import test from 'node:test';
import { collectFeatures } from '../../shared/state-local/features.mjs';
import { wgs84Geometry, positions } from '../../shared/state-local/geometry.mjs';

const binding = { serviceId: 'exercise', layerId: 0 };

test('shared layer reader handles capped pages and checks complete unique identities', async () => {
  const offsets = [];
  const client = { async queryFeatures(query) {
    if (query.extraParams?.returnCountOnly) return { count: 205 };
    offsets.push(query.resultOffset);
    return { features: Array.from({ length: Math.min(75, 205 - query.resultOffset) }, (_, index) => ({ id: query.resultOffset + index })) };
  } };
  const features = await collectFeatures(client, binding, (feature) => feature);
  assert.equal(features.length, 205);
  assert.deepEqual(offsets, [0, 75, 150]);
});

test('shared layer reader rejects invalid counts, empty pages, missing identities and changes', async () => {
  for (const count of [undefined, -1, 10_001, 1.5]) {
    await assert.rejects(collectFeatures({ queryFeatures: async () => ({ count }) }, binding, (value) => value), /count/);
  }
  for (const features of [[], [{}], [{ id: null }], [{ id: 1 }, { id: 1 }]]) {
    const client = { queryFeatures: async (query) => query.extraParams ? { count: Math.max(1, features.length) } : { features } };
    await assert.rejects(collectFeatures(client, binding, (value) => value), /pagination/);
  }
  let counts = 0;
  const changed = { queryFeatures: async (query) => query.extraParams ? { count: ++counts } : { features: [{ id: 1 }] } };
  await assert.rejects(collectFeatures(changed, binding, (value) => value), /changed/);
});

test('shared geometry normalizes points and road lines and rejects invalid WGS84 positions', () => {
  assert.deepEqual(wgs84Geometry({ x: -156.4, y: 20.8 }), { type: 'Point', coordinates: [-156.4, 20.8] });
  const line = wgs84Geometry({ type: 'LineString', coordinates: [[-156.4, 20.8], [-156.3, 20.9]] });
  assert.deepEqual(positions(line), [[-156.4, 20.8], [-156.3, 20.9]]);
  for (const value of [{ x: 181, y: 20 }, { paths: [[]] }, { paths: [[[0, 0], [NaN, 1]]] }]) {
    assert.throws(() => wgs84Geometry(value));
  }
});
