import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

async function downloadText(page, selector) {
  const waiting = page.waitForEvent('download');
  await page.locator(selector).click();
  return readFile(await (await waiting).path(), 'utf8');
}

async function checkExports(page, expectedIds, layer) {
  const csv = await downloadText(page, '#expCsv');
  const lines = csv.split('\n');
  const collection = JSON.parse(await downloadText(page, '#expGj'));
  assert.equal(collection.type, 'FeatureCollection');
  assert.equal(lines.length - 1, expectedIds.length, 'CSV exports the complete table result');
  assert.ok(lines[0].length, 'Empty CSV retains column headers');
  assert.deepEqual(collection.features.map((f) => String(f.properties.id)), expectedIds);
  for (const feature of collection.features) {
    assert.ok(feature.geometry.coordinates.length);
    assert.ok(layer === 'parcels' ? /Polygon/.test(feature.geometry.type) : feature.geometry.type === 'Point');
  }
  if (layer === 'requests' && expectedIds.length) {
    assert.ok(collection.features.every((f) => f.properties.data_origin === 'synthetic_demo' && f.properties.disclaimer.includes('DEMO DATA')));
    assert.ok(lines.slice(1).every((line) => line.includes('synthetic_demo') && line.includes('DEMO DATA')));
  }
  return { lines, features: collection.features };
}

async function checkKeyboardSort(page, layer) {
  const heading = page.locator(`#dt th[data-sort="${layer === 'parcels' ? 'tmk' : 'id'}"]`);
  await heading.focus();
  for (const [key, direction] of [['Enter', 'ascending'], ['Space', 'descending'], ['Enter', 'ascending']]) {
    await page.keyboard.press(key);
    await expect(heading).toHaveAttribute('aria-sort', direction);
    await expect(heading).toBeFocused();
  }
}

async function checkKeyboardSelection(page, ids, layer) {
  const rows = page.locator('#dt tbody tr[data-id]');
  await page.locator('#dt th').last().focus();
  await page.keyboard.press('Tab');
  await expect(rows.nth(0)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(rows.nth(0)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('Shift+Space');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(rows.nth(1)).toBeFocused();
  await page.locator('#selOnly').click();
  await checkExports(page, ids.slice(0, 2), layer);
  await rows.nth(0).focus();
  await page.keyboard.press('Space');
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toBeFocused();
}

async function checkLayer(page, url, layer) {
  await page.goto(`${url}/state-local/workbench/`);
  await page.locator(`[data-l="${layer}"]`).click();
  await expect(page.locator('#dt tbody tr[data-id]').first()).toBeVisible();
  await checkKeyboardSort(page, layer);
  const full = JSON.parse(await downloadText(page, '#expGj')).features;
  const ids = full.map((f) => String(f.properties.id));
  assert.ok(ids.length > 250, 'Exports include rows beyond the rendered table cap');
  const renderedIds = await page.locator('#dt tbody tr[data-id]').evaluateAll((rows) => rows.map((r) => r.dataset.id));
  assert.deepEqual(ids.slice(0, 250), renderedIds, 'Export order matches the sorted table');
  const all = await checkExports(page, ids, layer);
  const firstId = ids[0];
  await page.locator('#tq').fill(layer === 'requests' ? firstId : String(full[0].properties.tmk));
  const matching = await page.locator('#dt tbody tr[data-id]').evaluateAll((rows) => rows.map((r) => r.dataset.id));
  assert.deepEqual(matching, [firstId], 'Search isolates one record');
  const searched = await checkExports(page, matching, layer);
  assert.ok(all.lines.includes(searched.lines[1]), 'CSV search retains the original record values');
  assert.deepEqual(searched.features, [full[0]], 'Search preserves source geometry and properties');
  await page.locator('#tq').fill('');
  await checkKeyboardSelection(page, ids, layer);
  const selected = await checkExports(page, [firstId], layer);
  assert.deepEqual(selected, searched, 'Selected-only and searched exports contain the same record');
  await page.locator('#tq').fill('NO_MATCH_EXPORT_REGRESSION_72819');
  await expect(page.locator('#dt tbody tr[data-id]')).toHaveCount(0);
  await checkExports(page, [], layer);
  await page.locator('#selOnly').click();
  await checkExports(page, [], layer);
}

export async function verifyWorkbenchExports(page, url) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const layer of ['requests', 'parcels']) await checkLayer(page, url, layer);
  }
  console.log('PASS workbench keyboard sorting/selection and CSV/GeoJSON: table search, selected-only, empty intersections, sorted full results and source geometry at 1440/390');
}
