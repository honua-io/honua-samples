import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { sha256 } from '../lib/checksum.mjs';
import { copyManifestFiles, lockedArchive } from '../../shared/state-local/locked-archive.mjs';
import { islandDisplay } from '../state-local/approved/island-display.mjs';
import { verifyTileArchive } from '../state-local/approved/pack-island.mjs';
import { verifyIslandManifest } from '../state-local/approved/build-island.mjs';
import { islandSources, islandTileBudgetBytes, islandTileExtent, islandTileLayers } from '../state-local/approved/sources.mjs';
import { withIslandPoints } from '../../shared/state-local/island-points.mjs';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

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

test('tile archives are rejected when any receipt field or the PMTiles header changes', () => {
  const bytes = Buffer.concat([Buffer.from('PMTiles'), Buffer.from([3]), Buffer.alloc(8)]);
  const valid = { name: 'roads', cleanSha256: 'clean', bytes,
    receipt: { source: 'roads', cleanSha256: 'clean', sha256: sha256(bytes), sizeBytes: bytes.length } };
  verifyTileArchive(valid);
  const changed = {
    source: { ...valid, receipt: { ...valid.receipt, source: 'zoning' } },
    cleanSha256: { ...valid, cleanSha256: 'other' },
    sha256: { ...valid, receipt: { ...valid.receipt, sha256: '0'.repeat(64) } },
    size: { ...valid, receipt: { ...valid.receipt, sizeBytes: bytes.length + 1 } },
    magic: { ...valid, bytes: Buffer.concat([Buffer.from('MBTiles'), bytes.subarray(7)]) },
    version: { ...valid, bytes: Buffer.concat([bytes.subarray(0, 7), Buffer.from([2]), bytes.subarray(8)]) },
  };
  changed.magic.receipt = { ...valid.receipt, sha256: sha256(changed.magic.bytes) };
  changed.version.receipt = { ...valid.receipt, sha256: sha256(changed.version.bytes) };
  for (const [field, options] of Object.entries(changed)) {
    assert.throws(() => verifyTileArchive(options), /roads tile receipt or archive integrity failed/, field);
  }
});

test('tile archives over the budget are rejected even with a matching receipt', () => {
  const bytes = Buffer.alloc(islandTileBudgetBytes + 1);
  bytes.write('PMTiles'); bytes[7] = 3;
  assert.throws(() => verifyTileArchive({ name: 'roads', cleanSha256: 'c', bytes,
    receipt: { source: 'roads', cleanSha256: 'c', sha256: sha256(bytes), sizeBytes: bytes.length } }), /integrity failed/);
});

test('island manifests need the exact layer set, format and tile budget', () => {
  const files = Object.fromEntries(Object.keys(islandSources).map((name) =>
    [`${name}.${islandTileLayers.includes(name) ? 'pmtiles' : 'geojson'}`, { bytes: 1, sha256: 'x' }]));
  const sources = Object.fromEntries(islandTileLayers.map((name) => {
    const { minZoom, maxZoom } = islandTileExtent(name);
    return [name, { tiles: { minZoom, maxZoom } }];
  }));
  const valid = { format: 'honua.samples.island-display.v1', files, sources };
  verifyIslandManifest(valid);
  const count = Object.keys(islandSources).length;
  assert.throws(() => verifyIslandManifest({ ...valid, format: 'other' }), new RegExp(`all ${count} verified layers`));
  const { 'schools.geojson': _missing, ...withoutSchools } = files;
  assert.throws(() => verifyIslandManifest({ ...valid, files: withoutSchools }), /verified layers/);
  assert.throws(() => verifyIslandManifest({ ...valid, files: { ...files, 'extra.geojson': { bytes: 1 } } }), /verified layers/);
  assert.throws(() => verifyIslandManifest({ ...valid, files: { ...files, 'parcels.pmtiles': { bytes: islandTileBudgetBytes + 1 } } }), /100 MB budget/);
  // An archive exported from a different zoom range than the island map draws is refused.
  assert.throws(() => verifyIslandManifest({ ...valid, sources: { ...sources, parcels: { tiles: { minZoom: 8, maxZoom: 14 } } } }),
    /parcels archive covers z8-14; the island map expects z13-14/);
  const { roads: _roads, ...withoutRoads } = sources;
  assert.throws(() => verifyIslandManifest({ ...valid, sources: withoutRoads }), /roads archive covers zundefined/);
});

test('locked archives with parent or absolute member paths are refused before extraction', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'honua-unsafe-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const staging = path.join(directory, 'staging');
  await mkdir(staging);
  await writeFile(path.join(staging, 'manifest.json'), '{}');
  const archive = path.join(directory, 'cache', 'display.tar.gz');
  await mkdir(path.dirname(archive));
  execFileSync('tar', ['-czf', archive, '-C', staging, '--transform', 's,^,../,', 'manifest.json']);
  const lock = { url: 'https://example.test/unused.tar.gz', sha256: sha256(await readFile(archive)) };
  await assert.rejects(lockedArchive(lock, path.dirname(archive)), /Unsafe snapshot archive path/);
  await assert.rejects(readFile(path.join(directory, 'manifest.json')), { code: 'ENOENT' });
});

test('island point layers are inlined only for requested names and only with matching bytes', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'honua-points-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('{"type":"FeatureCollection","features":[]}');
  await writeFile(path.join(directory, 'fire.geojson'), bytes);
  const manifest = { files: { 'fire.geojson': { bytes: bytes.length, sha256: sha256(bytes) } } };
  const data = await withIslandPoints({ manifest, directory, data: { fire: null, roads: 'kept' } });
  assert.deepEqual(data, { fire: JSON.parse(bytes), roads: 'kept' });
  manifest.files['fire.geojson'].sha256 = '0'.repeat(64);
  await assert.rejects(withIslandPoints({ manifest, directory, data: { fire: null } }), /fire.geojson integrity failed/);
  await assert.rejects(withIslandPoints({ manifest, directory, data: { police: null } }), /missing police.geojson/);
});
