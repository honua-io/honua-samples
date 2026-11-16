import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256 } from '../lib/checksum.mjs';
import { copyManifestFiles } from '../../shared/state-local/locked-archive.mjs';
import { publishRequestSnapshots } from '../state-local/approved/request-snapshots.mjs';

async function source(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'request-snapshots-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'source');
  await mkdir(directory);
  const request = { id: 'DEMO-1', type: 'Drainage', status: 'Open', c: [-156.47, 20.89],
    data_origin: 'synthetic_demo', disclaimer: 'DEMO DATA; not county operations' };
  const values = { 'demo.json': JSON.stringify({ requests: [request], assets: [{ ...request, id: 'ASSET-1' }], workorders: [{ ...request, id: 'WORK-1' }] }),
    'requests.csv': 'original CSV', 'requests.geojson': 'original GeoJSON', 'parcels.cjson': '{"real":true}' };
  const manifest = { schemaVersion: 1, crs: 'EPSG:4326', sources: { roads: { attribution: 'State GIS' } }, files: {} };
  for (const [file, text] of Object.entries(values)) {
    await writeFile(path.join(directory, file), text);
    manifest.files[file] = { bytes: Buffer.byteLength(text), sha256: sha256(text) };
  }
  return { root, directory, manifest, request };
}

test('verified snapshot derivation preserves request identity and publishes exact output integrity', async (t) => {
  const { root, directory, manifest, request } = await source(t);
  const output = path.join(root, 'output');
  await copyManifestFiles({ manifest, directory, output, pattern: /^[a-z.-]+$/ });
  await publishRequestSnapshots(output, manifest);
  const derived = JSON.parse(await readFile(path.join(output, 'manifest.json')));
  assert.deepEqual(derived.sources, manifest.sources);
  assert.deepEqual(derived.files['parcels.cjson'], manifest.files['parcels.cjson']);
  for (const [file, integrity] of Object.entries(derived.files)) {
    const bytes = await readFile(path.join(output, file));
    assert.equal(integrity.sha256, sha256(bytes));
    assert.equal(integrity.bytes, bytes.length);
    if (file === 'parcels.cjson') continue;
    assert.deepEqual(integrity.derivedFrom, manifest.files[file]);
    assert.notEqual(integrity.sha256, manifest.files[file].sha256);
  }
  const demo = JSON.parse(await readFile(path.join(output, 'demo.json')));
  assert.deepEqual(demo.requests, [{ ...request, is_demo: true, exercise_only: true }]);
  for (const [collection, id] of [['assets', 'ASSET-1'], ['workorders', 'WORK-1']]) {
    assert.deepEqual(demo[collection], [{ ...request, id, is_demo: true, exercise_only: true }]);
  }
  const geojson = JSON.parse(await readFile(path.join(output, 'requests.geojson')));
  const { c, ...properties } = demo.requests[0];
  assert.deepEqual(geojson.features, [{ type: 'Feature', properties, geometry: { type: 'Point', coordinates: c } }]);
  const csv = await readFile(path.join(output, 'requests.csv'), 'utf8');
  assert.match(csv, /data_origin,disclaimer,is_demo,exercise_only\n/);
  assert.match(csv, /"-156.47","20.89","synthetic_demo","DEMO DATA; not county operations","true","true"$/);
  assert.equal(sha256(await readFile(path.join(directory, 'demo.json'))), manifest.files['demo.json'].sha256);
});

test('source integrity rejects tampering before deriving display files', async (t) => {
  const { root, directory, manifest } = await source(t);
  await writeFile(path.join(directory, 'demo.json'), '{"requests":[]}');
  await assert.rejects(copyManifestFiles({ manifest, directory, output: path.join(root, 'output'), pattern: /^[a-z.-]+$/ }), /integrity failed/);
});

test('regenerated packages retain both flags in demo data and snapshot downloads', async (t) => {
  const { root, directory } = await source(t);
  const receipts = path.join(root, 'receipts');
  await mkdir(receipts);
  const output = path.join(root, 'package');
  execFileSync(process.execPath, ['scripts/state-local/approved/pack.mjs', directory, receipts, output]);
  const demo = JSON.parse(await readFile(path.join(output, 'demo.json')));
  for (const record of [...demo.requests, ...demo.assets, ...demo.workorders]) {
    assert.equal(record.is_demo, true);
    assert.equal(record.exercise_only, true);
  }
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json')));
  for (const [file, integrity] of Object.entries(manifest.files)) {
    assert.equal(integrity.sha256, sha256(await readFile(path.join(output, file))));
  }
  const csv = await readFile(path.join(output, 'requests.csv'), 'utf8');
  assert.match(csv, /"true","true"$/);
  const geojson = JSON.parse(await readFile(path.join(output, 'requests.geojson')));
  assert.equal(geojson.features[0].properties.exercise_only, true);
});
