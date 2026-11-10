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
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  const response = await page.goto(`${server.url}/state-local/emergency/`);
  assert.equal(response.status(), 200);
  await expect(page.locator('#shelterList')).toContainText('fictional shelter');
  await expect(page.locator('#shelterList .shel')).toHaveCount(9);
  await expect(page.getByRole('heading', { name: 'Demo answer · public notice' })).toBeVisible();
  const receipt = await (await page.request.get(`${server.url}/state-local/emergency/data/sources.json`)).json();
  assert.ok(receipt.sources[2].sourceUrl.endsWith('Hazards/MapServer/2'));
  assert.equal(receipt.sources[2].retrievalDate, '2026-11-10T08:28:22.163Z');
  assert.equal(receipt.displayLayers.length, 10);
  await expect.poll(() => page.evaluate(() => HM.maps[0]?.getLayer('tsunami') !== undefined)).toBe(true);
  const zone = page.getByRole('checkbox', { name: 'Evacuation zone', exact: true });
  await zone.uncheck();
  assert.equal(await page.evaluate(() => HM.maps[0].getLayoutProperty('tsunami', 'visibility')), 'none');
  await zone.check();
  await page.getByRole('button', { name: 'Simulate approval', exact: true }).click();
  await expect(page.locator('.ai-card').filter({ has: page.locator('#approveSitrep') })).toContainText('Demo approval');
  for (const route of ['', 'mobile.html']) {
    await page.goto(`${server.url}/state-local/emergency/${route}`);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(evidence, `${route ? 'mobile' : 'desktop'}-${width}-${theme}.png`), fullPage: true });
      }
    }
  }
  assert.deepEqual(failures, []);
  console.log('Approved emergency desktop/mobile, map overlay, simulated approval, receipts and responsive themes passed.');
} finally {
  await browser?.close();
  await server.close();
}
