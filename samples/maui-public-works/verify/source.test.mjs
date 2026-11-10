import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindings } from '../src/source.mjs';

test('PW-01: inventory requires all three receipt bindings and approved origins', () => {
  assert.equal(bindings(''), null);
  const query = '?orderService=orders&orderLayer=1&inspectionService=inspections&inspectionLayer=2&bridgeService=bridges&bridgeLayer=3';
  assert.equal(bindings(query).bridges.layerId, 3);
  for (const value of ['?orderService=orders&orderLayer=1', `${query}&baseUrl=https://example.invalid`, query.replace('bridgeLayer=3', 'bridgeLayer=-1')]) {
    assert.throws(() => bindings(value));
  }
});
