import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sha256 } from '../lib/checksum.mjs';
import { copyManifestFiles } from '../../shared/state-local/locked-archive.mjs';
import { verifyDescriptorArtifacts } from '../publications/pack-publication.mjs';

const integrity = { bytes: 10, sha256: 'a'.repeat(64) };

function publication() {
  return {
    descriptor: {
      publicationId: 'maui-county-parcels',
      version: '20261113T122054Z',
      artifacts: { geoparquet: { href: 'parcels.parquet', ...integrity }, pmtiles: { href: 'parcels.pmtiles', ...integrity } },
      links: { stac: 'stac/maui-county-parcels.json' },
    },
    manifest: { files: { 'parcels.parquet': integrity, 'parcels.pmtiles': integrity, 'stac/maui-county-parcels.json': integrity } },
  };
}

test('descriptor artifacts must match the archive manifest byte for byte', () => {
  const { descriptor, manifest } = publication();
  verifyDescriptorArtifacts(descriptor, manifest);
  manifest.files['parcels.pmtiles'] = { ...integrity, sha256: 'b'.repeat(64) };
  assert.throws(() => verifyDescriptorArtifacts(descriptor, manifest), /pmtiles artifact parcels.pmtiles does not match/);
});

test('publications without their STAC item or with unsafe path segments are refused', () => {
  const missingStac = publication();
  delete missingStac.manifest.files['stac/maui-county-parcels.json'];
  assert.throws(() => verifyDescriptorArtifacts(missingStac.descriptor, missingStac.manifest), /STAC item/);
  const traversal = publication();
  traversal.descriptor.version = '..';
  assert.throws(() => verifyDescriptorArtifacts(traversal.descriptor, traversal.manifest), /Unsafe publication path segment/);
});

test('manifest copying creates the folders of nested files', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'honua-publication-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('{"type":"Feature"}');
  await mkdir(path.join(directory, 'stac'));
  await writeFile(path.join(directory, 'stac/item.json'), bytes);
  const output = path.join(directory, 'public');
  await copyManifestFiles({ directory, output, pattern: /^(stac\/)?item\.json$/,
    manifest: { files: { 'stac/item.json': { bytes: bytes.length, sha256: sha256(bytes) } } } });
  assert.deepEqual(await readFile(path.join(output, 'stac/item.json')), bytes);
});
