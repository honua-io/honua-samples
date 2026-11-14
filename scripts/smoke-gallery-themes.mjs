// Exercise generated pages, including persistence across gallery / Explorer routes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';

async function textContrast(page, selector) {
  return page.evaluate((selector) => {
    function luminance(color) {
      const parts = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
        v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
      });
      return parts[0] * .2126 + parts[1] * .7152 + parts[2] * .0722;
    }
    return [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length).map(el => {
      const fg = getComputedStyle(el).color;
      let node = el, bg;
      while (node) {
        bg = getComputedStyle(node).backgroundColor;
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') break;
        node = node.parentElement;
      }
      const a = luminance(fg), b = luminance(bg);
      return { text: el.textContent.trim().slice(0, 60), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  }, selector);
}

const output = path.resolve('.artifacts/gallery-browser-smoke/themes');
await mkdir(output, { recursive: true });
const server = await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const browser = await chromium.launch({ headless: true });
const receipts = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 960 } });
    const page = await context.newPage();
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      const metrics = await page.evaluate(() => {
        const css = getComputedStyle(document.body);
        return { width: document.documentElement.scrollWidth, viewport: innerWidth,
          font: css.fontFamily, foreground: css.color, background: css.backgroundColor };
      });
      assert.ok(metrics.width <= metrics.viewport, `Gallery overflow: ${JSON.stringify(metrics)}`);
      assert.match(metrics.font, /Geist/);
      const contrast = await textContrast(page, '.intro-copy p, .site-header a, .theme-toggle, .starter-card p, .badge');
      assert.ok(contrast.length > 5);
      assert.deepEqual(contrast.filter(item => item.ratio < 4.5), [], `WCAG AA text contrast (${theme})`);
      await page.screenshot({ path: path.join(output, `gallery-${width}-${theme}.png`), fullPage: true });
      receipts.push({ page: 'gallery', width, theme, metrics, contrast });
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.goto(`${server.url}/state-local/sdk-explorer/`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.waitForFunction(() => window.HM?.maps?.length && HM.maps.every(map => map.loaded()), null, { timeout: 60000 });
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    const explorerContrast = await textContrast(page, 'p, label, .appbar a, .theme-toggle, h1, h2, h3');
    assert.deepEqual(explorerContrast.filter(item => item.ratio < 4.5), [], 'Explorer AA text contrast (light)');
    receipts.push({ page: 'explorer', width, theme: 'light', contrast: explorerContrast });
    await page.waitForTimeout(400); // Let MapLibre's 300 ms paint transitions finish.
    await page.screenshot({ path: path.join(output, `explorer-${width}-light.png`), fullPage: true });
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    const explorerDarkContrast = await textContrast(page, 'p, label, .appbar a, .theme-toggle, h1, h2, h3');
    assert.deepEqual(explorerDarkContrast.filter(item => item.ratio < 4.5), [], 'Explorer AA text contrast (dark)');
    receipts.push({ page: 'explorer', width, theme: 'dark', contrast: explorerDarkContrast });
    await page.waitForTimeout(400); // Let MapLibre's 300 ms paint transitions finish.
    await page.screenshot({ path: path.join(output, `explorer-${width}-dark.png`), fullPage: true });
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await context.close();
  }
  const blocked = await browser.newContext();
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage disabled', 'SecurityError'); } });
  });
  const page = await blocked.newPage();
  for (const route of ['/', '/state-local/sdk-explorer/']) {
    await page.goto(`${server.url}${route}`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  }
  await blocked.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: true, receipts, storageUnavailable: 'passed' }, null, 2));
  console.log('Gallery themes passed: 1440/390 light/dark, AA text contrast, cross-route persistence, storage unavailable.');
} finally {
  await browser.close();
  await server.close();
}
