import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';

async function loadPage(page, url) {
  await page.route('**/state-local/property/**', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('map = HM.create(', 'map = window.__parcelMap = HM.create(') });
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__parcelMap?.loaded());
  await page.evaluate(() => { const map = window.__parcelMap; window.__snapshotCamera = { center: map.getCenter().toArray(), zoom: map.getZoom() }; });
  await page.locator('#countyHeading').click();
  await expect(page.locator('#countyStatus')).toContainText('County publication connected', { timeout: 30000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__parcelMap?.getLayer('county-fill'))), { timeout: 30000 }).toBe(true);
}

async function verifyEarlyOpen(browser, url) {
  const page = await browser.newPage();
  await page.route('**/state-local/property/**', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const body = (await response.text())
      .replace('map = HM.create(', 'map = window.__parcelMap = HM.create(')
      .replace('map.on("load", () => {\n      basemap(map, opts); restyle(map);\n      if (opts.onload) opts.onload(map);\n    });',
        'window.__finishSnapshot = () => { basemap(map, opts); restyle(map); if (opts.onload) opts.onload(map); };');
    await route.fulfill({ response, body });
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__parcelMap?.getStyle()?.layers && window.__finishSnapshot);
  await page.locator('#countyHeading').click();
  await expect(page.locator('#countyStatus')).toContainText('County publication connected', { timeout: 30000 });
  assert.equal(await page.evaluate(() => Boolean(window.__parcelMap.getLayer('county-fill'))), false, 'county waits for snapshot initialization');
  await page.getByLabel('County TMK', { exact: true }).fill('238007001');
  await page.getByRole('button', { name: 'Find county parcel', exact: true }).click();
  await expect(page.locator('#countyStatus')).toContainText('County TMK 238007001 · GeoParquet details', { timeout: 30000 });
  await page.evaluate(() => { window.__finishSnapshot(); window.__parcelMap.fire('load'); });
  await expect.poll(() => page.evaluate(() => window.__parcelMap.getSource('county-selection')?._data?.properties?.tmk_txt)).toBe('238007001');
  await expect.poll(() => page.evaluate(() => Boolean(window.__parcelMap.getLayer('county-fill')))).toBe(true);
  assert.equal(await page.evaluate(() => window.__parcelMap.getLayoutProperty('parcels-fill', 'visibility')), 'none');
  const layers = await page.evaluate(() => window.__parcelMap.getStyle().layers.map((layer) => layer.id));
  assert.ok(layers.indexOf('county-fill') > layers.indexOf('parcels-sel'));
  await page.close();
  console.log('PASS early county open waits for application map initialization');
}

async function verifyLookup(page) {
  await page.getByLabel('County TMK', { exact: true }).fill('238-007-001');
  await page.getByRole('button', { name: 'Find county parcel', exact: true }).click();
  await expect(page.locator('#countyStatus')).toContainText('County TMK 238007001 · GeoParquet details', { timeout: 30000 });
  const values = await page.locator('#countyDetails dd').allTextContents();
  assert.deepEqual(values.slice(0, 5), ['238007001', '3', '8', '007', '001']);
  assert.equal(values.length, 9);
  assert.ok(!await page.locator('#countyDetails').textContent().then((text) => /owner|building|zoning/i.test(text)));
  await expect.poll(() => page.evaluate(() => window.__parcelMap?.getSource('county-selection')?._data?.properties?.tmk_txt)).toBe('238007001');
  await expect.poll(() => page.evaluate(() => window.__parcelMap.getLayoutProperty('parcels-fill', 'visibility'))).toBe('none');
  await expect.poll(() => page.evaluate(() => window.__parcelMap.queryRenderedFeatures({ layers: ['county-fill'] }).length), { timeout: 30000 }).toBeGreaterThan(0);
  const tmk = await page.evaluate(() => {
    const map = window.__parcelMap, canvas = map.getCanvas();
    for (let x = 20; x < canvas.clientWidth; x += 20) {
      for (let y = 20; y < canvas.clientHeight; y += 20) {
        const point = { x, y }, feature = map.queryRenderedFeatures(point, { layers: ['county-fill'] })[0];
        if (!feature) continue;
        map.fire('click', { point, lngLat: map.unproject(point), originalEvent: new MouseEvent('click') });
        return feature.properties.tmk_txt;
      }
    }
  });
  assert.equal(typeof tmk, 'string');
  await expect(page.locator('#countyStatus')).toContainText(`County TMK ${tmk} · GeoParquet details`, { timeout: 30000 });
  await expect.poll(() => page.evaluate(() => window.__parcelMap.getSource('county-selection')._data?.properties?.tmk_txt)).toBe(tmk);
}

async function verifyCloseAndFailure(page) {
  await page.locator('#countyHeading').click();
  await expect.poll(() => page.evaluate(() => window.__parcelMap.getLayoutProperty('parcels-fill', 'visibility'))).toBe('visible');
  await expect.poll(() => page.evaluate(() => window.__parcelMap.getLayoutProperty('county-fill', 'visibility'))).toBe('none');
  await expect.poll(() => page.evaluate(() => { const map = window.__parcelMap, original = window.__snapshotCamera; return Math.abs(map.getZoom() - original.zoom) < 0.00001 && map.getCenter().toArray().every((value, index) => Math.abs(value - original.center[index]) < 0.00001); })).toBe(true);
  await page.route('**/parcels.parquet', (route) => route.abort());
  await page.locator('#countyHeading').click();
  await page.getByLabel('County TMK', { exact: true }).fill('238007002');
  await page.getByRole('button', { name: 'Find county parcel', exact: true }).click();
  await expect(page.locator('#countyStatus')).toContainText('County lookup unavailable', { timeout: 30000 });
  await expect(page.locator('#countyDetails dd')).toHaveCount(0);
  await page.getByLabel('County TMK', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Find county parcel', exact: true }).click();
  await expect(page.locator('#countyStatus')).toContainText('nine-digit TMK');
}

async function verifyUnavailablePublication(browser, url) {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/descriptor.json', (route) => route.abort());
  await page.goto(url);
  await page.locator('#countyHeading').click();
  await expect(page.locator('#countyStatus')).toContainText('County publication unavailable', { timeout: 30000 });
  await page.locator('#countyHeading').click();
  await page.unroute('**/descriptor.json');
  await page.route('**/*.pmtiles', (route) => route.abort());
  await page.locator('#countyHeading').click();
  await expect(page.locator('#countyStatus')).toContainText('County publication connected', { timeout: 30000 });
  await expect(page.locator('#countyMapStatus')).toContainText('County map unavailable', { timeout: 30000 });
  await page.getByLabel('County TMK', { exact: true }).fill('238007001');
  await page.getByRole('button', { name: 'Find county parcel', exact: true }).click();
  await expect(page.locator('#countyStatus')).toContainText('County TMK 238007001 · GeoParquet details', { timeout: 30000 });
  assert.deepEqual(errors, []);
  await page.close();
  console.log('PASS unavailable descriptor retry and unavailable county map with working GeoParquet lookup');
}

const server = await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const [route, width] of [['property', 1440], ['property/mobile', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await loadPage(page, `${server.url}/state-local/${route}/`);
    await verifyLookup(page);
    await page.locator('#countyPublication').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/s-backlog-clients-county-${width}.png`, fullPage: true });
    await verifyCloseAndFailure(page);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${route}: hosted native lookup, public fields, map overlay, close/restore and unavailable data`);
  }
  await verifyEarlyOpen(browser, `${server.url}/state-local/property/`);
  await verifyUnavailablePublication(browser, `${server.url}/state-local/property/`);
} finally { await browser.close(); await server.close(); }
