import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1440;
const OVERLAP_TOLERANCE_PX = 0.5;
const PRESSED_ATTRIBUTE = 'aria-pressed';

export async function verifyWorkbenchText(page, url) {
  for (const theme of ['light', 'dark']) {
    for (const width of [PHONE_WIDTH, DESKTOP_WIDTH]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await expect(page.locator('#map canvas')).toBeVisible();
      await page.evaluate((value) => {
        window.HM.setTheme(value);
        const sizes = [...document.querySelectorAll('body, body *')].map((element) => [element, parseFloat(getComputedStyle(element).fontSize)]);
        for (const [element, size] of sizes) element.style.setProperty('font-size', `${size * 2}px`, 'important');
      }, theme);
      const collisions = await page.evaluate((overlapTolerance) => {
        const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > overlapTolerance
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > overlapTolerance;
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
        for (const chart of document.querySelectorAll('.chart')) {
          const tracks = [...chart.querySelectorAll('.bar-track')].map((track) => track.getBoundingClientRect());
          if (tracks.some((track) => Math.abs(track.left - tracks[0].left) > overlapTolerance
            || Math.abs(track.width - tracks[0].width) > overlapTolerance)) failures.push('Chart rows use different scales');
        }
        return failures;
      }, OVERLAP_TOLERANCE_PX);
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
  await expect(first).toHaveAttribute(PRESSED_ATTRIBUTE, 'true');
  await expect(first).toBeFocused();
  assert.notEqual(await page.locator('#nShown').textContent(), count);
  await bars.nth(1).click({ modifiers: ['Shift'] });
  await expect(first).toHaveAttribute(PRESSED_ATTRIBUTE, 'true');
  await expect(bars.nth(1)).toHaveAttribute(PRESSED_ATTRIBUTE, 'true');
  await first.click();
  await expect(bars.nth(1)).toHaveAttribute(PRESSED_ATTRIBUTE, 'false');
  await expect(first).toBeFocused();
  await page.keyboard.press('Space');
  await expect(first).toHaveAttribute(PRESSED_ATTRIBUTE, 'false');
  await expect(page.locator('#nShown')).toHaveText(count);
}
