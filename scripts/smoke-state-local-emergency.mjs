import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';

const server = await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const evidence = path.resolve('artifacts/emergency-published');
await mkdir(evidence, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const response = await page.goto(`${server.url}/state-local/emergency/`);
  assert.equal(response.status(), 200);
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
  await expect(page.locator('#freshness')).toContainText('Not a live server check');
  await expect(page.locator('#map-status')).toContainText('records mapped');
  const receipt = await (await page.request.get(`${server.url}/state-local/emergency/data/sources.json`)).json();
  assert.ok(receipt.sources[2].sourceUrl.endsWith('Hazards/MapServer/2'));
  assert.equal(receipt.sources[2].retrievalDate, '2026-11-10T08:28:22.163Z');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(evidence, `${width}-${theme}.png`), fullPage: true });
    }
  }
  console.log('Published emergency route, snapshot receipt and responsive themes passed.');
} finally {
  await browser?.close();
  await server.close();
}
