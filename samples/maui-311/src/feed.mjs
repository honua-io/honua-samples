import { exportGeojson } from './records.mjs';
import { requestFeature } from './source.mjs';

export function collectionUrl(binding) {
  return new URL(`/ogc/features/collections/${binding.layerId}`, binding.baseUrl).href;
}

function snapshot(records) {
  return exportGeojson([...records].sort((a, b) => a.id.localeCompare(b.id))).features.map((feature) => ({
    ...feature, properties: { ...feature.properties, is_demo: true, exercise_only: true },
  }));
}

export async function verifyFeed(options) {
  const { binding, records, getJson } = options;
  const features = [];
  let page;
  do {
    const url = new URL(`${collectionUrl(binding)}/items`);
    url.search = new URLSearchParams({ limit: '200', offset: String(features.length) });
    page = await getJson(url.href);
    if (page.type !== 'FeatureCollection' || !Array.isArray(page.features)
      || page.numberReturned !== page.features.length
      || (page.numberMatched != null && page.numberMatched !== records.length)) throw new Error('OGC feed count does not match the dashboard');
    features.push(...page.features.map((feature) => requestFeature({ geometry: feature.geometry,
      attributes: feature.properties })));
    if (features.length > records.length) throw new Error('OGC feed contains additional records');
  } while (page.features.length);
  if (JSON.stringify(snapshot(features)) !== JSON.stringify(snapshot(records))) throw new Error('OGC feed records differ from the dashboard. Refresh data and retry');
  return collectionUrl(binding);
}
