import { expect, test } from '@playwright/test';
import { readPixels, serverEnv, settleMapCanvas, replaceFixture } from '../../../scripts/browser-verification/harness.mjs';
import { closeOperationsBrowser, prepareOperationsBrowser } from '../../../scripts/browser-verification/state-local.mjs';
import { exerciseFeature } from './fixture.mjs';

let browser;
const fixture = (features) => ({ geojson: { type: 'FeatureCollection', features }, count: features.length });

test.beforeAll(async ({}, info) => {
  info.setTimeout(600_000);
  const shelters = Array.from({ length: 30 }, (_, index) => exerciseFeature(index));
  const closures = Array.from({ length: 3 }, (_, index) => exerciseFeature(index, 'exercise_closure'));
  const unsafe = exerciseFeature();
  unsafe.properties.exercise_only = false;
  browser = await prepareOperationsBrowser({ sampleUrl: new URL('..', import.meta.url), scenario: 'emergency', seeds: {
    shelter: { prefix: 'maui-em-shelters', allowAnonymous: true, fixture: fixture(shelters) },
    closure: { prefix: 'maui-em-closures', allowAnonymous: true, fixture: fixture(closures) },
    changing: { prefix: 'maui-em-changing', allowAnonymous: true, fixture: fixture([exerciseFeature()]) },
    tsunami: { prefix: 'maui-em-zones', allowAnonymous: true, fixture: fixture([{ type: 'Feature', properties: { zone_type: 'Tsunami Evacuation Zone', validation_geometry: true }, geometry: { type: 'Polygon', coordinates: [[[-156.51,20.84],[-156.45,20.84],[-156.45,20.9],[-156.51,20.9],[-156.51,20.84]], [[-156.49,20.86],[-156.49,20.88],[-156.47,20.88],[-156.47,20.86],[-156.49,20.86]]] } }]) },
    roads: { prefix: 'maui-em-roads', allowAnonymous: true, fixture: fixture([{ type: 'Feature', properties: { validation_geometry: true }, geometry: { type: 'LineString', coordinates: [[-156.51,20.86],[-156.45,20.86]] } }]) },
    unsafe: { prefix: 'maui-em-unsafe', allowAnonymous: true, fixture: fixture([unsafe]) }
  } });

});
test.afterAll(async () => { await closeOperationsBrowser(browser); });

function url(overrides = {}) {
  const target = new URL('/maui-emergency/app/', browser.server.url);
  const sources = { ...browser.bindings, ...overrides };
  const params = new URLSearchParams({ baseUrl: serverEnv().baseUrl });
  for (const name of ['shelter', 'closure', 'tsunami', 'roads']) {
    if (!sources[name]) continue;
    params.set(`${name}Service`, sources[name].serviceName);
    params.set(`${name}Layer`, String(sources[name].layerId));
  }
  target.search = params;
  return target.href;
}
async function ready(page, overrides) {
  await page.goto(url(overrides));
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass', { timeout: 60_000 });
}

test('EM-01 bounded slice: real-server map, fictional capacity, filters and keyboard details', async ({ page }) => {
  const origins = new Set();
  page.on('request', (request) => { if (/^https?:/.test(request.url())) origins.add(new URL(request.url()).origin); });
  await ready(page);
  await expect(page.locator('#map-status')).toContainText('33 records mapped');
  const canvas = page.locator('#map canvas');
  await expect(page.locator('[data-geometry-source]').first()).toContainText('Synthetic validation geometry');
  const search = page.getByLabel('Find record or anchor');
  for (const [anchor, color] of [['maui-public-schools:30', 'teal'], ['exercise_closure-3', 'amber']]) {
    await search.fill('');
    await expect(page.locator('#map-status')).toContainText('33 records mapped');
    await search.fill(anchor);
    await expect(page.locator('#map-status')).toContainText('1 records mapped');
    await settleMapCanvas(page);
    const size = await canvas.boundingBox();
    const [pixel] = await readPixels(page, canvas, [[Math.floor(size.width / 2), Math.floor(size.height / 2)]]);
    if (color === 'teal') expect(pixel.g > pixel.r * 2 && pixel.b > pixel.r * 2).toBe(true);
    else expect(pixel.r > pixel.g * 1.2 && pixel.g > pixel.b * 1.2).toBe(true);
  }
  await search.fill('');
  await expect(page.locator('#map-status')).toContainText('33 records mapped');
  await expect(page.locator('#metrics')).toContainText('2,000');
  await expect(page.locator('#metrics')).toContainText('400');
  await expect(page.locator('#rows tr')).toHaveCount(25);
  await page.getByRole('button', { name: 'Show more records' }).click();
  await expect(page.locator('#rows tr')).toHaveCount(33);
  await page.getByRole('combobox', { name: 'Resource', exact: true }).selectOption('exercise_closure');
  await expect(page.locator('#rows tr')).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Exercise status', exact: true }).selectOption('exercise_open');
  await expect(page.locator('#rows tr')).toHaveCount(1);
  const record = page.locator('#rows').getByRole('button', { name: 'exercise_closure-1', exact: true });
  await record.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#detail')).toBeFocused();
  await expect(page.locator('#detail')).toContainText('maui-roads:1');
  await expect(page.locator('#detail')).toContainText('not an actual closure');
  await page.getByLabel('Find record or anchor').fill('missing');
  await expect(page.locator('#rows tr')).toHaveCount(0);
  await expect(page.locator('#detail')).toContainText('No records match');
  expect([...origins].sort()).toEqual([new URL(browser.server.url).origin, new URL(serverEnv().baseUrl).origin].sort());
});

test('EM-01 bounded slice: timer displays changed server data, failed refresh hides records, recovery verifies them', async ({ page }) => {
  await page.clock.install();
  await ready(page, { shelter: browser.bindings.changing });
  await expect(page.locator('#metrics')).toContainText('20');
  const updated = exerciseFeature();
  updated.properties.occupancy = 35;
  await replaceFixture({ fixture: fixture([updated]), tableName: browser.bindings.changing.tableName });
  await page.locator('#rows').getByRole('button', { name: 'exercise_shelter-1', exact: true }).click();
  await expect(page.locator('#detail')).toBeFocused();
  const firstCheck = await page.locator('#freshness').getAttribute('data-verified-at');
  let queries = 0;
  page.on('request', (request) => { if (request.url().includes('/query?')) queries++; });
  await page.clock.fastForward(60_001);
  await expect.poll(() => queries).toBeGreaterThanOrEqual(2);
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
  await expect(page.locator('#metrics')).toContainText('35');
  await expect(page.locator('#detail')).toBeFocused();
  await expect(page.locator('#detail')).toContainText('35');
  await expect(page.locator('#freshness')).not.toHaveAttribute('data-verified-at', firstCheck);
  const row = page.locator('#rows').getByRole('button', { name: 'exercise_shelter-1', exact: true });
  await row.focus();
  await page.clock.fastForward(60_001);
  await expect(row).toBeFocused();
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
  await expect(row).toBeFocused();
  await page.locator('#coordinates').fill('20.85, -156.5');
  await page.locator('#location-form').evaluate((form) => form.requestSubmit());
  await expect(page.locator('#location-answer')).toContainText('This point intersects');
  await page.route('**/query?**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }));
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'fail');
  await expect(page.locator('#dashboard')).toBeHidden();
  await page.locator('#location-form').evaluate((form) => form.requestSubmit());
  await expect(page.locator('#location-answer')).toContainText('Zone check unavailable');
  await expect(page.locator('#location-answer')).not.toContainText('This point intersects');
  await expect(page.locator('#freshness')).toContainText('do not establish source freshness');
  await page.unroute('**/query?**');
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
  await expect(page.locator('#rows tr')).toHaveCount(4);
  await page.locator('#location-form').evaluate((form) => form.requestSubmit());
  await expect(page.locator('#location-answer')).toContainText('This point intersects');
});

test('EM-01 bounded slice: unsafe and unbound layers do not show a situational map', async ({ page }) => {
  await page.goto(url({ shelter: browser.bindings.unsafe }));
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'fail');
  await expect(page.locator('#dashboard')).toBeHidden();
  await page.goto(new URL('/maui-emergency/app/?baseUrl=' + encodeURIComponent(serverEnv().baseUrl), browser.server.url).href);
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'unconfigured');
  await expect(page.locator('#dashboard')).toBeHidden();
  await expect(page.locator('#load-status')).toContainText('receipts');
});

test('EM-01 bounded slice: desktop and mobile light/dark layouts keep selected details reachable', async ({ page }, info) => {
  await ready(page);
  for (const [name, width, height, theme] of [['desktop-light', 1440, 900, 'light'], ['desktop-dark', 1440, 900, 'dark'],
    ['mobile-dark', 390, 844, 'dark'], ['mobile-light', 390, 844, 'light']]) {
    await page.setViewportSize({ width, height });
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await settleMapCanvas(page);
    if (width === 390) expect((await page.locator('#map').boundingBox()).y).toBeLessThan(height);
    await page.screenshot({ path: info.outputPath(`emergency-${name}.png`), fullPage: true });
  }
  await page.locator('#rows').getByRole('button', { name: 'exercise_shelter-1', exact: true }).click();
  await expect(page.locator('#detail')).toBeFocused();
  await expect(page.locator('#detail h2')).toBeInViewport();
  await expect(page.locator('#detail')).toContainText('not a designated shelter');
  await page.screenshot({ path: info.outputPath('emergency-mobile-selected.png') });
});

test('zone lookup uses real-server geometry for interior, hole, boundary and outside points', async ({ page, context }) => {
  await ready(page);
  await expect(page.locator('#location-answer')).toContainText('Connected');
  for (const [coordinates, expected] of [['20.85, -156.5', 'intersects mapped regular'], ['20.87, -156.48', 'No intersection found'], ['20.84, -156.5', 'intersects mapped regular'], ['20.92, -156.52', 'No intersection found']]) {
    await page.getByLabel('Latitude, longitude').fill(coordinates);
    await page.getByRole('button', { name: 'Check location', exact: true }).click();
    await expect(page.locator('#location-answer')).toContainText(expected);
    await expect(page.locator('#location-answer')).toContainText('not a safety determination');
    await expect(page.locator('#location-answer')).toContainText('no route or travel-time');
  }
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 20.85, longitude: -156.5 });
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.locator('#location-answer')).toContainText('intersects mapped regular');
  await context.clearPermissions();
  await page.reload();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.locator('#location-answer')).toContainText('Could not access');
  await ready(page, { tsunami: null, roads: null });
  await page.getByLabel('Latitude, longitude').fill('20.85, -156.5');
  await page.getByRole('button', { name: 'Check location', exact: true }).click();
  await expect(page.locator('#location-answer')).toContainText('Zone check unavailable');
  await ready(page, { roads: null });
  await expect(page.locator('#location-answer')).toContainText('Zone check unavailable');
});

test('location denial during startup survives completion of the initial snapshot load', async ({ page, context }) => {
  await context.clearPermissions();
  let releaseSnapshot;
  const heldSnapshot = new Promise((resolve) => { releaseSnapshot = resolve; });
  await page.route('**/data/exercise-data.json', async (route) => {
    await heldSnapshot;
    await route.continue();
  });
  try {
    await page.goto(new URL('/maui-emergency/app/', browser.server.url).href);
    await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'loading');
    await page.getByRole('button', { name: 'Use my location' }).click();
    await expect(page.locator('#location-answer')).toContainText('Could not access');
    releaseSnapshot();
    await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
    await expect(page.locator('#location-answer')).toContainText('Could not access');
  } finally { releaseSnapshot(); }
});

test('a pending geolocation response cannot replace a newer coordinate check', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (success, failure) => {
      window.pendingLocation = { success, failure };
    };
  });
  await page.getByRole('button', { name: 'Use my location' }).click();
  await page.getByLabel('Latitude, longitude').fill('20.85, -156.5');
  await page.getByRole('button', { name: 'Check location', exact: true }).click();
  await expect(page.locator('#location-answer')).toContainText('intersects mapped regular');
  await page.evaluate(() => {
    window.pendingLocation.success({ coords: { latitude: 20.92, longitude: -156.52 } });
    window.pendingLocation.failure();
  });
  await expect(page.locator('#location-answer')).toContainText('intersects mapped regular');
  await expect(page.getByLabel('Latitude, longitude')).toHaveValue('20.85, -156.5');
});

test('theme changes repaint map background and preserve distinguishable operational colors', async ({ page }) => {
  await ready(page);
  const canvas = page.locator('#map canvas');
  await settleMapCanvas(page);
  const [light] = await readPixels(page, canvas, [[4,4]]);
  await page.locator('.theme-toggle').click();
  await expect.poll(async () => (await readPixels(page, canvas, [[4,4]]))[0].r).toBeLessThan(light.r / 2);
  for (const anchor of ['maui-public-schools:30', 'exercise_closure-3']) {
    await page.getByLabel('Find record or anchor').fill(anchor);
    await expect(page.locator('#map-status')).toContainText('1 records mapped');
    await settleMapCanvas(page);
    const size = await canvas.boundingBox();
    const [pixel] = await readPixels(page, canvas, [[Math.floor(size.width / 2), Math.floor(size.height / 2)]]);
    if (anchor.startsWith('maui')) expect(pixel.g).toBeGreaterThan(pixel.r);
    else expect(pixel.r).toBeGreaterThan(pixel.b);
  }
});


test('published snapshot loads without server bindings and discloses dates', async ({ page }) => {
  await page.goto(new URL('/maui-emergency/app/', browser.server.url).href);
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
  await expect(page.locator('#freshness')).toContainText('Not a live server check');
  const receipt = await (await page.request.get(new URL('/maui-emergency/app/data/sources.json', browser.server.url).href)).json();
  expect(receipt.sources[2].sourceUrl).toContain('Hazards/MapServer/2');
  expect(receipt.sources[2].retrievalDate).toBe('2026-11-10T08:28:22.163Z');
  expect(receipt.sources[0].attribution).toContain('Hawaii Department of Education');
  await expect(page.locator('#location-answer')).toContainText('Connected');
  await page.locator('#rows button').first().click();
  await expect(page.locator('#detail a')).toHaveAttribute('href', './data/sources.json');
});
