import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function verifyWorkbenchText(page, url) {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await expect(page.locator('#map canvas')).toBeVisible();
      await page.evaluate((value) => {
        window.HM.setTheme(value);
        const sizes = [...document.querySelectorAll('body, body *')].map((element) => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.setProperty('font-size', `${size * 2}px`, 'important');
      }, theme);
      const collisions = await page.evaluate(() => {
        const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
        const header = [...document.querySelectorAll('.appbar strong, .appbar small, .appnav a, #sdkBtn, .appbar .env, #shareBtn')]
          .filter((element) => element.getBoundingClientRect().width > 0).map((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return { text: element.textContent.trim(), bounds: range.getBoundingClientRect() };
          });
        const failures = [];
        header.forEach((a, index) => header.slice(index + 1).forEach((b) => {
          if (overlap(a.bounds, b.bounds)) failures.push(`${a.text} overlaps ${b.text}`);
        }));
        for (const row of document.querySelectorAll('.chart .bar')) {
          const label = row.querySelector('.bar-label, text');
          const track = row.querySelector('.bar-track, rect');
          const count = row.querySelector('.bar-count') || row.querySelectorAll('text')[1];
          if (overlap(label.getBoundingClientRect(), track.getBoundingClientRect())
            || overlap(label.getBoundingClientRect(), count.getBoundingClientRect())) failures.push(`Chart label overlaps: ${label.textContent}`);
          if (row.scrollWidth > row.clientWidth + 1) failures.push(`Chart row overflows: ${label.textContent}`);
        }
        return failures;
      });
      assert.deepEqual(collisions, [], `${theme} ${width}px at 200% text`);
    }
  }
  // Native chart buttons retain single, multiple and keyboard selection.
  await page.goto(url);
  const bars = page.locator('.chart .bar');
  const first = bars.first();
  const count = await page.locator('#nShown').textContent();
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  assert.notEqual(await page.locator('#nShown').textContent(), count);
  await bars.nth(1).click({ modifiers: ['Shift'] });
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(bars.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await first.click();
  await expect(bars.nth(1)).toHaveAttribute('aria-pressed', 'false');
  await first.focus();
  await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#nShown')).toHaveText(count);
}
