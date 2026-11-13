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

function islandSourcesWithFeatures(prefix) {
  return HM.maps.flatMap((map) => Object.entries(map.getStyle()?.sources ?? {})
    .filter(([, source]) => source.type === 'vector' && String(source.url).startsWith(prefix))
    .map(([id]) => ({ id, loaded: map.isSourceLoaded(id), features: map.querySourceFeatures(id, { sourceLayer: 'layer' }).length })));
}

async function checkRoute(context, baseUrl, route) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const response = await page.goto(`${baseUrl}/state-local/${route}`);
    assert.equal(response.status(), 200, route);
    await page.waitForFunction((prefix) => {
      const maps = window.HM?.maps ?? [];
      return maps.length > 0 && maps.every((map) => map.loaded()) && maps.some((map) =>
        Object.entries(map.getStyle()?.sources ?? {}).some(([id, source]) => String(source.url).startsWith(prefix)
          && map.querySourceFeatures(id, { sourceLayer: 'layer' }).length > 0));
    }, ARCHIVE_PREFIX, { timeout: MAP_SETTLE_TIMEOUT_MS });
    const sources = await page.evaluate(islandSourcesWithFeatures, ARCHIVE_PREFIX);
    assert.ok(sources.some((source) => source.features > 0), `${route}: no island layer drew features`);
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
    const browser = await ENGINES[name].launch();
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
