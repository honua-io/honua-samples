import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../lib/checksum.mjs';
import { buildApprovedDemos } from './approved/build-site.mjs';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const output = path.join(root, 'site/state-local');
const archiveDir = path.join(root, 'artifacts/display-download');
const lock = JSON.parse(await readFile(path.join(root, 'config/state-local-display.v1.json')));

async function downloadSnapshots() {
  await mkdir(archiveDir, { recursive: true });
  const response = await fetch(lock.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Display snapshot HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (sha256(archive) !== lock.sha256) throw new Error('Display archive checksum mismatch');
  const filename = path.join(archiveDir, 'display.tar.gz');
  await writeFile(filename, archive);
  execFileSync('tar', ['-xzf', filename, '-C', archiveDir]);
  const manifest = JSON.parse(await readFile(path.join(archiveDir, 'manifest.json')));
  if (manifest.schemaVersion !== 1 || manifest.crs !== 'EPSG:4326') throw new Error('Unsupported display manifest');
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
await buildApprovedDemos({ root, output, lock: lock.approved });
