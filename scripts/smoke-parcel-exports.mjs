import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';

async function readDownload(page, format) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: `Download selected parcel ${format}`, exact: true }).click();
  const download = await waiting;
  assert.match(download.suggestedFilename(), /^parcel-234039007\./);
  return readFile(await download.path(), 'utf8');
}

async function verifySelectedExport(page) {
  await page.locator('#q').fill('234039007');
  await page.locator('#q').press('Enter');
  await expect(page.locator('h1')).toContainText('3-4-039:007');
  await expect(page.locator('#parcelExports')).toContainText('Snapshot 2026-11-10');
  const csv = await readDownload(page, 'CSV');
  assert.match(csv, /"234039007"/);
  assert.match(csv, /"2026-11-10"/);
  assert.match(csv, /Generalized display snapshots/);
  const exported = JSON.parse(await readDownload(page, 'GeoJSON'));
  const selected = await page.evaluate(() => window.HM.get('parcels').features.find((feature) => String(feature.properties.t9) === '234039007'));
  assert.deepEqual(exported.features, [selected]);
  assert.equal(exported.provenance.snapshot, '2026-11-10');
  assert.ok(exported.provenance.sources.parcels.sourceUrl);
  assert.ok(exported.provenance.sources.parcels.license);
}

async function verifyBeforeMap(page, url) {
  const deepLink = `${url}?tmk=234039007`;
  await page.route(deepLink, async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace('map = HM.create(', 'map = (() => undefined)(');
    await route.fulfill({ response, body: html });
  });
  await page.goto(deepLink);
  await expect(page.locator('h1')).toContainText('3-4-039:007');
  await expect(page.locator('#parcelExports')).toContainText('Snapshot 2026-11-10');
  assert.match(await readDownload(page, 'CSV'), /"234039007"/);
  assert.equal(String(JSON.parse(await readDownload(page, 'GeoJSON')).features[0].properties.t9), '234039007');
  await page.unroute(deepLink);
}

async function verifyUnavailable(page, url) {
  await page.route('**/data/approved/manifest.json', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto(url);
  await expect(page.locator('#parcelExports')).toContainText('Snapshot exports unavailable');
  await expect(page.locator('#parcelExports button')).toHaveCount(0);
  await expect(page.locator('h1')).toContainText('TMK');
}

const server = await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const [route, width] of [['property', 1440], ['property/mobile', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = `${server.url}/state-local/${route}/`;
    await verifyBeforeMap(page, url);
    await page.goto(url);
    await verifySelectedExport(page);
    await verifyUnavailable(page, url);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${route}: selected CSV/GeoJSON downloads and unavailable source manifest`);
  }
} finally {
  await browser.close();
  await server.close();
}
