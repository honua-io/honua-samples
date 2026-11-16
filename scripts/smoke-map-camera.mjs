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

async function checkDeferredHistoryWrite(page, route) {
  // Force the deferred native serializer into the gap between popstate and
  // hashchange. Without synchronous restoration it overwrites zoom 11 with 13.
  const serialized = await page.evaluate(() => {
    const map = window.HM.maps.find((entry) => entry._hash);
    map.jumpTo({ center: [-156.44, 20.91], zoom: 13 });
    history.replaceState(history.state, '', '#keep=hello%20world&map=11/20.86/-156.50');
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    map._hash._updateHashUnthrottled();
    const hash = new URLSearchParams(location.hash.slice(1));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return { camera: hash.get('map'), keep: hash.get('keep') };
  });
  assert.equal(Number(serialized.camera.split('/')[0]), 11, `${route}: deferred writer preserves history destination`);
  assert.equal(serialized.keep, 'hello world');
  sameCamera(await camera(page), { center: [-156.50, 20.86], zoom: 11 }, `${route}: deferred history write`);
}

async function checkBrowserHistory(page, route) {
  // Exercise real rapid and settled browser traversal as well as the forced gap.
  for (const delay of [0, 350]) {
    await page.evaluate(() => { location.hash = 'keep=hello%20world&map=13/20.91/-156.44'; });
    await page.waitForFunction(() => Math.abs(HM.maps.find((map) => map._hash).getZoom() - 13) < 0.01);
    if (delay) await page.waitForTimeout(delay);
    await page.goBack();
    await page.waitForFunction(() => Math.abs(HM.maps.find((map) => map._hash).getZoom() - 11) < 0.01);
    if (delay) await page.waitForTimeout(delay);
    await page.goForward();
    await page.waitForFunction(() => Math.abs(HM.maps.find((map) => map._hash).getZoom() - 13) < 0.01);
    await page.waitForTimeout(350);
    sameCamera(await camera(page), { center: [-156.44, 20.91], zoom: 13 }, `${route}: Forward (${delay}ms)`);
    assert.equal(await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('keep')), 'hello world');
    await page.evaluate(() => { location.hash = 'keep=hello%20world&map=11/20.86/-156.50'; });
    await page.waitForFunction(() => Math.abs(HM.maps.find((map) => map._hash).getZoom() - 11) < 0.01);
  }
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
    await checkDeferredHistoryWrite(page, route);
    await checkBrowserHistory(page, route);
    assert.deepEqual(errors, [], `${route}: page exceptions`);
  } finally { await page.close(); }
}

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    // Web-font cache timing changes layout while the initial camera is fitted.
    await context.route('https://fonts.googleapis.com/**', (route) => route.abort());
    try {
      for (const route of routes) {
        await checkRoute(context, route);
        console.log(`PASS ${width}px ${route}: four invalid cameras normalize and reload; valid camera and rapid/settled history preserved`);
      }
    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
