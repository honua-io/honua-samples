import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';

const server = await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
try {
  await page.goto(`${server.url}/state-local/`);
  await expect(page.getByRole('link', { name: 'How switching works', exact: true })).toHaveAttribute('href', '/state-local/switching/');
  await expect(page.getByRole('link', { name: 'Switching guide', exact: true }).first()).toHaveAttribute('href', '/state-local/switching/');
  await expect(page.locator('#heroMap[data-map-ready="true"]')).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator('.jcard')).toHaveCount(4);
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(5);
  await expect(page.locator('[data-map-ready="true"]')).toHaveCount(5, { timeout: 30000 });
  await page.goto(`${server.url}/state-local/workbench/`);
  await expect(page.locator('#nShown')).not.toBeEmpty();
  const defaultCount = await page.locator('#nShown').textContent();
  await page.locator('[data-l="requests"]').click();
  const unfilteredRequests = await page.locator('#nShown').textContent();
  await page.locator('.chart .bar').first().click();
  await page.locator('#dt th[data-sort="type"]').click();
  const count = await page.locator('#nShown').textContent();
  assert.ok(Number(count.replaceAll(',', '')) < Number(unfilteredRequests.replaceAll(',', '')));
  await page.locator('#shareBtn').click();
  const link = await page.locator('#shareLink').textContent();
  assert.ok(link.startsWith(`${server.url}/state-local/workbench/#s=`));
  assert.ok(!link.includes('…'));
  await page.goto(`${server.url}/state-local/`);
  await page.goto(link);
  await expect(page.locator('#nShown')).toHaveText(count);
  await expect(page.locator('#dt th[data-sort="type"]')).toHaveAttribute('aria-sort', 'ascending');
  const downloaded = page.waitForEvent('download');
  await page.locator('#expGj').click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(exported.features.length, Number(count.replaceAll(',', '')));
  assert.ok(exported.features.every((f) => f.properties.data_origin === 'synthetic_demo' && f.properties.disclaimer.includes('DEMO DATA')));
  const shared = JSON.parse(decodeURIComponent(new URL(link).hash.slice(3)));
  const visitState = async (state) => {
    await page.goto(`${server.url}/state-local/`);
    await page.goto(`${server.url}/state-local/workbench/#s=${encodeURIComponent(JSON.stringify(state))}`);
  };
  await visitState({ ...shared, attr: [{ f: 'dept', op: '=', v: 'Parks & Recreation' }], chartF: {} });
  await expect(page.locator('#nShown')).toHaveText('51');
  await page.locator('[data-l="parcels"]').click();
  await page.locator('#shareBtn').click();
  const parcels = JSON.parse(decodeURIComponent(new URL(await page.locator('#shareLink').textContent()).hash.slice(3)));
  for (const invalid of [{ attr: [{ f: 'zgroup', op: 'in', v: 1 }] }, { spatial: [] }, { charts: [{ t: 'time', f: 'land' }] }]) {
    await visitState({ ...parcels, ...invalid });
    await expect(page.locator('#nShown')).toHaveText(defaultCount);
    await expect(page.locator('#nlqMiss')).toBeVisible();
    await expect(page.locator('#nlqMiss')).toContainText('invalid');
  }
  await visitState({ ...parcels, is3d: true, view: { ...parcels.view, pitch: 58 } });
  await expect(page.locator('#v3d')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#note3d')).toContainText('do not represent building heights');
  const malicious = encodeURIComponent(JSON.stringify({ layer: '<img src=x onerror=alert(1)>' }));
  await page.goto(`${server.url}/state-local/`);
  await page.goto(`${server.url}/state-local/workbench/#s=${malicious}`);
  await expect(page.locator('[data-l="parcels"]')).toHaveAttribute('aria-pressed', 'true');
  assert.deepEqual(errors, []);
  console.log('PASS overview mini-maps; workbench chart filters, share round trip, sorted table, labelled GeoJSON and invalid-state fallback');
} finally {
  await browser.close();
  await server.close();
}
