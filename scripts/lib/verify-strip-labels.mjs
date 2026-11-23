// Every data label in a disclosure strip stays visible without scrolling the strip,
// and a strip that scrolls is a named tab stop so keyboard users can read all of it.
import assert from 'node:assert/strict';

const routes = ['', 'property/', '311/', 'emergency/', 'public-works/', 'workbench/', 'catalog/', 'sdk-explorer/'];
const viewports = [[1440, 900], [390, 844], [390, 667]];

function stripReport() {
  return [...document.querySelectorAll('.demostrip')].map((strip) => {
    const box = strip.getBoundingClientRect();
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
    };
    const labels = [...strip.querySelectorAll(':scope > .tag-real, :scope > .tag-demo')].map((t) => t.textContent.trim());
    const visible = new Set([...strip.querySelectorAll('.tag-real, .tag-demo')].filter(shown).map((t) => t.textContent.trim()));
    return { missing: labels.filter((label) => !visible.has(label)), overflowing: strip.scrollHeight > strip.clientHeight + 1,
      focusable: strip.tabIndex === 0, named: Boolean(strip.getAttribute('aria-label')) };
  });
}

async function verifyRoute(page, url, [width, height]) {
  await page.setViewportSize({ width, height });
  assert.equal((await page.goto(url)).status(), 200, url);
  await page.waitForTimeout(300);
  for (const strip of await page.evaluate(stripReport)) {
    assert.deepEqual(strip.missing, [], `Labels scrolled out of view: ${url} at ${width}x${height}`);
    assert.equal(strip.focusable && strip.named, strip.overflowing, `Strip tab stop matches its overflow: ${url} at ${width}x${height}`);
  }
}

export async function verifyStripLabels(context, baseUrl) {
  const page = await context.newPage();
  try {
    for (const viewport of viewports) for (const route of routes) await verifyRoute(page, `${baseUrl}/state-local/${route}`, viewport);
  } finally { await page.close(); }
  console.log(`PASS strip labels visible and scrolling strips keyboard-reachable on ${routes.length} routes at ${viewports.length} viewports`);
}
