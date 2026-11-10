#!/usr/bin/env node
// Run against the built gallery. --require-previews also gates the currently admitted runnable apps.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './lib/browser-lane.mjs';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(fileURLToPath(new URL('../site/', import.meta.url)));
const evidence = fileURLToPath(new URL('../artifacts/state-local-browser/', import.meta.url));
const previews = JSON.parse(await readFile(path.join(root, 'state-local/sdk-explorer/previews.json')));
const ids = Object.keys(previews);
if (process.argv.includes('--require-previews')) assert.ok(ids.length >= 2, 'At least two active previews required');
const server = await startStaticServer({ rootDir: root, port: 0 });
const base = server.url;
let browser;
try {
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const route of ['', 'switching/', 'sdk-explorer/']) {
      assert.equal((await page.goto(`${base}/state-local/${route}`)).status(), 200);
      if (route === 'sdk-explorer/') await expect(page.locator('#list .item').first()).toBeVisible();
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('.theme-toggle')).toHaveAttribute('aria-pressed', String(theme === 'dark'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow: ${route} ${name} ${theme}`);
        await page.screenshot({ path: path.join(evidence, `${route.replaceAll('/', '') || 'overview'}-${name}-${theme}.png`), fullPage: true });
      }
    }
  }
  await page.locator('#q').fill('connection.inspect');
  await expect(page.locator('[data-id="maplibre-quickstart"]')).toBeVisible();
  await page.locator('#q').fill('no-such-api-unique');
  await expect(page.locator('#list .item')).toHaveCount(0);
  await expect(page.locator('#list .empty')).toBeVisible();
  await page.locator('#q').fill('');
  await page.locator('#flt [data-f=live]').click();
  await expect(page.locator('#list .item')).toHaveCount(ids.length);
  await page.locator('#tabSrc').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tabMd')).toBeFocused();
  await expect(page.locator('#md')).toBeVisible();
  for (const id of ids) {
    await page.locator(`[data-id="${id.split(':')[1]}"]`).click();
    assert.ok(previews[id].dataMode && previews[id].commit, `Missing provenance: ${id}`);
    await expect(page.locator('#pvPanel iframe')).toHaveCount(1);
    const response = await page.request.get(`${base}${previews[id].url}`);
    assert.equal(response.status(), 200, `Preview entrypoint: ${id}`);
    // Execution and rendering of the app itself are gated by the gallery's existing
    // app smoke suite. This check verifies Explorer wiring and disclosure.
    await expect(page.locator('#datas')).toContainText(previews[id].commit);
  }
  const malicious = '<table><tbody><tr><td>Table cell</td></tr></tbody></table><script>window.explorerXss=true</script><img src=x onerror="window.explorerXss=true"><a href="javascript:alert(1)">Bad link</a>';
  await page.route('**/state-local/sdk-explorer/', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    const catalog = JSON.parse(html.match(/window.HD=(.*?);<\/script>/s)[1]);
    catalog['13-sdk-samples'].samples.find((sample) => sample.id === 'maplibre-quickstart').readme = malicious;
    const json = JSON.stringify(catalog).replaceAll('</', '<\\/');
    await route.fulfill({ response, body: html.replace(/window.HD=.*?;<\/script>/s, () => `window.HD=${json};</script>`) });
  });
  await page.goto("about:blank");
  await page.goto(`${base}/state-local/sdk-explorer/#maplibre-quickstart/md`);
  await expect(page.locator('#md td')).toHaveText('Table cell');
  await expect(page.locator('#md script, #md img, #md a[href^="javascript:"]')).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.explorerXss), undefined);
  console.log(`State/local browser checks passed; ${ids.length} preview entrypoints admitted.`);
} finally {
  await browser?.close();
  await server.close();
}
