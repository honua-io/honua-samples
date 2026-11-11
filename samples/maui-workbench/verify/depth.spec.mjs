import { test, expect } from '@playwright/test';
import { prepareDepthBrowser } from './depth-fixture.mjs';

let site;
test.beforeAll(async () => { site = await prepareDepthBrowser(); });
test.afterAll(async () => { await site?.close(); });

for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
  test(`numeric depth ${theme} ${width}px: bounded Float32 values, unknown cells and keyboard`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.addInitScript((value) => localStorage.setItem('honua-theme', value), theme);
    const responses = [];
    page.on('response', (response) => {
      if (response.url().endsWith('.tif') && response.request().method() === 'GET') responses.push(response);
    });
    await page.goto(site.url);
    expect(responses).toHaveLength(0);
    await page.locator('#load-depth').click();
    await expect(page.locator('#depth-map')).toHaveAttribute('aria-disabled', 'false');
    const canvas = page.locator('#depth-map');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * (544.5 / 768), box.y + box.height * 0.5);
    await expect(page.locator('#cell-value')).toHaveAttribute('data-value', '1.25');
    await expect(page.locator('#cell-value')).toHaveText('1.250000 m above ground');
    await canvas.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#cell-value')).toHaveAttribute('data-value', '1.2578125');
    const count = responses.length;
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await expect(page.locator('#cell-value')).toHaveText('NoData · unknown');
    expect(responses.length).toBe(count);
    expect(responses.length).toBeGreaterThan(0);
    expect(responses.every((response) => response.status() === 206 && response.headers()['content-range'])).toBe(true);
    const transferred = responses.reduce((total, response) => total + Number(response.headers()['content-length']), 0);
    expect(transferred).toBeLessThan(8 * 1024 * 1024);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/workbench-depth-${theme}-${width}.png`, fullPage: true });
  });
}

test('numeric depth refuses whole-file responses and permits a clean retry', async ({ page }) => {
  await page.goto(site.url);
  await page.route('**/*.tif', (route) => route.fulfill({ status: 200, body: 'not a range response' }));
  await page.locator('#load-depth').click();
  await expect(page.locator('#load-status')).toContainText('whole-file fallback is disabled');
  await expect(page.locator('#depth-map')).toHaveAttribute('aria-disabled', 'true');
  await page.unroute('**/*.tif');
  await page.locator('#load-depth').click();
  await expect(page.locator('#depth-map')).toHaveAttribute('aria-disabled', 'false');
});
