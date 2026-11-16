import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function verifyRequestDrawer(page) {
  const drawer = page.locator('#drawer');
  const row = page.locator('#qBody tr').first();
  const close = page.locator('#dClose');
  await expect(drawer).toHaveAttribute('inert', '');
  await row.focus();
  await close.evaluate((element) => element.focus());
  await expect(row).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(close).toBeFocused();
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
  const related = drawer.locator('[data-sel]').first();
  await related.click();
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
  await expect(drawer).toHaveAttribute('inert', '');
  await expect(row).toBeFocused();
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('Tab');
    assert.equal(await drawer.evaluate((element) => element.contains(document.activeElement)), false,
      'Closed request controls must stay out of the Tab order');
  }
  await row.click();
  await expect(close).toBeFocused();
  await close.click();
  await expect(row).toBeFocused();
  await expect(drawer).toHaveAttribute('inert', '');
}
