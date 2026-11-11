import { drawPolygon } from './sketch.mjs';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { serverEnv } from '../../../scripts/browser-verification/harness.mjs';
import { closeOperationsBrowser, prepareOperationsBrowser } from '../../../scripts/browser-verification/state-local.mjs';
import { request } from '../../maui-311/verify/fixture.mjs';

let browser;
let bindings;

test.beforeAll(async ({}, info) => {
  info.setTimeout(600_000);
  const requests = { type: 'FeatureCollection', features: Array.from({ length: 205 }, (_, index) => request(index)) };
  const unsafe = structuredClone(requests);
  unsafe.features.forEach(({ properties }) => { properties.is_demo = false; });
  const parcels = { type: 'FeatureCollection', features: [1, 2, 3].map((id) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [-156.47 + id * .001, 20.88] },
    properties: { tmk_txt: `DEMO-PARCEL-${id}`, gisacres: id, taxacres: id },
  })) };
  browser = await prepareOperationsBrowser({ sampleUrl: new URL('..', import.meta.url), seeds: {
    requests: { prefix: 'workbench-requests', allowAnonymous: true, fixture: { geojson: requests, count: 205 } },
    parcels: { prefix: 'workbench-parcels', allowAnonymous: true, fixture: { geojson: parcels, count: 3 } },
    unsafe: { prefix: 'workbench-unsafe', allowAnonymous: true, fixture: { geojson: unsafe, count: 205 } },
  } });
  bindings = browser.bindings;
});

test.afterAll(async () => { await closeOperationsBrowser(browser); });

function url(requests = bindings.requests) {
  const target = new URL('/maui-workbench/app/analysis.html', browser.server.url);
  target.search = new URLSearchParams({ baseUrl: serverEnv().baseUrl,
    requestsService: requests.serviceName, requestsLayer: String(requests.layerId),
    parcelsService: bindings.parcels.serviceName, parcelsLayer: String(bindings.parcels.layerId) });
  return target.href;
}

async function exported(page, format) {
  const pending = page.waitForEvent('download');
  await page.locator(`#export-${format}`).click();
  return readFile(await (await pending).path(), 'utf8');
}

async function checkRequestAnalysis(page) {
  await expect(page.locator('#connection-status')).toContainText('311 service requests connected', { timeout: 60_000 });
  await expect(page.locator('#map-status')).toHaveText('205 matching records mapped.');
  const all = JSON.parse(await exported(page, 'geojson')).features;
  expect(all).toHaveLength(205);
  expect(new Set(all.map(({ id }) => id)).size).toBe(205);
  expect(all.every(({ properties, geometry }) => properties.display_label.includes('DEMO DATA') && geometry)).toBe(true);
  await page.locator('#chart-filters').getByRole('button', { name: 'exercise_open · 69', exact: true }).click();
  await expect(page.locator('#map-status')).toHaveText('69 matching records mapped.');
  await expect(page.locator('#chart-filters').getByRole('button', { name: 'exercise_closed · 68', exact: true })).toBeVisible();
  await page.locator('#feature-table').locator('tbody tr[data-row-key]').first().getByRole('gridcell').first().click();
  await expect(page.locator('#selection-status')).toContainText('1 selected');
  const matching = JSON.parse(await exported(page, 'geojson')).features;
  expect(matching.map(({ properties }) => properties.record_id).sort()).toEqual(
    Array.from({ length: 69 }, (_, index) => request(index * 3).properties.record_id).sort());
  expect(await exported(page, 'csv')).toContain('DEMO DATA');
  await page.locator('#field').selectOption('record_id');
  await page.locator('#value').fill('request-001');
  await page.locator('#apply').click();
  await expect(page.locator('#map-status')).toHaveText('1 matching records mapped.');
  await page.locator('#clear').click();
  await expect(page.locator('#map-status')).toHaveText('205 matching records mapped.');
}

test('real-server registry links map, table, chart and complete labeled exports', async ({ page }) => {
  const origins = new Set();
  page.on('request', (request) => { if (/^https?:/u.test(request.url())) origins.add(new URL(request.url()).origin); });
  await page.goto(url());
  await checkRequestAnalysis(page);
  await page.locator('#catalog').selectOption('parcels');
  await expect(page.locator('#connection-status')).toContainText('Parcels connected');
  await expect(page.locator('#map-status')).toHaveText('3 matching records mapped.');
  await expect(page.locator('#filter-summary')).toHaveText('No filters applied.');
  expect(JSON.parse(await exported(page, 'geojson')).features.map(({ properties }) => properties.tmk_txt).sort())
    .toEqual(['DEMO-PARCEL-1', 'DEMO-PARCEL-2', 'DEMO-PARCEL-3']);
  expect([...origins].sort()).toEqual([new URL(browser.server.url).origin, new URL(serverEnv().baseUrl).origin].sort());
});

test('real-server unlabelled 311 records cannot produce map or exports', async ({ page }) => {
  await page.goto(url(bindings.unsafe));
  await expect(page.locator('#connection-status')).toContainText('DEMO DATA provenance', { timeout: 60_000 });
  await expect(page.locator('#map-status')).toHaveText('No completed map result. Retry before using these records.');
  await expect(page.locator('#export-csv')).toBeDisabled();
  await expect(page.locator('#export-geojson')).toBeDisabled();
});


test('real-server polygon intersection excludes a parcel inside its bounding box', async ({ page }) => {
  await page.goto(url());
  await expect(page.locator('#connection-status')).toContainText('311 service requests connected', { timeout: 60_000 });
  await page.locator('#catalog').selectOption('parcels');
  await expect(page.locator('#map-status')).toHaveText('3 matching records mapped.');
  await page.locator('#measurement').evaluate((node) => node.map.jumpTo({ center: [-156.468, 20.88], zoom: 15 }));
  const ring = [[-156.4694, 20.8796], [-156.4664, 20.8796], [-156.4694, 20.8808], [-156.4694, 20.8796]];
  await drawPolygon(page, ring);
  await expect(page.locator('#filter-summary')).toHaveText('Intersects drawn polygon (3 vertices)');
  await expect(page.locator('#map-status')).toHaveText('2 matching records mapped.');
  await expect(page.locator('#feature-table').locator('tbody tr[data-row-key]')).toHaveCount(2);
  expect(JSON.parse(await exported(page, 'geojson')).features.map(({ properties }) => properties.tmk_txt).sort())
    .toEqual(['DEMO-PARCEL-1', 'DEMO-PARCEL-2']);
  await page.locator('#share').click();
  await page.goto(await page.locator('#share-url').inputValue());
  await expect(page.locator('#map-status')).toHaveText('2 matching records mapped.');
  await page.locator('#remove-bounds').click();
  await expect(page.locator('#map-status')).toHaveText('3 matching records mapped.');
});
