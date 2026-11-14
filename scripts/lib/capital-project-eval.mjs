import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

async function assertVisibleProjects(page, expected) {
  const ids = await page.locator('#capitalRows tr').evaluateAll((rows) => rows.map((row) => row.dataset.projectId));
  assert.deepEqual(ids, expected);
  const budgets = await page.locator('#capitalRows td:nth-child(5)').allTextContents();
  const total = budgets.reduce((sum, value) => sum + Number(value.replace(/[^\d]/g, '')), 0);
  await expect(page.locator('#capitalTotal')).toHaveText(`$${total.toLocaleString('en-US')}`);
  const answer = await page.locator('#capitalAnswer').textContent();
  assert.deepEqual(answer.match(/CBS-\d+/g) || [], ids);
  await expect(page.locator('#capitalAnswer')).toContainText(ids.length ? 'Cannot determine' : 'no projects match');
  await expect.poll(() => page.evaluate(() => {
    const source = window.publicWorksMap?.getStyle().sources['capital-projects'];
    return [...new Set(source?.data?.features.map((feature) => feature.properties.projectId) || [])];
  })).toEqual(expected);
}

export async function evaluateCapitalProjects(page) {
  await page.locator('#capitalButton').click();
  await expect(page.locator('#capitalView')).toBeVisible();
  await expect(page.locator('#inspectionView')).toBeHidden();
  await assertVisibleProjects(page, ['CBS-6069', 'CBS-7232', 'CBS-1069']);
  await page.locator('#capitalPhase').selectOption('Design');
  await assertVisibleProjects(page, ['CBS-6069', 'CBS-7232']);
  await page.locator('#capitalDistrict').selectOption('Wailuku-Kahului');
  await assertVisibleProjects(page, []);
  await page.locator('#capitalPhase').selectOption('New construction');
  await assertVisibleProjects(page, ['CBS-1069']);
  const downloaded = page.waitForEvent('download');
  await page.locator('#capitalExport').click();
  const download = await downloaded;
  const csv = await readFile(await download.path(), 'utf8');
  assert.equal(csv.split('\r\n').length, 2);
  assert.match(csv, /CBS-1069/);
  assert.doesNotMatch(csv, /CBS-6069/);
  assert.match(csv, /county_published/);
  assert.match(csv, /87000000/);
  await page.locator('#inspectionButton').click();
  await expect(page.locator('#inspectionView')).toBeVisible();
  await expect(page.locator('#plan .chip.ok')).toContainText('draft work orders');
  await expect.poll(() => page.evaluate(() => window.publicWorksMap.getLayoutProperty('capital-road', 'visibility'))).toBe('none');
  return { filters: 'phase, district and empty intersection', csv: 'filtered real records', answer: 'no unsupported overrun/delay claim' };
}
