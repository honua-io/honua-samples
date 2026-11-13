#!/usr/bin/env node
// Packs a built publication (descriptor.json, its artifacts and STAC item) into
// one reproducible archive with an integrity manifest, ready to attach to a
// release and lock in shared/publications/.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../lib/checksum.mjs';
import { publicationFilePattern, verifyDescriptorArtifacts } from './stage-publications.mjs';

async function publicationFiles(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name !== 'manifest.json')
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

export async function packPublication({ buildDirectory, outputDirectory }) {
  const descriptor = JSON.parse(await readFile(path.join(buildDirectory, 'descriptor.json')));
  const manifest = { schemaVersion: 1, crs: 'EPSG:4326', format: 'honua.samples.publication.v1', files: {} };
  for (const file of await publicationFiles(buildDirectory)) {
    if (!publicationFilePattern.test(file)) throw new Error(`${file} is not a publication file; remove it before packing`);
    const bytes = await readFile(path.join(buildDirectory, file));
    manifest.files[file] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  verifyDescriptorArtifacts(descriptor, manifest);
  await writeFile(path.join(buildDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const archive = path.resolve(outputDirectory, `${descriptor.publicationId}-${descriptor.version}.tar.gz`);
  execFileSync('tar', ['--sort=name', `--mtime=${descriptor.capture.capturedAt}`, '--owner=0', '--group=0',
    '-czf', archive, '-C', buildDirectory, '.']);
  return { archive, sha256: sha256(await readFile(archive)), files: manifest.files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [buildDirectory, outputDirectory] = process.argv.slice(2);
  if (!outputDirectory) throw new Error('Usage: node pack-publication.mjs <build directory> <output directory>');
  console.log(JSON.stringify(await packPublication({ buildDirectory, outputDirectory }), null, 2));
}
