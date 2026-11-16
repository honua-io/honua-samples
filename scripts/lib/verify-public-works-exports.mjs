import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

async function exportedCsv(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  return { filename: download.suggestedFilename(), csv: await readFile(await download.path(), 'utf8') };
}

export async function verifyPublicWorksExports(page) {
  const { filename, csv } = await exportedCsv(page, '#publicWorksExport');
  assert.equal(filename, 'maui-demo-assets.csv');
  const ids = await page.evaluate(() => HD.demo.assets.map((asset) => asset.id));
  assert.equal(csv.split('\r\n').length, ids.length + 1);
  for (const id of ids) assert.ok(csv.includes(`"${id}"`));
  assert.equal((csv.match(/"synthetic_demo","true","true","DEMO DATA"/g) || []).length, ids.length);
  assert.match(csv, /not for operational use/);

  const shortlist = await exportedCsv(page, '#culvertExport');
  assert.equal(shortlist.filename, 'maui-demo-culvert-shortlist.csv');
  const rankedIds = await page.locator('#capTbl tbody tr td:nth-child(2) b').allTextContents();
  const rows = shortlist.csv.split('\r\n').slice(1);
  assert.equal(rows.length, rankedIds.length);
  rows.forEach((row, index) => {
    assert.ok(row.startsWith(`"${index + 1}","${rankedIds[index]}"`));
    assert.match(row, /Demo planning estimate; not a county budget/);
    assert.match(row, /synthetic_demo.*DEMO DATA.*not for operational use/);
  });

  await verifyCapitalExportContext(page);
  await verifyBridgeInspectionSource(page);
}

async function verifyCapitalExportContext(page) {
  await page.locator('#capitalButton').click();
  await page.locator('#capitalPhase').selectOption('Design');
  await page.locator('#capitalDistrict').selectOption('Wailuku-Kahului');
  const empty = await exportedCsv(page, '#publicWorksExport');
  assert.equal(empty.filename, 'maui-capital-projects-filtered.csv');
  assert.equal(empty.csv.split('\r\n').length, 1);
  await page.locator('#capitalPhase').selectOption('New construction');
  const filtered = await exportedCsv(page, '#publicWorksExport');
  assert.equal(filtered.csv.split('\r\n').length, 2);
  assert.match(filtered.csv, /CBS-1069/);
  assert.match(filtered.csv, /county_published/);
  assert.doesNotMatch(filtered.csv, /synthetic_demo|CBS-6069|CBS-7232/);
  await page.locator('#inspectionButton').click();
  await expect(page.locator('#inspectionView')).toBeVisible();
}

async function verifyBridgeInspectionSource(page) {
  await page.locator('#map').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => window.publicWorksMap?.loaded());
  const bridge = await page.evaluate(() => {
    const map = window.publicWorksMap;
    const feature = map.queryRenderedFeatures({ layers: ['bridges'] })[0];
    if (!feature) throw new Error('No source bridge visible on the map');
    return { point: map.project(feature.geometry.coordinates), insp: feature.properties.insp };
  });
  const bounds = await page.locator('#map canvas').boundingBox();
  await page.mouse.click(bounds.x + bridge.point.x, bounds.y + bridge.point.y);
  await expect(page.locator('#aKind')).toContainText('National Bridge Inventory');
  await page.locator('#at2').click();
  await expect(page.locator('#ap2 .tl li')).toHaveCount(1);
  const month = new Date(`20${bridge.insp.slice(-2)}-${bridge.insp.slice(0, -2).padStart(2, '0')}-15`)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  await expect(page.locator('#ap2 time')).toHaveText(`${month} · Last NBI inspection`);
  await expect(page.locator('#ap2')).toContainText('Earlier inspection history is not supplied by this source.');
}
