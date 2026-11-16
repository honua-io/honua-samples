import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

async function sharedState(page) {
  await page.locator('#shareBtn').click();
  const link = new URL(await page.locator('#shareLink').textContent());
  await page.locator('#share').getByRole('button', { name: 'Close', exact: true }).last().click();
  return JSON.parse(new URLSearchParams(link.hash.slice(1)).get('s'));
}

async function verifyMapSize(page) {
  await expect.poll(() => page.locator('#map').evaluate((map) => {
    const canvas = map.querySelector('canvas');
    const bounds = map.getBoundingClientRect();
    const painted = canvas?.getBoundingClientRect();
    return bounds.height >= 200 && bounds.width > 0 && painted
      && Math.abs(painted.height - bounds.height) <= 1
      && Math.abs(painted.width - bounds.width) <= 1;
  }), { message: 'Map remains usable and its canvas follows the resized container' }).toBe(true);
  await page.locator('#map').scrollIntoViewIfNeeded();
  await expect(page.locator('#map')).toBeInViewport();
}

export async function verifyWorkbenchLayout(page) {
  const originalViewport = page.viewportSize();
  const { view, ...state } = await sharedState(page);
  for (const viewport of [
    { width: 390, height: 900 }, { width: 900, height: 390 },
    { width: 1000, height: 500 }, { width: 1001, height: 390 },
    { width: 900, height: 600 }, { width: 1440, height: 1000 },
    { width: 390, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await verifyMapSize(page);
    const { view: resizedView, ...resizedState } = await sharedState(page);
    assert.deepEqual(resizedState, state, 'Resize preserves filters, selection and share state');
    for (const field of ['zoom', 'pitch', 'bearing']) assert.ok(Math.abs(resizedView[field] - view[field]) < 1e-6);
    view.center.forEach((coordinate, index) => assert.ok(Math.abs(resizedView.center[index] - coordinate) < 1e-6));
  }
  await page.setViewportSize(originalViewport);
}
