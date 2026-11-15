import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { runCommand } from '../../../scripts/browser-verification/harness.mjs';

const sampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let server;
let origin;

test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  if (!await stat(path.join(sampleDir, 'node_modules', '.bin', 'vite')).catch(() => null)) {
    await runCommand('npm', ['ci', '--no-audit', '--no-fund'], { cwd: sampleDir, label: 'install fixture dependencies' });
  }
  await runCommand('npm', ['run', 'build:fixture'], { cwd: sampleDir, label: 'build fixture' });
  const { preview } = await import('../node_modules/vite/dist/node/index.js');
  server = await preview({ root: sampleDir, mode: 'fixture', build: { outDir: 'dist-fixture' },
    preview: { host: '127.0.0.1', port: 0, open: false } });
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
});
test.afterAll(async () => { await server?.close(); });

async function openOffline(page) {
  const external = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto(`${origin}/?baseUrl=https://ignored.example&parcelsUrl=https://ignored.example/parcels`);
  await expect(page.locator('.tag')).toContainText('Synthetic fixture');
  await expect(page.locator('#data-provenance summary')).toHaveText('Synthetic fixture · no county records');
  await page.locator('#data-provenance summary').click();
  await expect(page.locator('#data-provenance')).toContainText('Invented parcels');
  for (const href of await page.locator('#data-provenance a').evaluateAll(links => links.map(link => link.href))) {
    expect(new URL(href).origin).toBe(origin);
  }
  await expect(page.locator('body')).toHaveAttribute('data-sample-status', 'pass');
  await expect(page.locator('#browse-status')).toContainText('3 parcels loaded');
  await expect.poll(() => page.locator('body').getAttribute('data-rendered-features').then(Number)).toBeGreaterThan(0);
  return external;
}

async function downloadText(page, selector) {
  const ready = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await ready;
  return readFile(await download.path(), 'utf8');
}

async function identifyThirdParcel(page) {
  await page.evaluate(() => window.sampleMap.jumpTo({ center: [-156.4975, 20.8825], zoom: 17 }));
  await expect.poll(() => page.evaluate(() => window.sampleMap.isMoving())).toBe(false);
  const point = await page.evaluate(() => {
    const { x, y } = window.sampleMap.project([-156.4975, 20.8825]);
    return { x, y };
  });
  await page.locator('.maplibregl-canvas').click({ position: point });
  await expect(page.locator('body')).toHaveAttribute('data-tmk', '234008055');
  await expect(page.locator('#parcel-inspection')).toContainText('Showing 234008055');
}

test('offline fixture links rendered parcels, first-click selection, inspection, filter and exports', async ({ page }) => {
  const external = await openOffline(page);
  await expect(page.locator('#zoning-body')).toContainText('R-1');
  await expect(page.locator('#flood-body')).toContainText('AE');
  await page.locator('#parcel-table td[data-field="tmk_txt"]').filter({ hasText: '234008054' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-tmk', '234008054');
  await expect(page.locator('#parcel-inspection')).toContainText('Showing 234008054');
  await expect(page.locator('#zoning-body')).toContainText('B-3');
  const geo = JSON.parse(await downloadText(page, '#export-geojson'));
  expect(geo.features).toHaveLength(1);
  expect(geo.features[0].id).toBe(10);
  expect(geo.features[0].geometry.type).toBe('Polygon');
  expect(geo.features[0].properties.tmk_txt).toBe('234008054');
  await page.locator('#filter-tmk').fill('234008055');
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(page.locator('#browse-status')).toContainText('1 parcels loaded');
  const csv = await downloadText(page, '#export-csv');
  expect(csv).toContain('234008055');
  expect(csv).not.toContain('234008054');
  expect(csv.trim().split(/\r?\n/u)).toHaveLength(2);
  const provenance = JSON.parse(await page.locator('#export-status').getAttribute('data-provenance'));
  expect(provenance.adapterId).toBe('maui-synthetic-fixture');
  await page.getByRole('button', { name: 'Clear filter', exact: true }).click();
  await expect(page.locator('#browse-status')).toContainText('3 parcels loaded');
  await identifyThirdParcel(page);
  expect(external).toEqual([]);
});

test('offline empty lookup clears export; address search stays local on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const external = await openOffline(page);
  await page.locator('#q').fill('999999999');
  await page.locator('#find').click();
  await expect(page.locator('#panel-inner')).toContainText('No parcel');
  await expect(page.locator('#export-geojson')).toBeDisabled();
  await page.locator('#q').fill('200 High Street');
  await page.locator('#find').click();
  await expect(page.locator('#panel-inner')).toContainText('Address search is unavailable');
  await page.locator('#q').fill('234008053');
  await page.locator('#find').click();
  await expect(page.locator('body')).toHaveAttribute('data-tmk', '234008053');
  await expect(page.locator('#export-geojson')).toBeEnabled();
  expect(external).toEqual([]);
});

test('pagehide event contract preserves cached resources and disposes discarded map once', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const external = await openOffline(page);
  await page.evaluate(() => {
    window.mapRemovals = 0;
    window.sampleMap.on('remove', () => { window.mapRemovals += 1; });
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  });
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.locator('#filter-tmk').fill('234008054');
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(page.locator('#browse-status')).toContainText('1 parcels loaded');
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
  });
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.mapRemovals)).toBe(1);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('offline parcel browser recovers after real navigation and back', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const external = await openOffline(page);
  await page.goto(`${origin}/?tmk=234008054`);
  await expect(page.locator('body')).toHaveAttribute('data-tmk', '234008054');
  await page.goBack();
  await expect(page.locator('body')).toHaveAttribute('data-tmk', '234008053');
  await expect(page.locator('#browse-status')).toContainText('3 parcels loaded');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.locator('#filter-tmk').fill('234008055');
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(page.locator('#browse-status')).toContainText('1 parcels loaded');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
