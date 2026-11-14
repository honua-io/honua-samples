// Deliberately broken demo controls exercise the same browser checker as the nightly job.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, firefox } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';
import { checkGalleryPage } from './lib/gallery-health-check.mjs';
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from './lib/gallery-visual-contract.mjs';
import { discoverGallery } from './lib/gallery-health-discovery.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'gallery-health-controls-'));
const output = path.resolve('.artifacts/gallery-health-controls');
await mkdir(output, { recursive: true });
const feature = '<svg width="200" height="200" class="leaflet-overlay-pane"><path class="leaflet-interactive" d="M10 10 L180 10 L180 180 Z" fill="green"/></svg>';
const demo = (body) => `<!doctype html><title>Health control</title><h1>Demo</h1><div class="leaflet-container">${body}</div>`;
await writeFile(path.join(root, 'index.html'), '<h1>Gallery</h1><a class="demo" href="/good.html">Good</a><a class="demo" href="/blank.html">New demo</a>');
await writeFile(path.join(root, 'good.html'), demo(feature));
await writeFile(path.join(root, 'blank.html'), demo(''));
await writeFile(path.join(root, 'icons.html'), '<h1>Non-map page</h1><svg style="display:none"><symbol id="i-map"><path d="M0 0 L20 20"/></symbol></svg>');
await writeFile(path.join(root, 'module-map.html'), `<!doctype html><h1>Module map</h1><canvas width="200" height="200"></canvas><script type="module">
  const map = { getCanvas: () => document.querySelector('canvas'),
    getStyle: () => ({ sources: { records: { type: 'geojson' } }, layers: [{ id: 'records', source: 'records' }] }),
    queryRenderedFeatures: () => [{ id: 'painted-feature' }] };
  window.sampleMap = map;
</script>`);
await writeFile(path.join(root, 'console.html'), demo(`${feature}<script>console.error('deliberately broken demo')</script>`));
await writeFile(path.join(root, 'link.html'), demo(`${feature}<a href="/missing.html">Broken link</a>`));
const server = await startStaticServer({ rootDir: root, port: 0 });
async function assertPage(context, scenario, identity) {
  const [file, failure] = scenario;
  const result = await checkGalleryPage(context, { url: `${server.url}/${file}.html`, ...(file === 'icons' ? {} : { mapRequired: true }) }, {
    directory: output, id: `${identity}-${file}`, timeout: 1500,
  });
  assert.equal(result.ok, failure === null, JSON.stringify(result));
  if (failure) {
    assert.match(result.failure, failure);
    assert.ok((await readFile(path.join(output, result.screenshot))).length > 100);
  } else assert.ok(result.firstPaintMs > 0);
  console.log(`${identity}: ${file} ${result.ok ? 'passes' : 'rejected with screenshot'}`);
}

async function assertProfile(browser, identity, viewport) {
  const context = await browser.newContext({ viewport });
  try {
    const source = { url: server.url, selector: 'a.demo', kind: 'website' };
    const entries = await discoverGallery(context, { sources: [source] });
    assert.equal(entries.length, 3, 'newly added card is discovered automatically');
    const manifest = { sources: [{ ...source, inventory: `${server.url}/inventory.json` }] };
    assert.equal((await discoverGallery(context, manifest)).find((entry) => entry.url.endsWith('/good.html')).mapRequired, true);
    const partial = await discoverGallery(context, { sources: [{ ...source, url: `${server.url}/missing.html` }, source] }, { directory: output, id: identity });
    assert.equal(partial.failures.length, 1);
    assert.equal(partial.entries.length, 3, 'a broken inventory must not skip healthy inventories');
    assert.ok((await readFile(path.join(output, partial.failures[0].screenshot))).length > 100);
    for (const scenario of [['good', null], ['module-map', null], ['icons', null], ['blank', /Map never painted/], ['console', /deliberately broken/], ['link', /Broken links/]]) {
      await assertPage(context, scenario, identity);
    }
  } finally { await context.close(); }
}

await writeFile(path.join(root, 'inventory.json'), JSON.stringify({ format: 'honua.gallery-health-inventory.v1', entries: [{ url: '/good.html', mapRequired: true }] }));
try {
  for (const [name, launcher] of Object.entries({ chromium, firefox })) {
    const browser = await launcher.launch(name === 'firefox' ? { headless: !process.env.DISPLAY } : {});
    try {
      await assertProfile(browser, `${name}-desktop`, DESKTOP_VIEWPORT);
      await assertProfile(browser, `${name}-mobile`, MOBILE_VIEWPORT);
    } finally { await browser.close(); }
  }
} finally {
  await server.close();
  await rm(root, { recursive: true, force: true });
}
