import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { withIslandPoints } from '../../../shared/state-local/island-points.mjs';
import { displayProvenance } from '../src/display-provenance.mjs';

const source = { sourceUrl: 'https://example.test/schools', attribution: 'School source agency',
  license: 'Public domain', licenseUrl: 'https://example.test/policy', retrievedAt: '2026-11-11T00:00:00Z' };

test('replaced display layers cite the exact verified file and its source rather than the old snapshot', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'emergency-provenance-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('{"type":"FeatureCollection","features":[]}');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(directory, 'schools.geojson'), bytes);
  const manifest = { sources: { schools: source }, files: { 'schools.geojson': { bytes: bytes.length, sha256 } } };
  const data = await withIslandPoints({ manifest, directory, data: { schools: 'old snapshot' } });
  const unchanged = { dataset: 'land', sha256: 'original land checksum', retrievalDate: null };
  const receipts = [{ dataset: 'schools', sha256: 'old checksum', attribution: 'Old source' }, unchanged];
  const result = displayProvenance({ receipts, manifest });
  assert.deepEqual(data.schools, JSON.parse(bytes));
  assert.equal(result[0].sha256, sha256);
  for (const field of ['sourceUrl', 'license', 'licenseUrl', 'attribution']) assert.equal(result[0][field], source[field]);
  assert.equal(result[0].retrievalDate, source.retrievedAt);
  assert.equal(result[0].displayFile, '../state-local/data/island/schools.geojson');
  assert.equal(result[0].sourceManifest, '../state-local/data/island/manifest.json');
  assert.deepEqual(result[1], unchanged);
  assert.equal(receipts[0].sha256, 'old checksum');
});

test('missing source metadata fails rather than publishing obsolete provenance', () => {
  const valid = { sources: { schools: source }, files: { 'schools.geojson': { sha256: 'verified' } } };
  for (const field of ['sourceUrl', 'license', 'licenseUrl', 'attribution', 'retrievedAt']) {
    const manifest = { ...valid, sources: { schools: { ...source, [field]: undefined } } };
    assert.throws(() => displayProvenance({ receipts: [{ dataset: 'schools' }], manifest }), /missing for schools/);
  }
  assert.throws(() => displayProvenance({ receipts: [{ dataset: 'schools' }], manifest: { ...valid, files: {} } }), /missing for schools/);
});
