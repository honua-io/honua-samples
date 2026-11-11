import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function verifiedAsset(directory, descriptor, folder) {
  if (!descriptor || typeof descriptor.file !== 'string'
    || path.basename(descriptor.file) !== descriptor.file) throw new Error('Invalid prepared asset filename.');
  const source = await readFile(path.join(directory, descriptor.file));
  if (source.length !== descriptor.bytes || createHash('sha256').update(source).digest('hex') !== descriptor.sha256) {
    throw new Error('Prepared asset checksum mismatch. Run data preparation again.');
  }
  return { type: 'asset', fileName: `${folder}/${descriptor.file}`, source };
}
