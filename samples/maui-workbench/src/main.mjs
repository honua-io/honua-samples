import { directCogSource, openRasterSession } from '@honua/sdk-js/raster';
import { createDepthDecoder } from './depth-decoder.mjs';
import { paintDepth, connectInspection } from './depth-view.mjs';
import './workbench.css';

const button = document.querySelector('#load-depth');
const status = document.querySelector('#load-status');
const canvas = document.querySelector('#depth-map');
const controller = new AbortController();
const limits = { maxRangeBytes: 512 * 1024, maxMetadataBytes: 256 * 1024,
  maxWindowBytes: 6 * 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024, maxWindowPixels: 1_048_576 };
let disconnect;

button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Reading numeric depth cells…';
  let session;
  try {
    const source = directCogSource({ url: new URL('./depth/lahaina-noaa-slr-3ft-depth.tif', location.href).href,
      mediaType: 'image/tiff; application=geotiff; profile=cloud-optimized' });
    session = await openRasterSession(source, { decoderFactory: createDepthDecoder, limits,
      signal: controller.signal, fetchFn: globalThis.fetch.bind(globalThis) });
    const raster = await session.readWindow({ space: 'pixel', x: 0, y: 0, width: 768, height: 1024, bands: [1] },
      { signal: controller.signal });
    if (raster.kind !== 'decoded-window' || raster.width !== 768 || raster.height !== 1024) {
      throw new Error('Prepared numeric grid dimensions changed.');
    }
    paintDepth(canvas, raster);
    disconnect = connectInspection(canvas, raster);
    canvas.setAttribute('aria-disabled', 'false');
    status.textContent = 'Numeric grid loaded. Hover, click or use arrow keys; inspection needs no further downloads.';
    button.hidden = true;
  } catch (error) {
    status.textContent = `Depth could not be loaded: ${error.message} Retry loading the prepared raster.`;
    button.textContent = 'Retry numeric raster';
    button.disabled = false;
  } finally { await session?.dispose(); }
});

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  controller.abort();
  disconnect?.();
});

document.getElementById('analysis-link').search = location.search;
