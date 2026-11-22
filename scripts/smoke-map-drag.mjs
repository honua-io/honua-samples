import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startSmokeSite } from './lib/smoke-site.mjs';

const server = await startSmokeSite({ rootDir: path.resolve('site'), baseUrl: process.env.STATE_LOCAL_SMOKE_BASE_URL });
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

async function ready(page) {
  await page.waitForFunction(() => window.HM?.maps.some((map) => map._hash && map.loaded()), null, { timeout: 60_000 });
}

async function camera(page) {
  return page.evaluate(() => {
    const map = HM.maps.find((entry) => entry._hash);
    return { center: map.getCenter().toArray(), zoom: map.getZoom(), hash: location.hash };
  });
}

async function drag(page, target) {
  const canvas = await page.locator('#map canvas').boundingBox();
  const legend = await page.locator('.legend').boundingBox();
  const start = { x: legend.x - 60, y: legend.y + 40 };
  const ends = {
    legend: { x: legend.x + 80, y: start.y },
    canvas: { x: start.x - 80, y: start.y - 50 },
    outside: { x: canvas.x - 40, y: start.y },
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(ends[target].x, ends[target].y, { steps: 15 });
  await page.mouse.up();
  await page.waitForFunction(() => !HM.maps.find((map) => map._hash).isMoving(), null, { timeout: 10_000 });
  await page.waitForTimeout(500);
}

async function checkDrag(page, target) {
  const before = await camera(page);
  await drag(page, target);
  const after = await camera(page);
  assert.ok(after.center.some((value, index) => Math.abs(value - before.center[index]) > 0.0001), `${target}: camera moved`);
  await page.reload();
  await ready(page);
  const restored = await camera(page);
  assert.equal(restored.hash, after.hash, `${target}: hash persisted`);
  assert.ok(Math.abs(restored.zoom - after.zoom) < 0.01, `${target}: zoom persisted`);
  after.center.forEach((value, index) => assert.ok(Math.abs(value - restored.center[index]) < 0.001, `${target}: center persisted`));
}

async function checkLegend(page) {
  const zone = page.getByRole('checkbox', { name: 'Evacuation zone', exact: true });
  await zone.uncheck();
  assert.equal(await page.evaluate(() => HM.maps.find((map) => map._hash).getLayoutProperty('tsunami', 'visibility')), 'none');
  await zone.check();
  assert.equal(await page.evaluate(() => HM.maps.find((map) => map._hash).getLayoutProperty('tsunami', 'visibility')), 'visible');
}

async function checkPage(context, theme) {
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${server.url}/state-local/emergency/#map=12/20.876/-156.68`);
    await ready(page);
    await page.evaluate((value) => HM.setTheme(value), theme);
    for (const target of ['legend', 'canvas', 'outside']) {
      await checkDrag(page, target);
      await checkLegend(page);
    }
    const canvas = await page.locator('#map canvas').boundingBox();
    await page.mouse.move(canvas.x + 100, canvas.y + 100);
    const before = await camera(page);
    await page.mouse.wheel(0, -240);
    await page.waitForFunction((zoom) => {
      const map = HM.maps.find((entry) => entry._hash);
      return !map.isMoving() && map.getZoom() > zoom;
    }, before.zoom);
    await checkDrag(page, 'legend');
    await checkLegend(page);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

try {
  for (const width of [1280, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      for (const theme of ['light', 'dark']) {
        await checkPage(context, theme);
        console.log(`PASS ${width}px ${theme}: canvas, legend, outside and wheel-then-legend drags settle, persist and leave layer controls usable`);
      }
    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
