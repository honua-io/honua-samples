import assert from 'node:assert/strict';
import test from 'node:test';
import { parseByteRange } from '../lib/byte-range.mjs';

test('byte ranges are bounded to the resource and invalid ranges are unsatisfiable', () => {
  assert.deepEqual(parseByteRange('bytes=2-6', 10), { start: 2, end: 6 });
  assert.deepEqual(parseByteRange('bytes=7-', 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange('bytes=4-200', 10), { start: 4, end: 9 });
  for (const header of ['bytes=10-12', 'bytes=6-2', 'bytes=-5', 'items=0-1', 'bytes=0-1,3-4']) {
    assert.equal(parseByteRange(header, 10), null, header);
  }
});
