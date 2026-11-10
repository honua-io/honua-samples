import test from 'node:test';
import assert from 'node:assert/strict';
import { depthColor, inspectCell } from '../src/depth-view.mjs';

test('numeric inspection distinguishes real zero from unknown and retains Float32 values', () => {
  const raster = { width: 3, bands: [{ values: new Float32Array([0, 1.2578125, -9999]) }] };
  assert.deepEqual(inspectCell(raster, { x: 0, y: 0 }), { value: 0, label: '0.000000 m above ground' });
  assert.equal(inspectCell(raster, { x: 1, y: 0 }).value, 1.2578125);
  assert.deepEqual(inspectCell(raster, { x: 2, y: 0 }), { value: null, label: 'NoData · unknown' });
  assert.notDeepEqual(depthColor(0), depthColor(-9999));
});
