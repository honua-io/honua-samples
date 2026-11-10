import { expect, test } from '@playwright/test';
import { readPixels, serverEnv } from '../../../scripts/browser-verification/harness.mjs';
import { closeOperationsBrowser, prepareOperationsBrowser } from '../../../scripts/browser-verification/state-local.mjs';
import { request } from './fixture.mjs';

let browser;
let server;
let binding;
let unsafe;

test.beforeAll(async ({}, info) => {
  info.setTimeout(600_000);
  const geojson = { type: 'FeatureCollection', features: Array.from({ length: 205 }, (_, index) => request(index)) };
  const unlabelled = structuredClone(geojson);
  unlabelled.features.forEach(({ properties }) => { properties.is_demo = false; });
  browser = await prepareOperationsBrowser({ sampleUrl: new URL('..', import.meta.url), scenario: '311', seeds: {
    binding: { prefix: 'maui-311-ui', allowAnonymous: true, protocols: ['OgcFeatures'], fixture: { geojson, count: 205 } },
    unsafe: { prefix: 'maui-311-unsafe', allowAnonymous: true, fixture: { geojson: unlabelled, count: 205 } }
  } });
  server = browser.server;
  ({ binding, unsafe } = browser.bindings);
});

test.afterAll(async () => { await closeOperationsBrowser(browser); });

function url(source = binding) {
  const target = new URL('/maui-311/app/', server.url);
  target.search = new URLSearchParams({ baseUrl: serverEnv().baseUrl, service: source.serviceName, layer: String(source.layerId) });
  return target.href;
}

async function ready(page) {
  await page.goto(url());
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass', { timeout: 60_000 });
}

test('SR-01/02/03: real-server pagination, filters, metrics, timeline and labeled exports agree', async ({ page }) => {
  const requests = [];
  page.on('request', (req) => { if (/^https?:/.test(req.url())) requests.push(new URL(req.url()).origin); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  await expect(page.locator('#load-status')).toContainText('205 exercise requests');
  await expect(page.locator('#map-status')).toContainText('205 exercise requests mapped');
  const canvas = page.locator('#map canvas');
  const size = await canvas.boundingBox();
  const points = Array.from({ length: 100 }, (_, i) => [Math.floor(size.width * ((i % 10) + .5) / 10), Math.floor(size.height * (Math.floor(i / 10) + .5) / 10)]);
  const pixels = await readPixels(page, canvas, points);
  expect(pixels.some(({ r, g, b }) => (r > g * 1.2 && r > b * 1.2) || (b > r * 1.2 && b > g * 1.2) || (g > r * 1.2 && g > b * 1.2))).toBe(true);
  await expect(page.locator('#metrics')).toContainText('137');
  await expect(page.locator('#metrics')).toContainText('100%');
  await expect(page.locator('#scenario')).toContainText('2026-11-03');
  await expect(page.locator('#trend tr')).toHaveCount(12);
  await page.getByLabel('Request status').selectOption('exercise_closed');
  await expect(page.locator('#result-count')).toContainText('68 matching');
  await page.getByLabel('Find request or crew').fill('request-003');
  await expect(page.locator('#map-status')).toContainText('1 exercise requests mapped');
  await canvas.click({ position: { x: size.width / 2, y: size.height / 2 } });
  await expect(page.locator('#detail')).toContainText('Demo crew 3 (fictional)');
  await page.getByLabel('Find request or crew').fill('');
  await expect(page.locator('#result-count')).toContainText('68 matching');
  await page.getByRole('button', { name: 'Inspect request-003', exact: true }).click();
  await expect(page.locator('#detail')).toContainText('Demo crew 3 (fictional)');
  await expect(page.locator('#detail time')).toHaveCount(3);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download GeoJSON' }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.features).toHaveLength(68);
  expect(exported.features.every(({ properties }) => properties.display_label.includes('DEMO DATA'))).toBe(true);
  await page.getByLabel('Find request or crew').fill('nonexistent');
  await expect(page.locator('#result-count')).toContainText('0 matching');
  await expect(page.locator('#geojson')).toBeDisabled();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('#result-count')).toContainText('205 matching');
  await page.getByRole('button', { name: 'Show more requests' }).click();
  await expect(page.locator('#rows tr')).toHaveCount(50);
  expect([...new Set(requests)].sort()).toEqual([new URL(server.url).origin, new URL(serverEnv().baseUrl).origin].sort());
});

test('SR-05: unlabelled exercise layer is rejected and retry restores a complete snapshot', async ({ page }) => {
  await page.goto(url(unsafe));
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'fail');
  await expect(page.locator('#load-status')).toContainText('DEMO DATA provenance');
  await expect(page.locator('#dashboard')).toBeHidden();
  const queries = `**/rest/services/${binding.serviceName}/FeatureServer/${binding.layerId}/query*`;
  await page.route(queries, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 503, message: 'Fixture outage' } }) }));
  await page.goto(url());
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'fail');
  await page.unroute(queries);
  await page.getByRole('button', { name: 'Refresh data' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
  await expect(page.locator('#load-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#result-count')).toContainText('205 matching');
});

test('SR-08: OGC feed is verified independently of filters and a failed check can be retried', async ({ page }) => {
  await ready(page);
  const items = `**/ogc/features/collections/${binding.layerId}/items*`;
  await page.route(items, (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByRole('button', { name: 'Check OGC feed' }).click();
  await expect(page.locator('#feed-status')).toContainText('Feed not verified');
  await expect(page.locator('#feed-links a')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
  await page.unroute(items);
  await page.getByLabel('Request status').selectOption('exercise_closed');
  await expect(page.locator('#result-count')).toContainText('68 matching');
  await page.getByRole('button', { name: 'Check OGC feed' }).click();
  await expect(page.locator('#feed-status')).toContainText('Verified 205 exercise requests');
  await expect(page.getByRole('link', { name: 'OGC API Features collection', exact: true })).toHaveAttribute('href', `${serverEnv().baseUrl}/ogc/features/collections/${binding.layerId}`);
  await expect(page.locator('#feed-links a')).toHaveCount(2);
  await page.getByRole('button', { name: 'Refresh data' }).click();
  await expect(page.locator('#feed-links a')).toHaveCount(0);
  await expect(page.locator('#feed-status')).toContainText('has not been checked');
});

test('mobile and dark mode retain disclosure, controls and accessible request selection', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page.locator('.disclosure')).toBeVisible();
  await page.getByRole('button', { name: /dark mode/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('311-mobile-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /light mode/i }).click();
  await page.screenshot({ path: info.outputPath('311-desktop-light.png'), fullPage: true });
});

test('unconfigured app makes no claim that a county service is connected', async ({ page }) => {
  await page.goto(new URL('/maui-311/app/', server.url).href);
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'unconfigured');
  await expect(page.locator('#load-status')).toContainText('No layer connected');
  await expect(page.locator('#dashboard')).toBeHidden();
});
