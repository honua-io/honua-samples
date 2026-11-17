import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

async function sketchState(page) {
  return page.locator('#map').evaluate((element) => {
    const map = element.honuaAnalysisMap;
    return { features: map.getSource('draw')._data.features, zoom: map.getZoom(),
      doubleClickZoom: map.doubleClickZoom.isEnabled() };
  });
}

async function addVertices(page, vertices) {
  await page.locator('#map canvas').scrollIntoViewIfNeeded();
  const bounds = await page.locator('#map canvas').boundingBox();
  for (const [x, y] of vertices) await page.mouse.click(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
  const { features } = await sketchState(page);
  assert.equal(features.filter((feature) => feature.geometry.type === 'Point').length, vertices.length);
  assert.ok(features.every((feature) => feature.properties && typeof feature.properties === 'object'));
}

async function verifyMeasurement(page) {
  await page.locator('[data-mode=measure]').click();
  await addVertices(page, [[0.35, 0.4], [0.65, 0.6]]);
  const measured = await sketchState(page);
  assert.equal(measured.doubleClickZoom, false);
  await page.locator('#hintDone').click();
  await expect(page.locator('[data-mode=select]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#hint')).toBeVisible();
  await expect(page.locator('#hintText')).toContainText('(kept)');
  const finished = await sketchState(page);
  assert.deepEqual(finished.features, measured.features);
  assert.equal(finished.doubleClickZoom, true);
  await page.locator('#map canvas').scrollIntoViewIfNeeded();
  const bounds = await page.locator('#map canvas').boundingBox();
  await page.locator("#map canvas").dblclick({ position: { x: bounds.width / 2, y: bounds.height / 5 } });
  await expect.poll(async () => (await sketchState(page)).zoom).toBeGreaterThan(finished.zoom + 0.5);
  await page.locator('#hintCancel').click();
  assert.deepEqual((await sketchState(page)).features, []);
}

async function verifyPolygon(page) {
  await page.locator('[data-mode=draw]').click();
  await addVertices(page, [[0.3, 0.35], [0.7, 0.35], [0.7, 0.65]]);
  assert.equal((await sketchState(page)).features.filter((feature) => feature.geometry.type === 'Polygon').length, 1);
  await page.keyboard.press('Escape');
  await page.locator('[data-mode=measure]').click();
  await addVertices(page, [[0.35, 0.4], [0.65, 0.6]]);
  await page.locator('#spView').click();
  await expect(page.locator('[data-mode=select]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#hint')).toBeHidden();
  assert.equal((await sketchState(page)).doubleClickZoom, true);
  const { features } = await sketchState(page);
  assert.equal(features.length, 1);
  assert.equal(features[0].geometry.type, 'Polygon');
  assert.deepEqual(features[0].properties, {});
  await page.locator('[aria-label="Remove area"]').click();
}

export async function verifyWorkbenchSketch(page) {
  await page.waitForFunction(() => document.querySelector('#map').honuaAnalysisMap?.loaded());
  const diagnostics = [];
  const onConsole = (message) => { if (message.type() === 'error') diagnostics.push(message.text()); };
  page.on('console', onConsole);
  try {
    await verifyMeasurement(page);
    await verifyPolygon(page);
    await expect.poll(() => page.locator('#map').evaluate((element) => element.honuaAnalysisMap.loaded())).toBe(true);
    assert.deepEqual(diagnostics, [], 'Sketch updates must not emit MapLibre errors');
  } finally {
    page.off('console', onConsole);
  }
}
