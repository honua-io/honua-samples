import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { sha256 } from '../lib/checksum.mjs';
import { copyManifestFiles, lockedArchive } from '../state-local/locked-archive.mjs';
import { islandDisplay } from '../state-local/approved/island-display.mjs';

test('display aliases preserve source identities, attributes and real provenance', () => {
  const original = { type: 'FeatureCollection', features: [{ type: 'Feature',
    properties: { objectid: 2, source_objectid: 13, sch_name: 'Baldwin High', address: '1650 Kaahumanu Avenue' },
    geometry: { type: 'Point', coordinates: [-156.48, 20.89] } }] };
  const result = islandDisplay('schools', original).features[0];
  assert.equal(result.id, 2);
  assert.equal(result.properties.source_objectid, 13);
  assert.equal(result.properties.name, 'Baldwin High');
  assert.equal(result.properties.addr, original.features[0].properties.address);
  assert.equal(result.properties.data_origin, 'real');
  assert.equal(original.features[0].properties.name, undefined);
});

test('locked downloads reject incorrect checksums before extraction', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'honua-archive-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  t.mock.method(globalThis, 'fetch', async () => new Response('corrupted archive'));
  await assert.rejects(lockedArchive({ url: 'https://example.test/data.tar.gz', sha256: '0'.repeat(64) }, directory), /checksum mismatch/);
  await assert.rejects(readFile(path.join(directory, 'display.tar.gz')), { code: 'ENOENT' });
});

test('manifest copying rejects changed file bytes and unsafe names', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'honua-manifest-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('{"type":"FeatureCollection","features":[]}');
  await writeFile(path.join(directory, 'schools.geojson'), bytes);
  const options = { directory, output: path.join(directory, 'public'), pattern: /^[a-z]+\.geojson$/,
    manifest: { files: { 'schools.geojson': { bytes: bytes.length, sha256: sha256(bytes) } } } };
  await copyManifestFiles(options);
  assert.deepEqual(await readFile(path.join(options.output, 'schools.geojson')), bytes);
  await writeFile(path.join(directory, 'schools.geojson'), Buffer.alloc(bytes.length));
  await assert.rejects(copyManifestFiles(options), /integrity failed/);
  options.manifest.files = { '../schools.geojson': {} };
  await assert.rejects(copyManifestFiles(options), /Invalid snapshot filename/);
});
