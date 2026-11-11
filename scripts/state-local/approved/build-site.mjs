import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { sha256 } from '../../lib/checksum.mjs';

const pages = [['01-overview.html', ''], ['12-workbench.html', 'workbench'], ['02-property.html', 'property'], ['10-property-mobile.html', 'property/mobile'],
  ['03-311.html', '311'], ['05-public-works.html', 'public-works']];

export async function buildApprovedDemos({ root, output, lock }) {
  const directory = path.join(root, 'artifacts/approved-download');
  await mkdir(directory, { recursive: true });
  const response = await fetch(lock.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Approved snapshot HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== lock.sha256) throw new Error('Approved archive checksum mismatch');
  const archive = path.join(directory, 'display.tar.gz');
  await writeFile(archive, bytes);
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json')));
  if (manifest.schemaVersion !== 1 || manifest.crs !== 'EPSG:4326') throw new Error('Unsupported approved manifest');
  const publicData = path.join(output, 'data/approved');
  await mkdir(publicData, { recursive: true });
  for (const [file, integrity] of Object.entries(manifest.files)) {
    if (!/^[a-z0-9_-]+\.(cjson|geojson|json|csv)$/.test(file)) throw new Error('Invalid approved filename');
    const content = await readFile(path.join(directory, file));
    if (content.length !== integrity.bytes || sha256(content) !== integrity.sha256) throw new Error(`${file} integrity failed`);
    await writeFile(path.join(publicData, file), content);
  }
  await cp(path.join(directory, 'manifest.json'), path.join(publicData, 'manifest.json'));
  const built = path.join(root, 'artifacts/approved-pages');
  execFileSync('python3', [path.join(root, 'scripts/state-local/approved/build.py'), directory, built,
    ...pages.map(([file]) => file)], { stdio: 'inherit' });
  for (const [file, route] of pages) {
    await mkdir(path.join(output, route), { recursive: true });
    await cp(path.join(built, file), path.join(output, route, 'index.html'));
  }
}
