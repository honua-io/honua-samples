// Every state-local page must draw its island PMTiles layers in each browser engine, reading the
// archives byte-exact from the demo CDN. Serves the built site/ locally, or checks a deployed site
// when ISLAND_SMOKE_BASE_URL is set (e.g. https://samples.honua.io).
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';

const ROUTES = ['', 'workbench/', 'property/', 'property/mobile/', '311/', 'public-works/', 'emergency/'];
const ENGINES = { chromium, firefox, webkit };
const requestedEngines = (process.env.ISLAND_SMOKE_BROWSERS ?? 'chromium,firefox').split(',');
const ARCHIVE_PREFIX = 'pmtiles://https://demo.honua.io/demo-data/';
const MAP_SETTLE_TIMEOUT_MS = 60_000;
// Headless Firefox on GPU-less CI hosts refuses WebGL unless software rendering is forced.
const LAUNCH_OPTIONS = { firefox: { firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.enable-webgl2': true } } };

// Runs in the page: the CDN-backed island sources once every map has loaded and one of them drew features.
function drawnIslandSources(prefix) {
  const maps = window.HM?.maps ?? [];
  if (maps.length === 0 || !maps.every((map) => map.loaded())) return null;
  const sources = maps.flatMap((map) => Object.entries(map.getStyle()?.sources ?? {})
    .filter(([, source]) => source.type === 'vector' && String(source.url).startsWith(prefix))
    .map(([id]) => ({ id, features: map.querySourceFeatures(id, { sourceLayer: 'layer' }).length })));
  return sources.some((source) => source.features > 0) ? sources : null;
}

async function checkRoute(context, baseUrl, route) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const response = await page.goto(`${baseUrl}/state-local/${route}`);
    assert.equal(response.status(), 200, route);
    const drawn = await page.waitForFunction(drawnIslandSources, ARCHIVE_PREFIX, { timeout: MAP_SETTLE_TIMEOUT_MS })
      .catch(async (error) => {
        const state = await page.evaluate(() => (window.HM?.maps ?? []).map((map) => ({ loaded: map.loaded(), sources: Object.keys(map.getStyle()?.sources ?? {}) })));
        throw new Error(`${route}: island layers never drew (${error.message}); maps ${JSON.stringify(state)}; errors ${JSON.stringify(errors.slice(0, 5))}`);
      });
    const sources = await drawn.jsonValue();
    const decodeErrors = errors.filter((text) => /decod|ETag|pmtiles/i.test(text));
    assert.deepEqual(decodeErrors, [], `${route}: archive read errors`);
    return { route: `/state-local/${route}`, sources };
  } finally {
    await page.close();
  }
}

const server = process.env.ISLAND_SMOKE_BASE_URL ? null : await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const baseUrl = process.env.ISLAND_SMOKE_BASE_URL?.replace(/\/+$/, '') ?? server.url;
try {
  for (const name of requestedEngines) {
    assert.ok(ENGINES[name], `ISLAND_SMOKE_BROWSERS names an unknown engine: ${name}`);
    const browser = await ENGINES[name].launch(LAUNCH_OPTIONS[name]);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      for (const route of ROUTES) {
        const result = await checkRoute(context, baseUrl, route);
        console.log(`${name} ${browser.version()} ${result.route}: ${result.sources.map((s) => `${s.id}=${s.features}`).join(' ')}`);
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await server?.close();
}
