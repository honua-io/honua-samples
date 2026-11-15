import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';

const server = await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const [route, width, target] of [['property', 1440, 'main'], ['property/mobile', 390, 'card']]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(`${server.url}/state-local/${route}/`);
    await page.keyboard.press('Tab');
    await expect(page.locator('#q')).toBeFocused();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to parcel details', exact: true });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await expect(skip).toHaveAttribute('href', `#${target}`);
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#q')).toBeFocused();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('(2) 3-4-039:007');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator(route === 'property' ? '#pTitle' : '#tmk')).toContainText('3-4-039:007');
    await page.close();
    console.log(`PASS ${route}: first Tab search, next Tab skip, reverse Tab and parcel keyboard lookup`);
  }
} finally {
  await browser.close();
  await server.close();
}
