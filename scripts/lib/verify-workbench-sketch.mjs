import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

async function addSketchPoints(page) {
  const canvas = page.locator('#map canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  for (const [x, y] of [[0.35, 0.4], [0.65, 0.6]]) {
    await page.mouse.click(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
  }
  await expect.poll(() => page.evaluate(() => document.querySelector('#map').honuaAnalysisMap
    .getSource('draw')._data.features.filter(feature => feature.geometry.type === 'Point').length)).toBe(2);
}

async function verifyRetainedMeasurement(page) {
  await page.locator('[data-mode="measure"]').click();
  await addSketchPoints(page);
  const before = await page.evaluate(() => document.querySelector('#map').honuaAnalysisMap.getSource('draw')._data);
  await page.locator('#hintDone').click();
  await expect(page.locator('[data-mode="select"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#hintText')).toContainText('(kept)');
  const after = await page.evaluate(() => {
    const map = document.querySelector('#map').honuaAnalysisMap;
    return { drawing: map.getSource('draw')._data, zoomEnabled: map.doubleClickZoom.isEnabled(), zoom: map.getZoom() };
  });
  assert.deepEqual(after.drawing, before, 'Done retains the measurement geometry');
  assert.equal(after.zoomEnabled, true, 'Select restores double-click zoom');
  await page.locator('#map canvas').scrollIntoViewIfNeeded();
  const bounds = await page.locator('#map canvas').boundingBox();
  await page.mouse.dblclick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 4);
  await expect.poll(() => page.evaluate(() => document.querySelector('#map').honuaAnalysisMap.getZoom()))
    .toBeGreaterThan(after.zoom + 0.5);
}

export async function verifyWorkbenchSketch(browser, url) {
  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      try {
        await context.addInitScript(value => localStorage.setItem('honua-theme', value), theme);
        const page = await context.newPage();
        await page.goto(url);
        await page.waitForFunction(() => document.querySelector('#map').honuaAnalysisMap?.loaded());
        await verifyRetainedMeasurement(page);
      } finally { await context.close(); }
    }
  }
}
