import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { islandSources } from './sources.mjs';
import { readMauiSnapshot } from '../maui-snapshot.mjs';
import { assertDefaultImportGeometry } from '../import-geometry.mjs';
import { sha256 } from '../../lib/checksum.mjs';

const execute = promisify(execFile);
const splitter = fileURLToPath(new URL('subdivide.py', import.meta.url));

export async function prepareIsland(options) {
  const { directory, outputDirectory, python } = options;
  await mkdir(outputDirectory, { recursive: true });
  const manifest = { schemaVersion: 1, crs: 'EPSG:4326',
    policy: 'GEOS make_valid for invalid source geometry; deterministic subdivision without simplification or clipping; retain all dimensions and source_objectid',
    layers: {} };
  for (const [name, source] of Object.entries(islandSources)) {
    const snapshot = await readMauiSnapshot({ directory, name, source });
    if (snapshot.receipt.rejected !== 0) throw new Error(`${name} has rejected source features`);
    const outputPath = path.join(outputDirectory, `${name}.geojson`);
    const { stdout } = await execute(python, [splitter, path.join(directory, `${name}.geojson`), outputPath],
      { maxBuffer: 4_000_000 });
    const changes = JSON.parse(stdout);
    if (sha256(await readFile(path.join(directory, `${name}.geojson`))) !== snapshot.receipt.cleanSha256) {
      throw new Error(`${name} source changed during preparation`);
    }
    const bytes = await readFile(outputPath);
    const collection = JSON.parse(bytes);
    assertDefaultImportGeometry(collection);
    const sourceIds = new Set(collection.features.map((feature) => String(feature.properties.source_objectid)));
    if (sourceIds.size !== snapshot.geojson.features.length
      || snapshot.geojson.features.some((feature) => !sourceIds.has(String(feature.properties.objectid)))) {
      throw new Error(`${name} subdivision lost or introduced source IDs`);
    }
    manifest.layers[name] = { ...changes, sourceSha256: snapshot.receipt.cleanSha256,
      cleanSha256: sha256(bytes), bytes: bytes.length, license: source.license,
      licenseUrl: source.licenseUrl, attribution: source.attribution, sourceUrl: source.url };
    console.log(`${name}: ${changes.sourceFeatures} sources → ${changes.outputFeatures} import features; ${changes.repairs.length} repairs`);
  }
  await writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, outputDirectory] = process.argv.slice(2);
  if (!directory || !outputDirectory) throw new Error('Usage: node prepare-island.mjs <verified-snapshots> <new-output-directory>');
  await prepareIsland({ directory, outputDirectory, python: process.env.HONUA_GEOMETRY_PYTHON ?? 'python3' });
}
