import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../lib/checksum.mjs';
import { lockedArchive } from '../../shared/state-local/locked-archive.mjs';
import { buildIslandAssets } from './approved/build-island.mjs';
import { buildApprovedDemos } from './approved/build-site.mjs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const output = path.join(root, 'site/state-local');
const archiveDir = path.join(root, 'artifacts/display-download');
const lock = JSON.parse(await readFile(path.join(root, 'config/state-local-display.v1.json')));

async function downloadSnapshots() {
  const manifest = await lockedArchive(lock, archiveDir);
  await mkdir(path.join(output, 'data'), { recursive: true });
  for (const [name, layer] of Object.entries(manifest.layers)) {
    if (!/^maui-[a-z-]+$/.test(name)) throw new Error('Invalid snapshot filename');
    const file = `${name}.geojson`;
    const data = await readFile(path.join(archiveDir, file));
    if (sha256(data) !== layer.sha256 || JSON.parse(data).features.length !== layer.count) throw new Error(`${name} snapshot integrity failed`);
    await writeFile(path.join(output, 'data', file), data);
  }
  for (const layer of Object.values(manifest.layers)) layer.source = layer.source?.replace('/blob/trunk/', `/blob/${lock.sourceRevision}/`) ?? null;
  await writeFile(path.join(output, 'data/manifest.json'), JSON.stringify(manifest, null, 2));
}

await downloadSnapshots();
const islandLock = JSON.parse(await readFile(path.join(root, 'shared/state-local/island-display.lock.json')));
await buildIslandAssets({ root, output, lock: islandLock });
await buildApprovedDemos({ root, output, lock: lock.approved });
