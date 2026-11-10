import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { sha256 } from '../../lib/checksum.mjs';

const [dataDirectory, receiptDirectory, outputDirectory] = process.argv.slice(2);
if (!outputDirectory) throw new Error('Usage: node pack.mjs <data> <receipts> <output>');
await mkdir(outputDirectory, { recursive: true });
const manifest = { schemaVersion: 1, crs: 'EPSG:4326', snapshot: '2026-11-10',
  attribution: 'Hawaii Statewide GIS Program and originating agencies identified per source',
  warning: 'Generalized display snapshots, not legal boundaries or live operational information. Fictional records retain synthetic_demo labels.',
  sources: {}, files: {} };
for (const file of (await readdir(receiptDirectory)).filter((name) => name.endsWith('.receipt.json'))) {
  manifest.sources[file.replace('.receipt.json', '')] = JSON.parse(await readFile(path.join(receiptDirectory, file)));
}
for (const file of await readdir(dataDirectory)) {
  if (!/\.(cjson|geojson|json)$/.test(file) || file === '12-buildings.json') continue;
  await cp(path.join(dataDirectory, file), path.join(outputDirectory, file));
}
const demo = JSON.parse(await readFile(path.join(dataDirectory, 'demo.json')));
const requests = demo.requests;
await writeFile(path.join(outputDirectory, 'requests.geojson'), JSON.stringify({ type: 'FeatureCollection',
  features: requests.map(({ c, ...properties }) => ({ type: 'Feature', properties,
    geometry: { type: 'Point', coordinates: c } })) }));
const fields = ['id', 'type', 'status', 'dept', 'district', 'addr', 'lng', 'lat', 'data_origin', 'disclaimer'];
const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
await writeFile(path.join(outputDirectory, 'requests.csv'), [fields.join(','),
  ...requests.map((request) => fields.map((field) => cell(field === 'lng' ? request.c[0] : field === 'lat' ? request.c[1] : request[field])).join(','))].join('\n'));
for (const file of (await readdir(outputDirectory)).filter((name) => name !== 'manifest.json' && !name.endsWith('.gz'))) {
  const bytes = await readFile(path.join(outputDirectory, file));
  manifest.files[file] = { sha256: sha256(bytes), bytes: bytes.length };
}
await writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
const archive = path.resolve(outputDirectory, '..', 'maui-approved-display.tar.gz');
execFileSync('tar', ['--sort=name', '--mtime=2026-11-10', '--owner=0', '--group=0', '-czf', archive, '-C', outputDirectory, '.']);
console.log(JSON.stringify({ archive, sha256: sha256(await readFile(archive)) }));
