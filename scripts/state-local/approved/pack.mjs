import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { sha256 } from '../../lib/checksum.mjs';
import { labelDemoRecords, writeRequestSnapshots } from './request-snapshots.mjs';

const [dataDirectory, receiptDirectory, outputDirectory] = process.argv.slice(2);
if (!outputDirectory) throw new Error('Usage: node pack.mjs <data> <receipts> <output>');
await mkdir(outputDirectory, { recursive: true });
// Date of the source retrieval this pack was reviewed against; also pins the archive mtime.
const snapshot = '2026-11-15';
const manifest = { schemaVersion: 1, crs: 'EPSG:4326', snapshot,
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
const demo = labelDemoRecords(JSON.parse(await readFile(path.join(dataDirectory, 'demo.json'))));
await writeFile(path.join(outputDirectory, 'demo.json'), JSON.stringify(demo));
await writeRequestSnapshots(outputDirectory, demo.requests);
for (const file of (await readdir(outputDirectory)).filter((name) => name !== 'manifest.json' && !name.endsWith('.gz'))) {
  const bytes = await readFile(path.join(outputDirectory, file));
  manifest.files[file] = { sha256: sha256(bytes), bytes: bytes.length };
}
await writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
const archive = path.resolve(outputDirectory, '..', 'maui-approved-display.tar.gz');
execFileSync('tar', ['--sort=name', `--mtime=${snapshot}`, '--owner=0', '--group=0', '-czf', archive, '-C', outputDirectory, '.'],
  { env: { ...process.env, TZ: 'UTC' } });
console.log(JSON.stringify({ archive, sha256: sha256(await readFile(archive)) }));
