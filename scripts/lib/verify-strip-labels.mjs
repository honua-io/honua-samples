// Every data label in a disclosure strip stays visible without scrolling the strip.
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
    return { missing: labels.filter((label) => !visible.has(label)) };
  });
}

async function verifyRoute(page, baseUrl, route, [width, height]) {
  await page.setViewportSize({ width, height });
  assert.equal((await page.goto(`${baseUrl}/state-local/${route}`)).status(), 200, route);
  await page.waitForTimeout(300);
  for (const strip of await page.evaluate(stripReport)) {
    assert.deepEqual(strip.missing, [], `Labels scrolled out of view: /${route} at ${width}x${height}`);
  }
}

export async function verifyStripLabels(context, baseUrl) {
  const page = await context.newPage();
  try {
    for (const viewport of viewports) for (const route of routes) await verifyRoute(page, baseUrl, route, viewport);
  } finally { await page.close(); }
  console.log(`PASS strip labels visible on ${routes.length} routes at ${viewports.length} viewports`);
}
