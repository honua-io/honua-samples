import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';

async function filterParcels(page, url) {
  await page.route('**/state-local/property/**', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('map = HM.create(', 'map = window.__parcelMap = HM.create(') });
  });
  await page.goto(url);
  await page.getByText('Browse parcel snapshot', { exact: true }).click();
  const filter = page.getByRole('combobox', { name: 'Zoning district', exact: true });
  await expect(filter).toBeVisible();
  const parcels = await page.evaluate(() => HM.get('parcels').features);
  const zone = String(parcels[0].properties.zone), matching = parcels.filter((f) => String(f.properties.zone) === zone);
  await filter.selectOption(zone);
  await expect(page.locator('#parcelBrowser [role=status]').first()).toContainText(`${matching.length.toLocaleString()} parcels`);
  const area = matching.reduce((sum, f) => sum + f.properties.acres, 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  await expect(page.locator('#parcelBrowser [role=status]').first()).toContainText(`${area} acres`);
  await expect.poll(() => page.evaluate(() => window.__parcelMap?.getFilter('parcels-fill'))).toEqual(['==', ['to-string', ['coalesce', ['get', 'zone'], 'null']], zone]);
  return { parcels, matching, zone };
}

async function selectParcel(page, matching) {
  const first = page.locator('#parcelBrowser tbody button').first();
  const tmk = await first.textContent();
  await first.focus();
  await first.press('Enter');
  await expect(first).toBeFocused();
  await expect(page.locator('h1')).toContainText(tmk);
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download selected parcel GeoJSON', exact: true }).click();
  const download = await waiting;
  assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')).features, [matching[0]]);
  const share = await page.locator('#shareUrl').textContent();
  assert.equal(new URL(share).searchParams.get('tmk'), String(matching[0].properties.t9));
  return { share, tmk };
}

async function verifyReload(page, result) {
  const { share, tmk, zone, matching, parcels } = result;
  const filter = page.getByRole('combobox', { name: 'Zoning district', exact: true });
  assert.equal(new URL(share).searchParams.get('zone'), zone);
  await page.goto(share);
  await expect(page.locator('h1')).toContainText(tmk);
  await page.getByText('Browse parcel snapshot', { exact: true }).click();
  await expect(filter).toHaveValue(zone);
  if (matching.length > 20) {
    await page.getByRole('button', { name: 'Next parcels', exact: true }).click();
    await expect(page.locator('#parcelBrowser')).toContainText('Showing 21');
    await page.getByRole('button', { name: 'Previous parcels', exact: true }).click();
    await expect(page.locator('#parcelBrowser')).toContainText('Showing 1–');
  }
  const otherZone = String(parcels.find((f) => String(f.properties.zone) !== zone).properties.zone);
  await filter.selectOption(otherZone);
  await expect(page.locator('#parcelBrowser')).toContainText('selected parcel is outside this zoning filter');
  await filter.selectOption('');
  await expect(page.locator('#parcelBrowser [role=status]').first()).toContainText(`${parcels.length.toLocaleString()} parcels`);
  await expect.poll(() => page.evaluate(() => window.__parcelMap?.getFilter('parcels-fill') ?? null)).toBeNull();
  assert.equal(new URL(await page.locator('#shareUrl').textContent()).searchParams.has('zone'), false);
}

async function verifyUnzoned(page, url) {
  await page.goto(url);
  const result = await page.evaluate(async () => {
    const { mountParcelBrowser } = await import('/state-local/shared/parcel-browser.mjs');
    const root = document.createElement('div'); document.body.append(root);
    const filters = [];
    const parcels = [{ properties: { id: 1, t9: '000000001', zone: null, acres: 1 } }];
    mountParcelBrowser({ root, parcels, zoneNames: {}, formatTmk: (value) => value, selected: () => null,
      onSelect() {}, onChange() {}, map: () => ({ getLayer: () => true, setFilter: (layer, expression) => filters.push(expression) }) });
    const filter = root.querySelector('select'); filter.value = 'null'; filter.dispatchEvent(new Event('change'));
    const result = { expression: filters.at(-1), count: root.querySelectorAll('tbody tr').length };
    root.remove(); return result;
  });
  assert.equal(result.count, 1);
  assert.deepEqual(result.expression, ['==', ['to-string', ['coalesce', ['get', 'zone'], 'null']], 'null']);
}

async function verifyBrowser(page, url) {
  const result = await filterParcels(page, url);
  const selected = await selectParcel(page, result.matching);
  await verifyReload(page, { ...result, ...selected });
}

const server = await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const [route, width] of [['property', 1440], ['property/mobile', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await verifyUnzoned(page, `${server.url}/state-local/${route}/`);
    await verifyBrowser(page, `${server.url}/state-local/${route}/`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/tmp/s-backlog-clients-parcel-browser-${width}.png`, fullPage: true });
    await page.close();
    console.log(`PASS ${route}: zoning, summary, linked selection, paging and share reload`);
  }
} finally { await browser.close(); await server.close(); }
