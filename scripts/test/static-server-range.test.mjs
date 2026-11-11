import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startStaticServer } from '../lib/browser-lane.mjs';

test('static archive server honours bounded ranges, HEAD and unsatisfiable ranges', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'tile-ranges-'));
  const bytes = Buffer.from('PMTiles archive payload');
  await writeFile(path.join(rootDir, 'test.pmtiles'), bytes);
  const server = await startStaticServer({ rootDir, port: 0 });
  try {
    const url = `${server.url}/test.pmtiles`;
    const partial = await fetch(url, { headers: { Range: 'bytes=2-6' } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), `bytes 2-6/${bytes.length}`);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(2, 7));
    const remainder = await fetch(url, { headers: { Range: 'bytes=7-' } });
    assert.deepEqual(Buffer.from(await remainder.arrayBuffer()), bytes.subarray(7));
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.headers.get('accept-ranges'), 'bytes');
    assert.equal(Number(head.headers.get('content-length')), bytes.length);
    assert.equal(await head.text(), '');
    const beyond = await fetch(url, { headers: { Range: 'bytes=100-200' } });
    assert.equal(beyond.status, 416);
    assert.equal(beyond.headers.get('content-range'), `bytes */${bytes.length}`);
  } finally {
    await server.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});
