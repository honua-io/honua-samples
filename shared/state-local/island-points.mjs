// Island-wide point layers that approved pages inline for lists and markers.
import { readVerifiedFile } from './locked-archive.mjs';

export const islandPointLayers = ['fire', 'police', 'hospitals', 'places', 'bridges', 'schools'];

export async function withIslandPoints({ manifest, directory, data }) {
  const result = { ...data };
  for (const name of islandPointLayers.filter((layer) => layer in data)) {
    const file = `${name}.geojson`;
    const integrity = manifest.files[file];
    if (!integrity) throw new Error(`Island manifest is missing ${file}`);
    result[name] = JSON.parse(await readVerifiedFile({ directory, file, integrity }));
  }
  return result;
}
