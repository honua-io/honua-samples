import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from '../../lib/checksum.mjs';

export function labelDemoRecords(demo) {
  const labelled = { ...demo };
  for (const collection of ['requests', 'assets', 'workorders']) {
    labelled[collection] = demo[collection].map((record) => ({ ...record, is_demo: true, exercise_only: true }));
  }
  return labelled;
}

export async function writeRequestSnapshots(directory, requests) {
  await writeFile(path.join(directory, 'requests.geojson'), JSON.stringify({ type: 'FeatureCollection',
    features: requests.map(({ c, ...properties }) => ({ type: 'Feature', properties,
      geometry: { type: 'Point', coordinates: c } })) }));
  const fields = ['id', 'type', 'status', 'created', 'closed', 'due', 'dept', 'district', 'addr', 'lng', 'lat',
    'data_origin', 'disclaimer', 'is_demo', 'exercise_only'];
  const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  await writeFile(path.join(directory, 'requests.csv'), [fields.join(','),
    ...requests.map((request) => fields.map((field) => cell(field === 'lng' ? request.c[0]
      : field === 'lat' ? request.c[1] : request[field])).join(','))].join('\n'));
}

export async function publishRequestSnapshots(directory, sourceManifest) {
  const demo = labelDemoRecords(JSON.parse(await readFile(path.join(directory, 'demo.json'))));
  await writeFile(path.join(directory, 'demo.json'), JSON.stringify(demo));
  await writeRequestSnapshots(directory, demo.requests);
  const manifest = structuredClone(sourceManifest);
  for (const file of ['demo.json', 'requests.geojson', 'requests.csv']) {
    const bytes = await readFile(path.join(directory, file));
    manifest.files[file] = { sha256: sha256(bytes), bytes: bytes.length,
      derivedFrom: sourceManifest.files[file], transformation: 'retain-demo-record-flags' };
  }
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
