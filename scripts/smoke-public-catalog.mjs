// Exercise the signed-out catalog against the exact Pages artifact.
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';

async function checkSearchLayout(page) {
  for (const fontSize of ['16px', '32px']) {
    await page.locator('html').evaluate((element, size) => { element.style.fontSize = size; }, fontSize);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
      `${page.viewportSize().width}px / ${fontSize}: search page overflows`);
    const button = await page.getByRole('button', { name: 'Search', exact: true }).boundingBox();
    assert.ok(button && button.x >= 0 && button.x + button.width <= page.viewportSize().width,
      'Search button must fit without horizontal scrolling');
  }
  await page.locator('html').evaluate((element) => { element.style.fontSize = ''; });
}

async function checkSkipLink(page, target) {
  const hash = await page.evaluate(() => location.hash);
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(target)).toBeFocused();
  assert.equal(await page.evaluate(() => location.hash), hash);
}

async function checkSearch(page) {
  await expect(page.locator('#resN')).toHaveText('16');
  await page.locator('#q').fill('show me flood data');
  await expect(page.locator('#resN')).toHaveText('2');
  await expect(page.locator('#results')).toContainText('FEMA flood hazard zones');
  await expect(page.locator('#results')).toContainText('Sea-level rise exposure');
  await page.locator('#q').fill('parcels with flood zones');
  await expect(page.locator('#resN')).toHaveText('3');
  await expect(page.locator('#results')).toContainText('Parcels (TMK)');
  await page.locator('#q').fill('zzzzxyznomatch');
  await expect(page.locator('#resN')).toHaveText('0');
  await page.locator('#q').fill('');
  const topic = page.locator('#topics button[data-t="Environment"]');
  await topic.click();
  assert.ok(Number(await page.locator('#resN').textContent()) < 16);
  await topic.click();
  if (page.viewportSize().width < 760) return;
  await page.locator('input[data-k="kind"][value="Demo data"]').check();
  await expect(page.locator('#resN')).toHaveText('2');
  await expect(page.locator('#results .tag-demo')).toHaveCount(2);
  await page.locator('input[data-k="kind"][value="Demo data"]').uncheck();
}

async function checkDataset(page, baseUrl) {
  await page.goto(`${baseUrl}/state-local/catalog/#ds=dfirm`);
  await expect(page.locator('#dsView')).toBeVisible();
  await expect(page.locator('#dsView')).toContainText('Public domain');
  await expect(page.locator('#dsView')).toContainText('Nov 15, 2026');
  await checkSkipLink(page, '#dsView');
  await page.locator('#fullTable').click();
  await expect(page.locator('#tableRange')).toHaveText('1–50 of 97 rows');
  await expect(page.locator('#dsView tbody tr')).toHaveCount(50);
  await page.locator('#fullTable').click();
  await expect(page.locator('#tableRange')).toHaveText('51–97 of 97 rows');
  await page.evaluate(() => { location.hash += '&map=12/20.9/-156.4'; });
  await expect(page.locator('#tableRange')).toHaveText('51–97 of 97 rows');
  await page.locator('#jumpDownloads').click();
  await expect(page.locator('#downloads')).toBeVisible();
  await expect(page).toHaveURL(/#ds=dfirm(?:&|$)/);
  await page.locator('[data-copy]').first().click();
  await expect(page.locator('[data-copy]').first()).toHaveAttribute('aria-label', 'URL copied');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${baseUrl}/state-local/data/catalog/dfirm.geojson`);
}

async function checkDownloads(context, baseUrl) {
  const response = await context.request.get(`${baseUrl}/state-local/data/catalog/catalog.json`);
  assert.equal(response.status(), 200);
  const catalog = await response.json();
  assert.equal(catalog.datasets.length, 16);
  assert.equal(catalog.datasets.filter((dataset) => dataset.real).length, 14);
  for (const [id, count] of [['parcels', 2538], ['dfirm', 97], ['slr32', 1]]) {
    assert.equal(catalog.datasets.find((dataset) => dataset.id === id).count, count);
  }
  for (const dataset of catalog.datasets) {
    assert.ok(dataset.license && dataset.by && dataset.updated);
    for (const link of dataset.downloads) {
      const file = await context.request.get(`${baseUrl}${link.url}`);
      assert.equal(file.status(), 200, link.url);
      assert.equal((await file.body()).length, link.bytes, link.url);
    }
  }
}

const server = process.env.CATALOG_BASE_URL ? null : await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const baseUrl = process.env.CATALOG_BASE_URL?.replace(/\/+$/, '') ?? server.url;
const browser = await chromium.launch();
try {
  for (const width of [1440, 390, 320]) {
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme, permissions: ['clipboard-read', 'clipboard-write'] });
      await context.addInitScript((theme) => localStorage.setItem('honua-theme', theme), colorScheme);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${baseUrl}/state-local/`);
      await page.getByRole('link', { name: 'Snapshot catalogue' }).click();
      await expect(page).toHaveURL(`${baseUrl}/state-local/catalog/`);
      assert.equal(await page.locator('html').getAttribute('data-theme'), colorScheme);
      await checkSearchLayout(page);
      await checkSkipLink(page, '#main');
      await checkSearch(page);
      await checkDataset(page, baseUrl);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}: horizontal overflow`);
      assert.deepEqual(errors, []);
      if (width === 1440 && colorScheme === 'light') await checkDownloads(context, baseUrl);
      console.log(`catalog ${width}px ${colorScheme}: search, preview, paging, copy and signed-out downloads pass`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server?.close();
}
