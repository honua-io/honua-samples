import { cp, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { lockedArchive, copyManifestFiles } from '../../../shared/state-local/locked-archive.mjs';
import { islandPointLayers } from '../../../shared/state-local/island-points.mjs';

const pages = [['01-overview.html', ''], ['12-workbench.html', 'workbench'], ['02-property.html', 'property'], ['10-property-mobile.html', 'property/mobile'],
  ['03-311.html', '311'], ['05-public-works.html', 'public-works']];

export async function buildApprovedDemos({ root, output, lock }) {
  const directory = path.join(root, 'artifacts/approved-download');
  const manifest = await lockedArchive(lock, directory);
  await copyManifestFiles({ manifest, directory, output: path.join(output, 'data/approved'),
    pattern: /^[a-z0-9_-]+\.(cjson|geojson|json|csv)$/ });
  const built = path.join(root, 'artifacts/approved-pages');
  execFileSync('python3', [path.join(root, 'scripts/state-local/approved/build.py'), directory, built,
    ...pages.map(([file]) => file)], { stdio: 'inherit', env: { ...process.env, HONUA_ISLAND_DATA: path.join(output, 'data/island'),
      HONUA_ISLAND_POINT_LAYERS: islandPointLayers.join(',') } });
  for (const [file, route] of pages) {
    await mkdir(path.join(output, route), { recursive: true });
    await cp(path.join(built, file), path.join(output, route, 'index.html'));
  }
}
