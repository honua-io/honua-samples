import { islandPointLayers } from '../../../shared/state-local/island-points.mjs';

const nonemptyString = (value) => typeof value === 'string' && value.trim().length > 0;

export function displayProvenance({ receipts, manifest }) {
  return receipts.map((receipt) => {
    const name = receipt.dataset;
    if (!islandPointLayers.includes(name)) return receipt;
    const source = manifest.sources?.[name];
    const file = `${name}.geojson`;
    const integrity = manifest.files?.[file];
    if (!['sourceUrl', 'license', 'licenseUrl', 'attribution', 'retrievedAt'].every((field) => nonemptyString(source?.[field]))
      || !Number.isFinite(Date.parse(source.retrievedAt))
      || typeof integrity?.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(integrity.sha256)) {
      throw new Error(`Island display provenance is missing for ${name}`);
    }
    return { dataset: name, sourceUrl: source.sourceUrl, sha256: integrity.sha256,
      attribution: source.attribution, license: source.license, licenseUrl: source.licenseUrl,
      retrievalDate: source.retrievedAt, displayFile: `../state-local/data/island/${file}`,
      sourceManifest: '../state-local/data/island/manifest.json',
      note: 'Verified island display geometry; complete source and preparation receipts are in the source manifest.' };
  });
}
