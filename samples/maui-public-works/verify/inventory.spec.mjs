import { expect, test } from '@playwright/test';
import { readPixels, serverEnv, settleMapCanvas } from '../../../scripts/browser-verification/harness.mjs';
import { closeOperationsBrowser, prepareOperationsBrowser } from '../../../scripts/browser-verification/state-local.mjs';
import { bridgeFeature, exerciseFeature } from './fixture.mjs';

let browser;
const fixture = (features) => ({ geojson: { type: 'FeatureCollection', features }, count: features.length });

test.beforeAll(async ({}, info) => {
  info.setTimeout(600_000);
  const bridges = Array.from({ length: 3 }, (_, index) => bridgeFeature(index));
  const orders = Array.from({ length: 34 }, (_, index) => exerciseFeature(index));
  const inspections = Array.from({ length: 24 }, (_, index) => exerciseFeature(index, 'inspection'));
  browser = await prepareOperationsBrowser({ sampleUrl: new URL('..', import.meta.url), scenario: 'public-works', seeds: {
    bridges: { prefix: 'maui-pw-bridges', allowAnonymous: true, description: 'Data vintage 2025-06-20. Synthetic NBI schema fixture.', fixture: fixture(bridges) },
    orders: { prefix: 'maui-pw-orders', allowAnonymous: true, fixture: fixture(orders) },
    inspections: { prefix: 'maui-pw-inspections', allowAnonymous: true, fixture: fixture(inspections) },
    undated: { prefix: 'maui-pw-undated', allowAnonymous: true, fixture: fixture(bridges) }
  } });
});

test.afterAll(async () => { await closeOperationsBrowser(browser); });

function url(overrides = {}) {
  const target = new URL('/maui-public-works/app/', browser.server.url);
  const sources = { ...browser.bindings, ...overrides };
  const params = new URLSearchParams({ baseUrl: serverEnv().baseUrl });
  for (const [prefix, name] of [['bridge', 'bridges'], ['order', 'orders'], ['inspection', 'inspections']]) {
    params.set(`${prefix}Service`, sources[name].serviceName);
    params.set(`${prefix}Layer`, String(sources[name].layerId));
  }
  target.search = params;
  return target.href;
}

async function ready(page) {
  await page.goto(url());
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass', { timeout: 60_000 });
}

test('PW-01/02/03/04: real-server inventory, condition filters, board and exact asset joins', async ({ page }) => {
  const origins = new Set();
  page.on('request', (req) => { if (/^https?:/.test(req.url())) origins.add(new URL(req.url()).origin); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await expect(page.locator('#map-status')).toContainText('3 records mapped');
  const canvas = page.locator('#map canvas');
  const size = await canvas.boundingBox();
  const pixels = await readPixels(page, canvas, [[Math.floor(size.width / 2), Math.floor(size.height / 2)], ...Array.from({ length: 100 }, (_, i) => [
    Math.floor(size.width * ((i % 10) + .5) / 10), Math.floor(size.height * (Math.floor(i / 10) + .5) / 10)])]);
  expect(pixels.some(({ r, g, b }) => (r > g * 1.2 && r > b * 1.2) || (g > r * 1.2 && g > b * 1.2))).toBe(true);
  await expect(page.locator('#rows tr')).toHaveCount(3);
  await canvas.click({ position: { x: size.width / 2, y: size.height / 2 } });
  await expect(page.locator('#detail h2')).toHaveText('fixture-2');
  await page.locator('#rows').getByRole('button', { name: 'fixture-3', exact: true }).click();
  await expect(page.locator('#detail')).toContainText('June 20, 2025');
  await expect(page.locator('#detail')).toContainText('not a current safety assessment');
  await page.getByLabel('Condition', { exact: true }).selectOption('P');
  await expect(page.locator('#rows tr')).toHaveCount(1);
  await page.getByLabel('Map layer').selectOption('orders');
  await expect(page.locator('#rows tr')).toHaveCount(25);
  await expect(page.locator('#board .board-column')).toHaveCount(5);
  await expect(page.locator('#board li')).toHaveCount(34);
  await expect(page.locator('#crew-rows tr')).toHaveCount(4);
  await page.locator('#rows').getByRole('button', { name: 'work_order-1', exact: true }).click();
  await expect(page.locator('#detail')).toContainText('maui-roads:1');
  await expect(page.locator('#detail')).toContainText('inspection-9');
  await expect(page.locator('#detail')).not.toContainText('inspection-2');
  await page.getByLabel('Work-order stage', { exact: true }).selectOption('exercise_closed');
  await expect(page.locator('#rows tr')).toHaveCount(6);
  await page.getByLabel('Find record or crew').fill('nonexistent');
  await expect(page.locator('#rows tr')).toHaveCount(0);
  expect([...origins].sort()).toEqual([new URL(browser.server.url).origin, new URL(serverEnv().baseUrl).origin].sort());
});

test('PW-01: missing historical vintage and failed refresh hide the inventory', async ({ page }) => {
  await page.goto(url({ bridges: browser.bindings.undated }));
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'fail');
  await expect(page.locator('#dashboard')).toBeHidden();
  await expect(page.locator('#load-status')).toContainText('vintage');
  await ready(page);
  await page.route('**/query?**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }));
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'fail');
  await expect(page.locator('#dashboard')).toBeHidden();
  await page.unroute('**/query?**');
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
});

test('PW-01: mobile dark and desktop light layouts keep records accessible', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await settleMapCanvas(page);
  await page.screenshot({ path: info.outputPath('public-works-mobile-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await settleMapCanvas(page);
  await page.screenshot({ path: info.outputPath('public-works-desktop-light.png'), fullPage: true });
});

test('PW-01: unbound app shows setup instructions without loading an inventory', async ({ page }) => {
  await page.goto(new URL('/maui-public-works/app/', browser.server.url).href);
  await expect(page.locator('#dashboard')).toBeHidden();
  await expect(page.locator('#load-status')).toContainText('receipt');
  await expect(page.locator('body')).not.toHaveAttribute('data-sample-status', 'pass');
});
