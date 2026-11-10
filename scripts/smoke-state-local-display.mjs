import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from '@playwright/test';
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
  await page.locator('body[data-sample-status="pass"]').waitFor({ timeout: 90_000 });
  assert.match(await page.locator('.display-snapshot').textContent(), /Real data: Hawaii Statewide GIS; demo records are labelled; snapshot \d{4}-\d{2}-\d{2}/);
  await page.locator('.maplibregl-canvas').waitFor();
}

try {
  await open('311');
  assert.match(await page.locator('#result-count').textContent(), /468 matching/);
  await page.selectOption('[name=status]', 'exercise_open');
  assert.doesNotMatch(await page.locator('#result-count').textContent(), /468 matching/);
  await page.locator('#rows button').first().click();
  assert.match(await page.locator('#detail').textContent(), /DEMO DATA/);
  const download = page.waitForEvent('download');
  await page.click('#csv');
  assert.match((await download).suggestedFilename(), /maui-311\.csv/);
  assert.deepEqual(errors, []);
  console.log('PASS 311: mapped snapshot, status filter, details and CSV');

  await open('public-works');
  assert.match(await page.locator('#bridge-provenance').textContent(), /REAL DATA/);
  await page.selectOption('[name=dataset]', 'orders');
  assert.match(await page.locator('#result-count').textContent(), /34 matching/);
  await page.locator('#rows button').first().click();
  assert.match(await page.locator('#detail').textContent(), /DEMO DATA/);
  await page.selectOption('[name=dataset]', 'inspections');
  assert.match(await page.locator('#result-count').textContent(), /24 matching/);
  assert.deepEqual(errors, []);
  console.log('PASS Public Works: real bridges, work orders, inspections and details');

  await open('property');
  await page.waitForFunction(() => [...document.querySelectorAll('.planning-result')].length === 6
    && [...document.querySelectorAll('.planning-result')].every((node) => ['success', 'empty'].includes(node.dataset.state)), undefined, { timeout: 90_000 });
  assert.equal(await page.locator('body').getAttribute('data-tmk'), '234008053');
  await page.fill('#q', '234008053');
  await page.click('#find');
  await page.locator('body[data-search-state="found"]').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS Property: TMK lookup, parcel map and six planning overlays');
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
