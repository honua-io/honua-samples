import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { startStaticServer } from './lib/browser-lane.mjs';

async function verifySearchShortcut(page) {
  const question = page.locator('#askInput');
  await question.fill('zoning');
  await question.press('End');
  await question.press('/');
  await expect(question).toHaveValue('zoning/');
  await expect(question).toBeFocused();

  const search = page.locator('#q');
  await search.fill('parcel');
  await search.press('End');
  await search.press('/');
  await expect(search).toHaveValue('parcel/');
  await expect(search).toBeFocused();
  await search.press('Escape');

  const tab = page.locator('#t0');
  await tab.focus();
  await tab.press('Control+/');
  await expect(tab).toBeFocused();
  await tab.press('/');
  await expect(search).toBeFocused();
  expect(await search.evaluate((input) => input.selectionEnd - input.selectionStart)).toBe('parcel/'.length);
}

const server = await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const [route, width, target] of [['property', 1440, 'main'], ['property', 390, 'main'], ['property/mobile', 390, 'card']]) {
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
    if (route === 'property') await verifySearchShortcut(page);
    await page.close();
    console.log(`PASS ${route}: first Tab search, next Tab skip, reverse Tab and parcel keyboard lookup`);
  }
} finally {
  await browser.close();
  await server.close();
}
