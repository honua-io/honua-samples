export const displaySnapshot = import.meta.env?.VITE_STATE_LOCAL_SNAPSHOT === '1';

export async function snapshotFeatures(name) {
  return readSnapshotFeatures(new URL(`../data/${name}.geojson`, location.href));
}

export async function readSnapshotFeatures(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
  const collection = await response.json();
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('Invalid display snapshot');
  return collection.features;
}
