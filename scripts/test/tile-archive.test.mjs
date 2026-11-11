import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { archiveTileCount, exportTileArchive, maximumArchiveBytes, readTileArchive } from '../state-local/tile-archive.mjs';
import { sha256 } from '../lib/checksum.mjs';

const extent = { bbox: [-157.4, 20.45, -155.95, 21.25], minZoom: 8, maxZoom: 14 };

test('Maui Nui export stays within the default tile ceiling without truncation', () => {
  assert.equal(archiveTileCount(extent), 3660);
  assert.throws(() => archiveTileCount({ ...extent, maxZoom: 15 }), /14167 tiles/);
  assert.throws(() => archiveTileCount({ ...extent, bbox: [-156, 21, -157, 20] }), /Invalid/);
});

async function archive(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'honua-archive-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.alloc(127);
  bytes.write('PMTiles');
  bytes[7] = 3;
  const filename = path.join(root, 'archive.pmtiles');
  await writeFile(filename, bytes);
  const job = { jobId: 'export', layerId: 7, totalTiles: 3660, processedTiles: 3660,
    successfulTiles: 100, failedTiles: 0, warnings: [], archiveSizeBytes: 127,
    downloadUrl: String(pathToFileURL(filename)) };
  return { root, bytes, filename, job, options: { expectedTiles: 3660, localStorageRoot: root } };
}

test('empty ocean tiles are allowed and local export gets a checksum without its download URL', async (t) => {
  const { job, options, bytes } = await archive(t);
  const result = await readTileArchive(job, options);
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.receipt.sha256, sha256(bytes));
  assert.equal(result.receipt.writtenTiles, 100);
  assert.ok(!JSON.stringify(result.receipt).includes('file:'));
});

test('partial, failed, warned and oversized exports are refused before download', async (t) => {
  const { job, options } = await archive(t);
  for (const change of [{ totalTiles: 500 }, { processedTiles: 500 }, { failedTiles: 1 },
    { successfulTiles: 0 }, { warnings: ['truncated'] }, { archiveSizeBytes: maximumArchiveBytes + 1 }]) {
    await assert.rejects(readTileArchive({ ...job, ...change }, options), /incomplete|size/);
  }
});

test('local archives require an explicit shared root and cannot escape through symlinks', async (t) => {
  const { job, root, filename, options } = await archive(t);
  await assert.rejects(readTileArchive(job, { expectedTiles: 3660 }), /explicit shared/);
  const sibling = await mkdtemp(path.join(os.tmpdir(), 'honua-other-'));
  t.after(() => rm(sibling, { recursive: true, force: true }));
  const link = path.join(sibling, 'escape.pmtiles');
  await symlink(filename, link);
  await assert.rejects(readTileArchive({ ...job, downloadUrl: String(pathToFileURL(link)) },
    { ...options, localStorageRoot: sibling }), /outside/);
  await writeFile(path.join(root, 'archive.pmtiles'), Buffer.alloc(127));
  await assert.rejects(readTileArchive(job, options), /header/);
});

test('signed HTTPS archive download never receives the admin API key', async (t) => {
  const { job, bytes, options } = await archive(t);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(new URL(url).hostname, 'tiles.example');
    assert.equal(init.headers, undefined);
    return new Response(bytes);
  });
  const result = await readTileArchive({ ...job, downloadUrl: 'https://tiles.example/archive?signature=private' }, options);
  assert.equal(result.receipt.sha256, sha256(bytes));
});

test('export rejects a truncated requested grid before starting a server job', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('must not start a truncated export'));
  await assert.rejects(exportTileArchive({}, { ...extent, maxZoom: 15 }), /default server limit/);
});

test('export uses the tile API PascalCase contract for requests and responses', async (t) => {
  const { job, bytes, root } = await archive(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(init.method);
    if (init.method === 'POST') {
      assert.deepEqual(JSON.parse(init.body), { Operation: 'archive', ServiceId: 'parcels',
        LayerId: 7, Bbox: extent.bbox, MinZoom: 8, MaxZoom: 14, MaxTiles: 3660 });
      return Response.json({ JobId: 'export' }, { status: 202 });
    }
    assert.ok(url.endsWith('/jobs/export'));
    return Response.json(Object.fromEntries(Object.entries({ ...job, status: 2 })
      .map(([key, value]) => [key[0].toUpperCase() + key.slice(1), value])));
  });
  const result = await exportTileArchive({ baseUrl: 'https://server.example', adminApiKey: 'test' },
    { ...extent, serviceId: 'parcels', layerId: 7, localStorageRoot: root });
  assert.deepEqual(result.bytes, bytes);
  assert.deepEqual(calls, ['POST', 'GET']);
});
