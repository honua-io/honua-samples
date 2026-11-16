import assert from 'node:assert/strict';

const routes = ['property', '311', 'public-works', 'emergency', 'workbench', 'sdk-explorer'];
const phoneFlowRoutes = new Map([
  ['sdk-explorer', ['.sx > .left', '.sx > .center']],
  ['workbench', ['.wb > .nlq', '.wb > .center']],
  ['emergency', ['#map', '.layout > .col']],
]);
const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }];

async function uncoveredMapPoint(page) {
  return page.evaluate(() => {
    const canvas = HM.maps[0].getCanvas();
    const rect = canvas.getBoundingClientRect();
    for (const x of [.5, .25, .75, .1, .9]) for (const y of [.5, .25, .75, .1, .9]) {
      const point = { x: rect.x + rect.width * x, y: rect.y + rect.height * y };
      if (document.elementFromPoint(point.x, point.y) === canvas) return point;
    }
    throw new Error('No uncovered map canvas');
  });
}

async function verifyViewport(page, viewport, pageHeight) {
  await page.waitForFunction(() => window.HM?.maps[0]?.loaded(), { timeout: 60_000 });
  const before = await page.evaluate(() => ({ zoom: HM.maps[0].getZoom(), rect: HM.maps[0].getContainer().getBoundingClientRect().toJSON() }));
  assert.ok(before.rect.width > 100 && before.rect.height > 100, 'Map fills a usable area');
  const point = await uncoveredMapPoint(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -200);
  await page.waitForFunction(zoom => HM.maps[0].getZoom() > zoom, before.zoom);
  const after = await page.evaluate(() => ({
    scrollY, height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth,
    panels: [...document.querySelectorAll('*')]
      .filter(element => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 2)
      .map(element => { element.scrollTop = element.scrollHeight; return element.scrollTop > 0; }),
  }));
  assert.equal(after.scrollY, 0, 'Wheel zoom keeps the page still');
  assert.equal(after.height, pageHeight, 'Shell uses its viewport or readable minimum height');
  if (pageHeight > viewport.height) {
    assert.equal(await page.evaluate(() => { scrollTo(0, document.documentElement.scrollHeight); return scrollY; }), pageHeight - viewport.height, 'Short windows can reach the bottom of the shell');
  }
  assert.equal(after.width, viewport.width, 'No page horizontal overflow');
  assert.ok(after.panels.length > 0 && after.panels.every(Boolean), 'Long panels scroll internally');
}

async function verifyDocumentFlow(page, viewport, [first, second]) {
  await page.waitForFunction(() => window.HM?.maps[0]?.loaded(), { timeout: 60_000 });
  const layout = await page.evaluate(([a, b]) => ({
    width: document.documentElement.scrollWidth,
    tops: [a, b].map((selector) => document.querySelector(selector).getBoundingClientRect().top),
    mapWidth: HM.maps[0].getContainer().getBoundingClientRect().width,
    height: document.documentElement.scrollHeight,
  }), [first, second]);
  assert.equal(layout.width, viewport.width, 'No page horizontal overflow');
  assert.ok(layout.tops[0] < layout.tops[1], `${first} precedes ${second} as in the mockup`);
  assert.ok(layout.mapWidth > viewport.width * 0.9, 'Map spans the flowing layout width');
  assert.ok(layout.height > viewport.height, 'Flowing panels remain available below the fold');
}

export async function verifyAppShells(context, baseUrl) {
  for (const viewport of viewports) for (const theme of ['light', 'dark']) for (const route of routes) {
    const page = await context.newPage();
    try {
      await page.setViewportSize(viewport);
      await page.addInitScript(value => localStorage.setItem('honua-theme', value), theme);
      await page.goto(`${baseUrl}/state-local/${route}/`);
      if (viewport.width <= 640 && phoneFlowRoutes.has(route)) await verifyDocumentFlow(page, viewport, phoneFlowRoutes.get(route));
      else {
        const pageHeight = ['emergency', 'sdk-explorer', 'workbench'].includes(route) ? Math.max(800, viewport.height) : viewport.height;
        await verifyViewport(page, viewport, pageHeight);
      }
      console.log(`PASS app shell: ${route} ${viewport.width} ${theme}`);
    } finally { await page.close(); }
  }
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ['', 'switching/']) {
      await page.goto(`${baseUrl}/state-local/${route}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), `Marketing page scrolls: ${route || 'overview'}`);
    }
  } finally { await page.close(); }
}
