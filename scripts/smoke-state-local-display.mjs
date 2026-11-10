import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';

const server = await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function open(route) {
  errors.length = 0;
  const response = await page.goto(`${server.url}/state-local/${route}/`);
  assert.equal(response.status(), 200);
  await expect(page.locator('.display-snapshot')).toContainText(/Real data: Hawaii Statewide GIS; demo records are labelled; snapshot \d{4}-\d{2}-\d{2}/);
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 60_000 });
}

try {
  await open('311');
  await expect(page.locator('#qBody tr')).toHaveCount(12);
  const before = await page.locator('#qSub').textContent();
  await page.selectOption('#fType', { index: 1 });
  assert.notEqual(await page.locator('#qSub').textContent(), before);
  await page.locator('#qBody tr').first().click();
  await expect(page.locator('#drawer')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#dChips')).toContainText(/Demo data/i);
  const csv = await context.request.get(`${server.url}/state-local/data/approved/requests.csv`);
  assert.equal(csv.status(), 200);
  assert.match(await csv.text(), /synthetic_demo/);
  const geojson = await context.request.get(`${server.url}/state-local/data/approved/requests.geojson`);
  assert.equal((await geojson.json()).features.length, 468);
  assert.deepEqual(errors, []);
  console.log('PASS 311: filters, labelled detail, downloadable GeoJSON and CSV');

  await open('public-works');
  await expect(page.locator('#planTbl tbody tr')).toHaveCount(12);
  await page.locator('[data-view="list"]').click();
  await expect(page.locator('#list')).toBeVisible();
  await expect(page.locator('#board')).toBeHidden();
  assert.ok(await page.locator('#listBody tr').count() > 0);
  await page.click('#approvePlan');
  await expect(page.locator('#approvePlan')).toBeDisabled();
  await expect(page.locator('#approvePlan')).toContainText('Demo approval');
  assert.deepEqual(errors, []);
  console.log('PASS Public Works: ranked plan, work-order board/list and scripted approval');

  await open('property');
  await expect(page.locator('#pTitle')).toContainText('TMK');
  await page.fill('#q', '237004006');
  await page.locator('#sug button[data-id]').first().click();
  await expect(page.locator('#pTitle')).toContainText('3-7-004:006');
  assert.match(await page.locator('.mappsLink').first().getAttribute('href'), /publicweb1.co.maui.hi.us/);
  await page.click('#shareBtn');
  await expect(page.locator('#shareUrl')).toContainText('tmk=237004006');
  assert.deepEqual(errors, []);
  console.log('PASS Property: TMK search, planning overlays, official permit search and share URL');

  await page.setViewportSize({ width: 390, height: 844 });
  await open('property/mobile');
  await expect(page.locator('#tmk')).toContainText('3-7-004:006');
  await page.click('#shareBtn');
  await expect(page.locator('#sheet')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#shareUrl')).toContainText('tmk=237004006');
  assert.deepEqual(errors, []);
  console.log('PASS Property mobile: parcel card, map and share sheet');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
