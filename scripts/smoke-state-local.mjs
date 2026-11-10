#!/usr/bin/env node
// Run against the built gallery. --require-previews also gates the six runnable apps.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, stat, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(fileURLToPath(new URL('../site/', import.meta.url)));
const evidence = fileURLToPath(new URL('../artifacts/state-local-browser/', import.meta.url));
const ids = ['sdk-js:maplibre-quickstart', 'sdk-js:sketch-editing', 'sdk-js:spatial-analytics-workbench', 'sdk-js:nl-map-control', 'samples:maplibre-featureserver-layer', 'samples:maplibre-category-style-legend'];
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`, url.pathname.endsWith('/') ? 'index.html' : '');
    if (!file.startsWith(`${root}${path.sep}`) || !(await stat(file)).isFile()) throw new Error('Not found');
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const route of ['', 'switching/', 'sdk-explorer/']) {
      assert.equal((await page.goto(`${base}/state-local/${route}`)).status(), 200);
      if (route === 'sdk-explorer/') await expect(page.locator('#sample-list button').first()).toBeVisible();
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('.theme-toggle')).toHaveAttribute('aria-pressed', String(theme === 'dark'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow: ${route} ${name} ${theme}`);
        await page.screenshot({ path: path.join(evidence, `${route.replaceAll('/', '') || 'overview'}-${name}-${theme}.png`), fullPage: true });
      }
    }
  }
  await page.locator('#search').fill('connection.inspect');
  await expect(page.locator('[data-sample="sdk-js:maplibre-quickstart"]')).toBeVisible();
  await page.locator('#search').fill('no-such-api-unique');
  await expect(page.locator('#sample-list button')).toHaveCount(0);
  await expect(page.locator('#catalog-status')).toHaveText('0 matching samples');
  await page.locator('#search').fill('');
  await page.locator('#mode').selectOption('preview');
  await expect(page.locator('#sample-list button')).toHaveCount(6);
  await page.locator('#tab-source').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-readme')).toBeFocused();
  await expect(page.locator('#readme')).toBeVisible();
  const previews = JSON.parse(await readFile(path.join(root, 'state-local/sdk-explorer/previews.json')));
  for (const id of ids) {
    await page.locator(`[data-sample="${id}"]`).click();
    if (!previews[id]) {
      assert.ok(!process.argv.includes('--require-previews'), `Required preview missing: ${id}`);
      await expect(page.locator('#sample-provenance')).toContainText('no verified runnable preview');
      await expect(page.locator('#preview iframe')).toHaveCount(0);
      continue;
    }
    assert.ok(previews[id].dataMode && previews[id].commit, `Missing provenance: ${id}`);
    await expect(page.locator('#preview iframe')).toHaveCount(1);
    const response = await page.request.get(`${base}${previews[id].url}`);
    assert.equal(response.status(), 200, `Preview entrypoint: ${id}`);
    // Execution and rendering of the app itself are gated by the gallery's existing
    // app smoke suite. This check verifies Explorer wiring and disclosure.
    await expect(page.locator('#sample-provenance')).toContainText(previews[id].commit);
  }
  console.log(`State/local browser checks passed; ${ids.filter((id) => previews[id]).length}/6 preview entrypoints admitted.`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
