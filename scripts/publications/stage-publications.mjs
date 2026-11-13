#!/usr/bin/env node
// Stages each locked publication (shared/publications/*.lock.json) into
// site/publications/<publicationId>/<version>/: the archive must match its
// locked SHA-256, every file must match the archive manifest, and every
// artifact the descriptor lists must be a manifest file with the same bytes.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyManifestFiles, lockedArchive, readVerifiedFile } from '../../shared/state-local/locked-archive.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lockDirectory = path.join(root, 'shared/publications');
const downloadRoot = path.join(root, 'artifacts/publication-download');
const siteRoot = path.join(root, 'site/publications');
export const publicationFilePattern = /^(stac\/)?[a-z0-9_-]+\.(json|parquet|pmtiles)$/;
const pathSegmentPattern = /^[A-Za-z0-9._-]+$/;

export function verifyDescriptorArtifacts(descriptor, manifest) {
  for (const segment of [descriptor.publicationId, descriptor.version]) {
    if (!pathSegmentPattern.test(segment ?? '') || segment.startsWith('.')) throw new Error(`Unsafe publication path segment ${segment}`);
  }
  for (const [kind, artifact] of Object.entries(descriptor.artifacts)) {
    const integrity = Object.hasOwn(manifest.files, artifact.href) ? manifest.files[artifact.href] : undefined;
    if (integrity?.sha256 !== artifact.sha256 || integrity.bytes !== artifact.bytes) {
      throw new Error(`${descriptor.publicationId} ${kind} artifact ${artifact.href} does not match the archive manifest`);
    }
  }
  if (!Object.hasOwn(manifest.files, descriptor.links.stac)) throw new Error(`${descriptor.publicationId} STAC item ${descriptor.links.stac} is missing`);
}

async function stagePublication(lockFile) {
  const lock = JSON.parse(await readFile(path.join(lockDirectory, lockFile)));
  const directory = path.join(downloadRoot, path.basename(lockFile, '.lock.json'));
  const manifest = await lockedArchive(lock, directory);
  const descriptor = JSON.parse(await readVerifiedFile({ directory, file: 'descriptor.json', integrity: manifest.files['descriptor.json'] }));
  verifyDescriptorArtifacts(descriptor, manifest);
  const output = path.join(siteRoot, descriptor.publicationId, descriptor.version);
  await copyManifestFiles({ manifest, directory, output, pattern: publicationFilePattern });
  return path.relative(path.join(root, 'site'), output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lockFiles = (await readdir(lockDirectory)).filter((file) => file.endsWith('.lock.json')).sort();
  for (const lockFile of lockFiles) console.log(`staged ${await stagePublication(lockFile)}`);
}
