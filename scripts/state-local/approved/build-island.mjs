import path from 'node:path';
import { lockedArchive, copyManifestFiles } from '../locked-archive.mjs';
import { islandSources, islandTileLayers } from './sources.mjs';

export async function buildIslandAssets({ root, output, lock }) {
  const directory = path.join(root, 'artifacts/island-display-download');
  const manifest = await lockedArchive(lock, directory);
  const expected = Object.keys(islandSources).map((name) => `${name}.${islandTileLayers.includes(name) ? 'pmtiles' : 'geojson'}`).sort();
  if (manifest.format !== 'honua.samples.island-display.v1'
    || JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify(expected)) {
    throw new Error('Island manifest must contain all twenty verified layers');
  }
  if (islandTileLayers.some((name) => manifest.files[`${name}.pmtiles`].bytes > 100_000_000)) {
    throw new Error('Island archive exceeds the approved 100 MB budget');
  }
  await copyManifestFiles({ manifest, directory, output: path.join(output, 'data/island'),
    pattern: /^[a-z0-9_-]+\.(geojson|pmtiles)$/ });
  return path.join(output, 'data/island');
}
