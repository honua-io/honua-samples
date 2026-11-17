import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

const minimumUsableMapHeight = 200;
const cameraTolerance = 1e-6;

async function sharedState(page) {
  await page.locator('#shareBtn').click();
  const link = new URL(await page.locator('#shareLink').textContent());
  await page.locator('#share').getByRole('button', { name: 'Close', exact: true }).last().click();
  return JSON.parse(new URLSearchParams(link.hash.slice(1)).get('s'));
}

async function verifyMapSize(page) {
  await expect.poll(() => page.locator('#map').evaluate((map, minimumHeight) => {
    const canvas = map.querySelector('canvas');
    const bounds = map.getBoundingClientRect();
    const painted = canvas?.getBoundingClientRect();
    return bounds.height >= minimumHeight && bounds.width > 0 && painted
      && Math.abs(painted.height - bounds.height) <= 1
      && Math.abs(painted.width - bounds.width) <= 1;
  }, minimumUsableMapHeight), { message: 'Map remains usable and its canvas follows the resized container' }).toBe(true);
  await page.locator('#map').scrollIntoViewIfNeeded();
  await expect(page.locator('#map')).toBeInViewport();
}

async function verifyMapControls(page) {
  const zoom = () => page.locator('#map').evaluate((element) => element.honuaAnalysisMap.getZoom());
  const originalZoom = await zoom();
  for (const [label, target] of [['Zoom in', originalZoom + 1], ['Zoom out', originalZoom]]) {
    await page.getByRole('button', { name: label, exact: true }).click({ timeout: 3000 });
    await expect.poll(async () => Math.abs(await zoom() - target)).toBeLessThan(cameraTolerance);
    await expect.poll(() => page.locator('#map').evaluate((element) => element.honuaAnalysisMap.isMoving())).toBe(false);
  }
  for (const button of await page.locator('.tools button').all()) await button.click({ trial: true });
  const basemap = await page.locator('#basemap').inputValue();
  await page.locator('#basemap').selectOption('plain');
  await expect(page.locator('#basemap')).toHaveValue('plain');
  await page.locator('#basemap').selectOption(basemap);
}

async function verifyViewport(page, viewport, original) {
  await page.setViewportSize(viewport);
  await verifyMapSize(page);
  const { view, ...state } = await sharedState(page);
  assert.deepEqual(state, original.state, 'Resize preserves filters, selection and share state');
  for (const field of ['zoom', 'pitch', 'bearing']) assert.ok(Math.abs(view[field] - original.view[field]) < cameraTolerance);
  view.center.forEach((coordinate, index) => assert.ok(Math.abs(original.view.center[index] - coordinate) < cameraTolerance));
  await verifyMapControls(page);
}

export async function verifyWorkbenchLayout(page) {
  const originalViewport = page.viewportSize();
  const originalTheme = await page.locator('html').getAttribute('data-theme');
  const { view, ...state } = await sharedState(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => window.HM.setTheme(value), theme);
    for (const viewport of [
      { width: 390, height: 900 }, { width: 900, height: 390 },
      { width: 1000, height: 500 }, { width: 1001, height: 390 },
      { width: 900, height: 600 }, { width: 1440, height: 1000 },
      { width: 390, height: 900 },
    ]) await verifyViewport(page, viewport, { view, state });
  }
  await page.evaluate((value) => window.HM.setTheme(value), originalTheme);
  await page.setViewportSize(originalViewport);
}
