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
  assert.equal((await geojson.json()).features.length, 469);
  const exported = (await (await context.request.get(`${server.url}/state-local/data/approved/requests.geojson`)).json()).features;
  const embedded = await page.evaluate(() => HD.demo.requests);
  assert.deepEqual(exported.map(({ properties, geometry }) => ({ ...properties, c: geometry.coordinates })), embedded);
  assert.ok(embedded.some(({ id }) => id === 'SR-26-18708'));
  assert.match(await csv.text(), /SR-26-18708/);
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

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${server.url}/state-local/property/?tmk=234039007`);
  await expect(page.locator('#pTitle')).toContainText('3-4-039:007');
  for (const tab of ['t0', 't1', 't2', 't3', 't4']) {
    await page.locator(`#${tab}`).click();
    await expect(page.locator(`#${tab}`)).toHaveAttribute('aria-selected', 'true');
  }
  await page.locator('#t3').click();
  await expect(page.locator('#hazFlood')).toHaveText('Mapped flood zone X');
  await expect(page.locator('#hazTsunami')).toContainText('Outside');
  await expect(page.locator('#hazValue')).toHaveText('$138,300');
  await page.click('#shareBtn');
  await page.click('#copyShare');
  await expect(page.locator('#copyShare')).toHaveText('Copied');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${server.url}/state-local/property/mobile/?tmk=234039007`);
  await expect(page.locator('#tmk')).toContainText('3-4-039:007');
  await page.locator('details.plain summary').click();
  await expect(page.locator('#ai')).toBeHidden();
  await expect(page.locator('#aiUnavailable')).toBeVisible();
  await expect(page.locator('#floodQuestion')).toContainText('zone X');
  await expect(page.locator('#floodGuidance')).toContainText('outside');
  await page.click('#shareBtn');
  await page.click('#copyShare');
  await expect(page.locator('#copyShare')).toHaveText('Copied');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.click('#copyShare');
  await expect(page.locator('#copyShare')).toHaveText('Select link above to copy');
  assert.deepEqual(errors, []);
  console.log('PASS Property regressions: clickable tabs, selected-parcel hazards and clipboard success/failure');

} finally {
  await context.close();
  await browser.close();
  await server.close();
}

await import('./smoke-state-local-workbench.mjs');
