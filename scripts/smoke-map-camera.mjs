import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startSmokeSite } from './lib/smoke-site.mjs';

const routes = ['property', '311', 'public-works', 'emergency', 'workbench', 'sdk-explorer'];
const server = await startSmokeSite({ rootDir: path.resolve('site'), baseUrl: process.env.STATE_LOCAL_SMOKE_BASE_URL });
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

async function camera(page) {
  await page.waitForFunction(() => window.HM?.maps.some((map) => map._hash && map.loaded()), null, { timeout: 60_000 });
  return page.evaluate(() => {
    const map = window.HM.maps.find((entry) => entry._hash);
    return { center: map.getCenter().toArray(), zoom: map.getZoom(), bounded: map.getMaxBounds().contains(map.getCenter()) };
  });
}

function sameCamera(actual, expected, label) {
  assert.ok(actual.bounded && actual.zoom >= 8 && actual.zoom <= 19, `${label}: bounded camera`);
  assert.ok(Math.abs(actual.zoom - expected.zoom) <= 0.01, `${label}: zoom restored`);
  actual.center.forEach((value, index) => assert.ok(Math.abs(value - expected.center[index]) <= 0.001, `${label}: center restored`));
}

async function checkRoute(context, route) {
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const url = `${server.url}/state-local/${route}/`;
    await page.goto(url);
    const initial = await camera(page);
    for (const hash of ['map=2/0/0', 'map=22/85/179', 'map=12/NaN/-156.48', 'map=12//-156.48']) {
      await page.goto('about:blank');
      await page.goto(`${url}#keep=hello%20world&${hash}`);
      const normalized = await camera(page);
      sameCamera(normalized, initial, `${route} ${hash}: default`);
      assert.equal(await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('keep')), 'hello world');
      await page.reload();
      sameCamera(await camera(page), normalized, `${route} ${hash}: reload`);
    }
    await page.goto('about:blank');
    await page.goto(`${url}#map=12/20.88/-156.48`);
    const saved = { center: [-156.48, 20.88], zoom: 12 };
    sameCamera(await camera(page), saved, `${route}: valid input`);
    await page.reload();
    sameCamera(await camera(page), saved, `${route}: valid reload`);
    assert.deepEqual(errors, [], `${route}: page exceptions`);
  } finally { await page.close(); }
}

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      for (const route of routes) {
        await checkRoute(context, route);
        console.log(`PASS ${width}px ${route}: four invalid cameras normalize and reload; valid camera preserved`);
      }
    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
