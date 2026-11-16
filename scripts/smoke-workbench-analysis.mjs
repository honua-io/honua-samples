// Contract doubles only: this proves browser wiring, never a real Maui/agent run.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startSmokeSite } from './lib/smoke-site.mjs';
import { sha256, operations } from '../shared/state-local/workbench-analytics.mjs';

const dataset = { name: 'Browser harness data', sourceUrl: 'https://example.org/harness', license: 'CC0', sha256: 'a'.repeat(64) };
const manifest = { dataset, operations: {} };
const resources = new Map();
for (const [key, definition] of Object.entries(operations)) {
  const raw = JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-156.4, 20.8] },
      properties: { [definition.label]: 'harness-category', [definition.value]: 7 } },
  ] });
  const digest = await sha256(raw);
  manifest.operations[key] = { recording: `${key}.json`, agentRecording: `${key}-agent.json`, ...(key === 'h3' ? { cellLimit: 100 } : {}) };
  resources.set(`${key}.json`, { raw, sha256: digest, datasetSha256: dataset.sha256,
    createdAt: '2026-11-16T12:00:00Z', serverImage: 'harness-only', request: { method: 'GET', url: '/harness' } });
  resources.set(`${key}-agent.json`, { question: 'Chart the harness counts', provider: 'harness', model: 'harness',
    runId: 'harness-only', createdAt: '2026-11-16T12:00:00Z', resultSha256: digest,
    chart: { title: 'Harness chart', series: [{ label: 'harness-category', value: 7 }] } });
}
resources.set('manifest.json', manifest);

async function checkExport(page, format) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: `Export analysis ${format}`, exact: true }).click();
  const stream = await (await pending).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const content = Buffer.concat(chunks).toString();
  if (format === 'CSV') assert.match(content, /"harness-category","7"/);
  else assert.equal(JSON.parse(content).features[0].properties[operations[await page.locator('#serverOperation').inputValue()].value], 7);
}

async function checkOperations(page) {
  for (const [key, definition] of Object.entries(operations)) {
    await page.locator('#serverOperation').selectOption(key);
    await page.locator('#serverAnalysis [data-run]').click();
    await expect(page.locator('#serverAnalysis [role=status]')).toContainText('Recorded server result');
    await expect(page.getByRole('table', { name: `${definition.title} server result`, exact: true })).toContainText('7');
    await expect(page.getByLabel('Recorded agent chart; values verified against the server table')).toContainText('harness-category: 7');
    await page.waitForFunction(() => document.querySelector('#map').honuaAnalysisMap?.getSource('server-analysis'));
    assert.equal(await page.evaluate(() => document.querySelector('#map').honuaAnalysisMap.getSource('server-analysis')._data.features.length), 1);
    await checkExport(page, 'CSV');
    await checkExport(page, 'GeoJSON');
  }
}

const server = await startSmokeSite({ rootDir: path.resolve('site') });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const output = path.resolve('.artifacts/workbench-analysis');
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 960 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/state-local/data/analysis/manifest.json', route => route.fulfill({ json: null }));
    const unavailable = page.waitForResponse('**/state-local/data/analysis/manifest.json');
    await page.goto(`${server.url}/state-local/workbench/`);
    assert.equal((await unavailable).status(), 200);
    await expect(page.locator('#serverAnalysis [role=status]')).toContainText('Server analysis is not published yet');
    await expect(page.locator('#serverAnalysis [data-run]')).toBeDisabled();
    await expect(page.locator('#serverAnalysis table')).toHaveCount(0);
    await page.route('**/state-local/data/analysis/*.json', async route => {
      const value = resources.get(new URL(route.request().url()).pathname.split('/').pop());
      await route.fulfill({ status: value ? 200 : 404, json: value ?? {} });
    });
    await page.goto(`${server.url}/state-local/workbench/`);
    await page.locator('#serverAnalysis summary').click();
    await expect(page.locator('#serverAnalysis [data-run]')).toBeEnabled();
    await checkOperations(page);
    await page.screenshot({ path: path.join(output, `harness-${width}.png`), fullPage: true });
    resources.set('h3.json', { ...resources.get('h3.json'), sha256: 'bad' });
    await page.locator('#serverAnalysis [data-run]').click();
    await expect(page.locator('#serverAnalysis [role=status]')).toContainText('checksum');
    await expect(page.locator('#serverAnalysis table')).toHaveCount(0);
    assert.deepEqual(errors, []);
    resources.set('h3.json', { ...resources.get('h3.json'), sha256: await sha256(resources.get('h3.json').raw) });
    await context.close();
  }
  console.log('PASS signed-out desktop/mobile analysis contract: three operations, map/table/chart, exports and tamper rejection. Harness only.');
} finally {
  await browser.close();
  await server.close();
}
