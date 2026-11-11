import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifiedAsset } from '../../../shared/state-local/verified-asset.mjs';

export async function loadDepthAssets(directory) {
  const receipt = JSON.parse(await readFile(path.join(directory, 'receipt.json'), 'utf8'));
  const conversion = receipt.conversion;
  if (receipt.schemaVersion !== 1 || receipt.scenario !== '+3 ft sea level above MHHW'
    || receipt.attribution !== 'NOAA Office for Coastal Management, Sea Level Rise Viewer'
    || conversion?.outputCrs !== 'EPSG:3857' || conversion.dtype !== 'float32'
    || conversion.nodata !== -9999 || conversion.units !== 'metres above ground'
    || conversion.resampling !== 'nearest' || conversion.width !== 768 || conversion.height !== 1024
    || receipt.output?.file !== 'lahaina-noaa-slr-3ft-depth.tif'
    || !['depth-directory', 'dataset-metadata', 'reuse-policy'].every((key) => receipt.terms?.[key]?.sha256)) {
    throw new Error('Complete prepared NOAA depth receipt required.');
  }
  return [await verifiedAsset(directory, receipt.output, 'depth'),
    { type: 'asset', fileName: 'depth/receipt.json', source: JSON.stringify(receipt) }];
}
