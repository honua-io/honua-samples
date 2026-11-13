import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { runCommand } from '../../../scripts/browser-verification/harness.mjs';

const sampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const servers = [];
const origins = {};

test.beforeAll(async ({}, info) => {
  info.setTimeout(240_000);
  if (!await stat(path.join(sampleDir, 'node_modules', '.bin', 'vite')).catch(() => null)) {
    await runCommand('npm', ['ci', '--no-audit', '--no-fund'], { cwd: sampleDir });
  }
  const { preview } = await import('../node_modules/vite/dist/node/index.js');
  for (const mode of ['service', 'snapshot']) {
    const outDir = `dist/provenance-${mode}`;
    await runCommand('npm', ['run', 'build', '--', '--outDir', outDir], {
      cwd: sampleDir, env: { ...process.env, VITE_STATE_LOCAL_SNAPSHOT: mode === 'snapshot' ? '1' : '0' },
    });
    const server = await preview({ root: sampleDir, build: { outDir }, preview: { host: '127.0.0.1', port: 0, open: false } });
    servers.push(server);
    origins[mode] = `http://127.0.0.1:${server.httpServer.address().port}`;
  }
});
test.afterAll(async () => { for (const server of servers) await server.close(); });

async function openDisclosure(page, mode, params = {}) {
  const url = new URL(origins[mode]);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  await page.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
  await page.goto(url.href);
  const summary = page.locator('#data-provenance summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#data-provenance')).toHaveAttribute('open', '');
  return page.locator('#data-provenance');
}

test('archive display and service queries disclose separate versions, sources and unknown dates', async ({ page }) => {
  const panel = await openDisclosure(page, 'service', { parcelsUrl: 'https://county.example/parcels', stateLandUseUrl: 'https://county.example/land-use', snapshotDate: '2099-01-01' });
  await expect(panel.locator('summary')).toContainText('Archive outlines + live queries');
  await expect(panel).toContainText('may represent different versions');
  await expect(panel).toContainText('no verified source timestamps');
  await expect(panel).not.toContainText('2099');
  await expect(panel.getByRole('link', { name: 'Parcel query source', exact: true })).toHaveAttribute('href', 'https://county.example/parcels');
  await expect(panel.getByRole('link', { name: 'State land use', exact: true })).toHaveAttribute('href', 'https://county.example/land-use');
  await expect(panel.getByRole('link', { name: 'Parcel outline archive (PMTiles)', exact: true })).toHaveAttribute('rel', 'noopener noreferrer');
});

test('query-only mode handles unsafe and malformed source links without breaking disclosure', async ({ page }) => {
  const panel = await openDisclosure(page, 'service', { parcelTilesUrl: 'none', buildingsUrl: 'none', basemap: 'none', parcelsUrl: 'javascript:alert(1)', zoningUrl: 'http://[invalid' });
  await expect(panel.locator('summary')).toContainText('Live service queries');
  await expect(panel).toContainText('Parcel query source: source link unavailable');
  await expect(panel).toContainText('Zoning source: source link unavailable');
  await expect(panel.getByRole('link')).toHaveCount(1);
});

test('local snapshot discloses bundled sources and unavailable capture date on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await openDisclosure(page, 'snapshot', { parcelsUrl: 'https://ignored.example', snapshotDate: '2099-01-01' });
  await expect(panel.locator('summary')).toHaveText('Local display snapshot · capture date unavailable');
  await expect(panel).toContainText('bundled GeoJSON files');
  await expect(panel).not.toContainText('2099');
  for (const href of await panel.getByRole('link').evaluateAll(links => links.map(link => link.href))) {
    expect(new URL(href).origin).toBe(origins.snapshot);
    expect(new URL(href).pathname).toMatch(/\.geojson$/u);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
