import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDepth } from '../src/depth-decoder.mjs';
import { depthColor, inspectCell } from '../src/depth-view.mjs';

test('numeric inspection distinguishes real zero from unknown and retains Float32 values', () => {
  const raster = { width: 3, bands: [{ values: new Float32Array([0, 1.2578125, -9999]) }] };
  assert.deepEqual(inspectCell(raster, { x: 0, y: 0 }), { value: 0, label: '0.000000 m above ground' });
  assert.equal(inspectCell(raster, { x: 1, y: 0 }).value, 1.2578125);
  assert.deepEqual(inspectCell(raster, { x: 2, y: 0 }), { value: null, label: 'NoData · unknown' });
  assert.notDeepEqual(depthColor(0), depthColor(-9999));
});


function image(overrides = {}) {
  return { isTiled: true, getWidth: () => 768, getHeight: () => 1024,
    getTileWidth: () => 256, getTileHeight: () => 256,
    getGeoKeys: () => ({ ProjectedCSTypeGeoKey: 3857 }), getSamplesPerPixel: () => 1,
    getBitsPerSample: () => 32, getSampleFormat: () => 3, getGDALNoData: () => -9999,
    getBoundingBox: () => [0, 0, 768, 1024], getResolution: () => [1, -1], ...overrides };
}

test('depth inspection rejects oversized decoded tiles before pixel reads', () => {
  assert.equal(inspectDepth([image()]).width, 768);
  assert.throws(() => inspectDepth([image({ getTileWidth: () => 8192, getTileHeight: () => 8192 })]), /decoded tile/);
  assert.throws(() => inspectDepth([image({ getWidth: () => 100000 })]), /depth grid/);
  assert.throws(() => inspectDepth([image({ getTileHeight: () => 0 })]), /depth grid/);
});
