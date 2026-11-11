import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../lib/checksum.mjs';
import { islandSources, islandTileBudgetBytes, islandTileLayers } from './sources.mjs';
import { readIslandSnapshot } from './island-snapshot.mjs';
import { islandDisplay } from './island-display.mjs';

export function verifyTileArchive({ name, receipt, bytes, cleanSha256 }) {
  if (receipt.source !== name || receipt.cleanSha256 !== cleanSha256
    || receipt.sha256 !== sha256(bytes) || receipt.sizeBytes !== bytes.length
    || bytes.length > islandTileBudgetBytes || bytes.subarray(0, 7).toString() !== 'PMTiles' || bytes[7] !== 3) {
    throw new Error(`${name} tile receipt or archive integrity failed`);
  }
}

export async function packIsland(options) {
  const { sourceDirectory, directory, tileDirectory, outputDirectory } = options;
  await mkdir(outputDirectory, { recursive: true });
  const manifest = { schemaVersion: 1, crs: 'EPSG:4326', format: 'honua.samples.island-display.v1',
    warning: 'Reference data, not legal boundaries or operational emergency information. Synthetic story records are packaged separately.',
    sources: {}, files: {} };
  for (const name of Object.keys(islandSources)) {
    const snapshot = await readIslandSnapshot({ name, directory, sourceDirectory });
    manifest.sources[name] = snapshot.receipt;
    let file;
    if (islandTileLayers.includes(name)) {
      file = `${name}.pmtiles`;
      const bytes = await readFile(path.join(tileDirectory, file));
      const receipt = JSON.parse(await readFile(path.join(tileDirectory, `${name}.tiles.json`)));
      verifyTileArchive({ name, receipt, bytes, cleanSha256: snapshot.receipt.cleanSha256 });
      manifest.sources[name].tiles = receipt;
      await cp(path.join(tileDirectory, file), path.join(outputDirectory, file));
    } else {
      file = `${name}.geojson`;
      await writeFile(path.join(outputDirectory, file), JSON.stringify(islandDisplay(name, snapshot.geojson)));
    }
    const bytes = await readFile(path.join(outputDirectory, file));
    manifest.files[file] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  await writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const archive = path.resolve(outputDirectory, '..', 'maui-island-display.tar.gz');
  execFileSync('tar', ['--sort=name', '--mtime=2026-11-10', '--owner=0', '--group=0', '-czf', archive, '-C', outputDirectory, '.']);
  return { archive, sha256: sha256(await readFile(archive)), files: manifest.files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourceDirectory, directory, tileDirectory, outputDirectory] = process.argv.slice(2);
  if (!outputDirectory) throw new Error('Usage: node pack-island.mjs <sources> <prepared> <tiles> <output>');
  console.log(JSON.stringify(await packIsland({ sourceDirectory, directory, tileDirectory, outputDirectory })));
}
