import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { startStaticServer } from '../../../scripts/lib/browser-lane.mjs';

const sampleDir = fileURLToPath(new URL('..', import.meta.url));
let outputDir;
let server;
test.beforeAll(async ({}, info) => {
  info.setTimeout(300_000);
  outputDir = await mkdtemp(path.join(os.tmpdir(), 'maui-emergency-approved-'));
  await promisify(execFile)(process.execPath, [path.join(sampleDir, 'build-approved.mjs'), outputDir], { cwd: sampleDir });
  server = await startStaticServer({ rootDir: outputDir, port: 0 });
});
test.afterAll(async () => {
  await server?.close();
  if (outputDir) await rm(outputDir, { recursive: true, force: true });
});

test('live public feeds show current, failed and stale states apart from the exercise', async ({ page }) => {
  const now = new Date();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://api.weather.gov/**', (route) => route.fulfill({ json: { updated: now.toISOString(), features: [
    { properties: { event: 'High Surf Advisory', geocode: { SAME: ['015009'] } } },
    { properties: { event: 'Wind Advisory', geocode: { SAME: ['015001'] } } }] } }));
  await page.route('https://waterservices.usgs.gov/**', (route) => route.abort());
  await page.route('https://api.tidesandcurrents.noaa.gov/**', (route) => route.fulfill({ json: { data: [
    { t: new Date(now - 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' '), v: '1.5', q: 'p' }] } }));
  await page.goto(`${server.url}/index.html`);
  const feed = (id) => page.locator(`#liveFeeds [data-feed="${id}"]`);
  await expect(feed('nws')).toHaveAttribute('data-state', 'current');
  await expect(feed('nws')).toContainText('1 active for Maui County: High Surf Advisory');
  await expect(feed('usgs')).toHaveAttribute('data-state', 'error');
  await expect(feed('usgs')).toContainText('Unavailable: network request failed');
  await expect(feed('tide')).toHaveAttribute('data-state', 'stale');
  await expect(feed('tide')).toContainText('stale: expected within 30 min');
  await expect(page.locator('section[aria-labelledby="lfH"] .tag-real')).toHaveText('real data');
  const receipt = await (await page.request.get(`${server.url}/data/sources.json`)).json();
  expect(receipt.liveFeeds.map(({ id, license }) => [id, license])).toEqual([['nws', 'public-domain'], ['usgs', 'public-domain'], ['tide', 'public-domain']]);
  expect(errors).toEqual([]);
});
