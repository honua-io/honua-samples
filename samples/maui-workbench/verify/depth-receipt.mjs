import { createHash } from 'node:crypto';

export const DEPTH_FILE = 'lahaina-noaa-slr-3ft-depth.tif';

export function syntheticDepthReceipt(bytes) {
  const file = DEPTH_FILE;
  return { schemaVersion: 1, scenario: '+3 ft sea level above MHHW',
    attribution: 'NOAA Office for Coastal Management, Sea Level Rise Viewer',
    terms: Object.fromEntries(['depth-directory', 'dataset-metadata', 'reuse-policy'].map((key) => [key, { sha256: 'synthetic-test-only' }])),
    conversion: { outputCrs: 'EPSG:3857', dtype: 'float32', nodata: -9999, units: 'metres above ground',
      resampling: 'nearest', width: 768, height: 1024 },
    output: { file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } };
}
