export const displaySnapshot = import.meta.env?.VITE_STATE_LOCAL_SNAPSHOT === '1';

export async function snapshotFeatures(name) {
  const response = await fetch(new URL(`../data/${name}.geojson`, location.href));
  if (!response.ok) throw new Error(`Snapshot ${name}: HTTP ${response.status}`);
  const collection = await response.json();
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('Invalid display snapshot');
  return collection.features;
}
