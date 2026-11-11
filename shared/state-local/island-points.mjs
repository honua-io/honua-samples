// Island-wide point layers that approved pages inline for lists and markers.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const islandPointLayers = ['fire', 'police', 'hospitals', 'places', 'bridges', 'schools'];

export async function withIslandPoints({ manifest, directory, data }) {
  const result = { ...data };
  for (const name of islandPointLayers.filter((layer) => layer in data)) {
    const file = `${name}.geojson`;
    const integrity = manifest.files[file];
    if (!integrity) throw new Error(`Island manifest is missing ${file}`);
    const bytes = await readFile(path.join(directory, file));
    if (bytes.length !== integrity.bytes || createHash('sha256').update(bytes).digest('hex') !== integrity.sha256) {
      throw new Error(`${file} integrity failed`);
    }
    result[name] = JSON.parse(bytes);
  }
  return result;
}
