import { islandPointLayers } from '../../../shared/state-local/island-points.mjs';

export function displayProvenance({ receipts, manifest }) {
  return receipts.map((receipt) => {
    const name = receipt.dataset;
    if (!islandPointLayers.includes(name)) return receipt;
    const source = manifest.sources?.[name];
    const file = `${name}.geojson`;
    const integrity = manifest.files[file];
    if (!source?.sourceUrl || !source.license || !source.licenseUrl || !source.attribution
      || !Number.isFinite(Date.parse(source.retrievedAt)) || !integrity?.sha256) {
      throw new Error(`Island display provenance is missing for ${name}`);
    }
    return { dataset: name, sourceUrl: source.sourceUrl, sha256: integrity.sha256,
      attribution: source.attribution, license: source.license, licenseUrl: source.licenseUrl,
      retrievalDate: source.retrievedAt, displayFile: `../state-local/data/island/${file}`,
      sourceManifest: '../state-local/data/island/manifest.json',
      note: 'Verified island display geometry; complete source and preparation receipts are in the source manifest.' };
  });
}
