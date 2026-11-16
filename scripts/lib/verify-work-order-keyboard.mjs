import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function verifyWorkOrderKeyboard(page) {
  await page.waitForFunction(() => window.publicWorksMap?.loaded());
  const cards = page.locator('.wo[data-asset]');
  const first = cards.first();
  const firstId = await first.getAttribute('data-asset');
  const secondIndex = await cards.evaluateAll((nodes, id) => nodes.findIndex((node) => node.dataset.asset !== id), firstId);
  assert.ok(secondIndex > 0, 'Work-order keyboard coverage needs two distinct assets');
  const second = cards.nth(secondIndex);
  const secondId = await second.getAttribute('data-asset');
  for (const [card, id, key] of [[first, firstId, 'Enter'], [second, secondId, 'Space']]) {
    await expect(card).toHaveAttribute('role', 'button');
    await card.focus();
    await page.keyboard.press(key);
    await expect(page.locator('#aTitle')).toHaveText(id);
    await expect(card).toBeFocused();
  }
  await first.click();
  await expect(page.locator('#aTitle')).toHaveText(firstId);
  return { enter: firstId, space: secondId, pointer: firstId };
}
