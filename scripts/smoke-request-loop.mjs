import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';
import { verifyRequestLoop } from './lib/verify-request-loop.mjs';

const server = await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const output = 'artifacts/request-loop';
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(value => localStorage.setItem('honua-theme', value), theme);
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${server.url}/state-local/311/`);
      await page.screenshot({ path: `${output}/311-${width}-${theme}-collapsed.png`, fullPage: true });
      await verifyRequestLoop(page, { capture: () => page.screenshot({ path: `${output}/311-${width}-${theme}-status.png`, fullPage: true }) });
      assert.deepEqual(errors, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      await page.screenshot({ path: `${output}/311-${width}-${theme}.png`, fullPage: true });
      console.log(`PASS 311 linked journey ${width} ${theme}`);
      await context.close();
    }
  }
} finally { await browser.close(); await server.close(); }
