import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { sha256 } from '../lib/checksum.mjs';

export async function lockedArchive(lock, directory) {
  await mkdir(directory, { recursive: true });
  const archive = path.join(directory, 'display.tar.gz');
  let bytes;
  try { bytes = await readFile(archive); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!bytes || sha256(bytes) !== lock.sha256) {
    const response = await fetch(lock.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== lock.sha256) throw new Error('Snapshot archive checksum mismatch');
    await writeFile(archive, bytes);
  }
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  if (entries.some((entry) => entry.startsWith('/') || entry.split('/').includes('..'))) throw new Error('Unsafe snapshot archive path');
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json')));
  if (manifest.schemaVersion !== 1 || manifest.crs !== 'EPSG:4326') throw new Error('Unsupported snapshot manifest');
  return manifest;
}

export async function copyManifestFiles(options) {
  const { manifest, directory, output, pattern } = options;
  await mkdir(output, { recursive: true });
  for (const [file, integrity] of Object.entries(manifest.files)) {
    if (!pattern.test(file)) throw new Error('Invalid snapshot filename');
    const bytes = await readFile(path.join(directory, file));
    if (bytes.length !== integrity.bytes || sha256(bytes) !== integrity.sha256) throw new Error(`${file} integrity failed`);
    await writeFile(path.join(output, file), bytes);
  }
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
