import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readMauiSnapshot } from './maui-snapshot.mjs';
import { fetchSnapshot, readSnapshot } from './snapshot.mjs';
import { getSource } from './sources.mjs';
import { sha256 } from '../lib/checksum.mjs';

const [planning, roads, output] = process.argv.slice(2);
if (!planning || !roads || !output) throw new Error('Usage: pack-display-snapshots.mjs <planning receipts> <road receipts> <output>');
const planningNames = ['maui-parcels', 'maui-zoning', 'maui-flood-hazard', 'maui-state-land-use',
  'maui-special-management-area', 'maui-island-plan-growth-boundaries', 'maui-island-plan-growth-areas', 'maui-tsunami-zones', 'maui-sea-level-rise'];
const exerciseNames = ['maui-demo-requests', 'maui-demo-work-orders', 'maui-demo-inspections'];
const staging = path.join(output, 'receipts');
const display = path.join(output, 'display');
await mkdir(staging, { recursive: true });
await mkdir(display, { recursive: true });
await cp(roads, staging, { recursive: true, filter: (file) => file === roads || path.basename(file).startsWith('maui-roads.') });
for (const name of ['maui-bridges', ...exerciseNames]) {
  if (!await stat(path.join(staging, `${name}.receipt.json`)).catch(() => null)) await fetchSnapshot(name, staging);
}
const manifest = { schemaVersion: 1, crs: 'EPSG:4326', layers: {} };
async function planningSnapshot(name) {
  const receipt = JSON.parse(await readFile(path.join(planning, `${name}.receipt.json`), 'utf8'));
  const precision = receipt.displayGeometry?.geometryPrecision;
  if (![6, 15].includes(precision)) throw new Error('Unsupported planning display precision');
  const source = getSource(name);
  return readMauiSnapshot({ name, directory: planning,
    source: { ...source, displayGeometry: { ...source.displayGeometry, geometryPrecision: precision } } });
}
for (const name of [...planningNames, 'maui-bridges', ...exerciseNames]) {
  const { receipt, geojson } = await (planningNames.includes(name) ? planningSnapshot(name) : readSnapshot(name, staging));
  const data = JSON.stringify(geojson);
  const source = getSource(name);
  manifest.layers[name] = { sha256: sha256(data), count: geojson.features.length,
    retrievedAt: receipt.retrievedAt ?? null, source: source.url ?? null, license: source.license,
    licenseUrl: source.licenseUrl, attribution: source.attribution, synthetic: exerciseNames.includes(name), ...(exerciseNames.includes(name) ? { scenarioDate: '2026-11-03', anchorSource: receipt.anchorSource, anchorSha256: receipt.anchorSha256 } : {}) };
  await writeFile(path.join(display, `${name}.geojson`), data);
}
await writeFile(path.join(display, 'manifest.json'), JSON.stringify(manifest, null, 2));
execFileSync('tar', ['-czf', path.join(output, 'maui-display.tar.gz'), '-C', display, '.']);
console.log(JSON.stringify(manifest.layers, null, 2));
