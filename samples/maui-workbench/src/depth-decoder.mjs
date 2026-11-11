import { GeoTIFF } from 'geotiff';
import { createBoundedCogDecoder } from '../../../shared/state-local/cog-decoder.mjs';

const MAX_GRID_CELLS = 1024 * 1024;
const MAX_DECODED_BLOCK_BYTES = 256 * 256 * Float32Array.BYTES_PER_ELEMENT;

export function inspectDepth(images) {
  const base = images[0];
  if (!base || images.some((image, index) => !image.isTiled || (index > 0
    && (image.getFileDirectory().getValue('NewSubfileType') & 1) !== 1))
    || base.getGeoKeys().ProjectedCSTypeGeoKey !== 3857 || base.getSamplesPerPixel() !== 1
    || base.getBitsPerSample(0) !== 32 || base.getSampleFormat(0) !== 3 || base.getGDALNoData() !== -9999) {
    throw new Error('Expected the prepared EPSG:3857 Float32 depth COG with NoData -9999.');
  }
  for (const image of images) {
    const dimensions = [image.getWidth(), image.getHeight(), image.getTileWidth(), image.getTileHeight()];
    if (dimensions.some((value) => !Number.isSafeInteger(value) || value < 1)
      || image.getWidth() * image.getHeight() > MAX_GRID_CELLS
      || image.getTileWidth() * image.getTileHeight() * 4 > MAX_DECODED_BLOCK_BYTES
      || image.getSamplesPerPixel() !== 1 || image.getBitsPerSample(0) !== 32 || image.getSampleFormat(0) !== 3) {
      throw new Error('Prepared depth grid or decoded tile exceeds the bounded Float32 layout.');
    }
  }
  const [west, south, east, north] = base.getBoundingBox();
  const resolution = base.getResolution();
  return {
    format: 'cog', width: base.getWidth(), height: base.getHeight(),
    crs: { kind: 'known', authority: 'EPSG', code: '3857', name: 'Web Mercator' },
    bands: [{ index: 1, dataType: 'float32', name: 'Depth in metres above ground', nodata: -9999 }],
    resolution: { x: Math.abs(resolution[0]), y: Math.abs(resolution[1]), unit: 'metre' },
    footprint: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
    overviewDecimations: images.slice(1).map((image) => Math.round(base.getWidth() / image.getWidth())),
  };
}

export function createDepthDecoder() {
  return createBoundedCogDecoder({
    open: (source, signal) => GeoTIFF.fromSource(source, { cache: true }, signal), inspect: inspectDepth,
  });
}
