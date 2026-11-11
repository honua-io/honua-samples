import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { islandSources } from './sources.mjs';
import { readMauiSnapshot } from '../maui-snapshot.mjs';
import { assertDefaultImportGeometry } from '../import-geometry.mjs';
import { sha256 } from '../../lib/checksum.mjs';

function assertSourceAttributes(collection, original) {
  const ignored = new Set(['objectid', 'source_objectid', 'source_part', 'data_origin']);
  const attributes = (properties) => JSON.stringify(Object.entries(properties).filter(([key]) => !ignored.has(key)).sort(([a], [b]) => a.localeCompare(b)));
  const expected = new Map(original.features.map((feature) => [String(feature.properties.objectid), attributes(feature.properties)]));
  if (collection.features.some((feature) => attributes(feature.properties) !== expected.get(String(feature.properties.source_objectid)))) {
    throw new Error('Prepared snapshot changed source attributes');
  }
}

export function assertPreservesSources(collection, original) {
  const ids = new Set(collection.features.map((feature) => String(feature.properties.source_objectid)));
  if (ids.size !== original.features.length
    || original.features.some((feature) => !ids.has(String(feature.properties.objectid)))) {
    throw new Error('Prepared snapshot does not preserve source identities');
  }
  assertSourceAttributes(collection, original);
}

export async function readIslandSnapshot(options) {
  const { name, directory, sourceDirectory } = options;
  const source = islandSources[name];
  if (!source) throw new Error('Unknown island source');
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const prepared = manifest.layers?.[name];
  const original = await readMauiSnapshot({ directory: sourceDirectory, name, source });
  const bytes = await readFile(path.join(directory, `${name}.geojson`));
  if (manifest.schemaVersion !== 1 || manifest.crs !== 'EPSG:4326'
    || prepared?.sourceSha256 !== original.receipt.cleanSha256
    || prepared.cleanSha256 !== sha256(bytes) || prepared.bytes !== bytes.length
    || prepared.engine?.shapely !== '2.1.2' || !prepared.engine?.geos) {
    throw new Error(`${name} prepared snapshot does not match its source or checksum`);
  }
  const geojson = JSON.parse(bytes);
  assertDefaultImportGeometry(geojson);
  if (geojson.features.length !== prepared.outputFeatures) throw new Error('Prepared feature count does not match manifest');
  assertPreservesSources(geojson, original.geojson);
  return { source, geojson, receipt: { ...original.receipt, cleanSha256: prepared.cleanSha256,
    accepted: geojson.features.length, rejected: 0, preparation: prepared,
    selection: { ...original.receipt.selection, kind: 'Island extent, recorded geometry repair and subdivision' } } };
}
