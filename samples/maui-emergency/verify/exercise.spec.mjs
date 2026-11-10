import { expect, test } from '@playwright/test';
import { readPixels, serverEnv, settleMapCanvas } from '../../../scripts/browser-verification/harness.mjs';
import { closeOperationsBrowser, prepareOperationsBrowser } from '../../../scripts/browser-verification/state-local.mjs';
import { exerciseFeature } from './fixture.mjs';
import { adminFetch } from '../../../scripts/lib/admin-api.mjs';

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
    unsafe: { prefix: 'maui-em-unsafe', allowAnonymous: true, fixture: fixture([unsafe]) }
  } });
});
test.afterAll(async () => { await closeOperationsBrowser(browser); });

function url(overrides = {}) {
  const target = new URL('/maui-emergency/app/', browser.server.url);
  const sources = { ...browser.bindings, ...overrides };
  const params = new URLSearchParams({ baseUrl: serverEnv().baseUrl });
  for (const name of ['shelter', 'closure']) {
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
  const size = await canvas.boundingBox();
  const pixels = await readPixels(page, canvas, Array.from({ length: 100 }, (_, i) => [
    Math.floor(size.width * ((i % 10) + .5) / 10), Math.floor(size.height * (Math.floor(i / 10) + .5) / 10)]));
  expect(pixels.some(({ r, g, b }) => (r > g * 1.2 && r > b * 1.2) || (g > r * 1.2 && g > b * 1.2))).toBe(true);
  await expect(page.locator('#metrics')).toContainText('2,000');
  await expect(page.locator('#metrics')).toContainText('400');
  await expect(page.locator('#rows tr')).toHaveCount(25);
  await page.getByRole('button', { name: 'Show more records' }).click();
  await expect(page.locator('#rows tr')).toHaveCount(33);
  await page.getByRole('combobox', { name: /^Resource/ }).selectOption('exercise_closure');
  await expect(page.locator('#rows tr')).toHaveCount(3);
  await page.getByRole('combobox', { name: /^Exercise status/ }).selectOption('exercise_open');
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
  const layerUrl = browser.bindings.changing.layerUrl;
  const response = await fetch(`${layerUrl}/query?where=1%3D1&outFields=*&returnGeometry=false&f=json`);
  const data = await response.json();
  expect(data.features).toHaveLength(1);
  const attributes = data.features[0].attributes;
  const objectIdField = data.objectIdFieldName ?? Object.keys(attributes).find((key) => key.toLowerCase() === 'objectid');
  expect(objectIdField).toBeTruthy();
  const edit = await adminFetch(serverEnv(), { method: 'POST', apiPath: `${new URL(layerUrl).pathname}/applyEdits`,
    body: { updates: [{ attributes: { [objectIdField]: attributes[objectIdField], occupancy: 35 } }] } });
  expect(edit.updateResults?.[0]?.success).toBe(true);
  const firstCheck = await page.locator('#freshness').getAttribute('data-verified-at');
  let queries = 0;
  page.on('request', (request) => { if (request.url().includes('/query?')) queries++; });
  await page.clock.fastForward(60_001);
  await expect.poll(() => queries).toBeGreaterThanOrEqual(2);
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
  await expect(page.locator('#metrics')).toContainText('35');
  await expect(page.locator('#freshness')).not.toHaveAttribute('data-verified-at', firstCheck);
  await page.route('**/query?**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }));
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'fail');
  await expect(page.locator('#dashboard')).toBeHidden();
  await expect(page.locator('#freshness')).toContainText('do not establish source freshness');
  await page.unroute('**/query?**');
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
  await expect(page.locator('#rows tr')).toHaveCount(4);
});

test('EM-01 bounded slice: unsafe and unbound layers do not show a situational map', async ({ page }) => {
  await page.goto(url({ shelter: browser.bindings.unsafe }));
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'fail');
  await expect(page.locator('#dashboard')).toBeHidden();
  await page.goto(new URL('/maui-emergency/app/', browser.server.url).href);
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
    await page.screenshot({ path: info.outputPath(`emergency-${name}.png`), fullPage: true });
  }
  await page.locator('#rows').getByRole('button', { name: 'exercise_shelter-1', exact: true }).click();
  await expect(page.locator('#detail')).toBeFocused();
  await expect(page.locator('#detail h2')).toBeInViewport();
  await expect(page.locator('#detail')).toContainText('not a designated shelter');
  await page.screenshot({ path: info.outputPath('emergency-mobile-selected.png') });
});
