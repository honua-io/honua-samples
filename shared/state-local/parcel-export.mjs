import { csvCell } from './csv.mjs';

export function parcelGeoJson(features, provenance) {
  return JSON.stringify({ type: 'FeatureCollection', features, provenance });
}

export function parcelCsv(features, provenance) {
  const fields = [...new Set(features.flatMap((feature) => Object.keys(feature.properties)))];
  const source = provenance.sources.parcels;
  const metadata = { snapshot: provenance.snapshot, attribution: provenance.attribution, warning: provenance.warning,
    source_url: source.sourceUrl, license: source.license, sources: JSON.stringify(provenance.sources) };
  const rows = [[...fields, ...Object.keys(metadata)],
    ...features.map((feature) => [...fields.map((field) => feature.properties[field]), ...Object.values(metadata)])];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
