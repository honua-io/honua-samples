import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startStaticServer } from './lib/browser-lane.mjs';

const routes = process.env.HONUA_MAP_ROUTES?.split(',')
  ?? ['property', '311', 'public-works', 'emergency', 'workbench', 'sdk-explorer'];
const stops = [
  { name: 'Kahului', center: [-156.47, 20.889], zoom: 14 },
  { name: 'Lahaina', center: [-156.68, 20.876], zoom: 14 },
  { name: 'Kihei', center: [-156.45, 20.755], zoom: 14 },
  { name: 'Maui', center: [-156.42, 20.805], zoom: 9 },
];
const output = path.resolve(process.env.HONUA_MAP_REPORT ?? 'artifacts/island-performance');
await mkdir(output, { recursive: true });
const server = process.env.HONUA_GALLERY_URL ? null
  : await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const baseUrl = process.env.HONUA_GALLERY_URL ?? server.url;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

function captureMaps() {
  let kit;
  window.__mapErrors = [];
  Object.defineProperty(window, 'HM', {
    get: () => kit,
    set(value) {
      kit = value;
      const create = value.create;
      value.create = function (...args) {
        const map = create(...args);
        map.on('error', (event) => window.__mapErrors.push(event.error?.message ?? String(event.error)));
        (window.__maps ??= []).push(map);
        return map;
      };
    },
  });
}

async function settle(page) {
  await page.waitForFunction(() => window.__maps?.length
    && window.__maps.every((map) => map.loaded() && map.areTilesLoaded() && !map.isMoving()), null, { timeout: 60000 });
}

async function measureStop(page, stop) {
  return page.evaluate(async (destination) => {
    const map = window.__maps[0];
    let lastFrame = performance.now();
    let maxFrameMs = 0;
    let running = true;
    const longTasks = [];
    const observer = new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)));
    observer.observe({ type: 'longtask' });
    function frame(now) {
      maxFrameMs = Math.max(maxFrameMs, now - lastFrame);
      lastFrame = now;
      if (running) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    const started = performance.now();
    map.easeTo({ center: destination.center, zoom: destination.zoom, duration: 300 });
    while (map.isMoving() || !map.areTilesLoaded() || performance.now() - started < 350) {
      if (performance.now() - started > 30000) throw new Error('Tiles did not settle within 30 seconds');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const tilesLoadedMs = performance.now() - started;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    running = false;
    observer.disconnect();
    return { name: destination.name, tilesLoadedMs, maxFrameMs,
      stallsOver200Ms: longTasks.filter((duration) => duration > 200),
      center: map.getCenter().toArray(), zoom: map.getZoom(), hash: location.hash };
  }, stop);
}

async function checkHash(page) {
  const url = page.url();
  const expected = await page.evaluate(() => window.__maps[0].getCenter().toArray());
  if (!/#\d/.test(url)) throw new Error('Map camera was not saved to the URL hash');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page);
  const actual = await page.evaluate(() => window.__maps[0].getCenter().toArray());
  if (actual.some((coordinate, index) => Math.abs(coordinate - expected[index]) > 0.002)) {
    throw new Error('Reload did not restore the shared map extent');
  }
}

async function measureRoute(route) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const measurements = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(captureMaps);
  try {
    await page.goto(`${baseUrl}/state-local/${route}/`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    for (const stop of stops) measurements.push(await measureStop(page, stop));
    const mapErrors = await page.evaluate(() => window.__mapErrors);
    await page.screenshot({ path: path.join(output, `${route}-island.png`) });
    await checkHash(page);
    return { route, measurements, errors: [...errors, ...mapErrors] };
  } catch (error) {
    return { route, measurements, errors: [...errors, error.message] };
  } finally {
    await page.close();
  }
}

const results = [];
try {
  for (const route of routes) {
    try { results.push(await measureRoute(route)); }
    catch (error) { results.push({ route, errors: [error.message] }); }
    console.log(JSON.stringify(results.at(-1)));
  }
  const report = { measuredAt: new Date().toISOString(), renderer: 'Chromium SwiftShader software GL',
    network: 'Local static Honua tiles; remote street basemap and glyphs; browser cache retained per route',
    targets: { tilesLoadedMs: 1000, mainThreadStallMs: 200 },
    note: 'Tiles-loaded is a readiness proxy, not a pixel-based blank-tile assertion. Includes 300 ms camera animation.', results };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (results.some((result) => result.errors.length || result.measurements?.some((stop) =>
    stop.tilesLoadedMs > 1000 || stop.stallsOver200Ms.length))) process.exitCode = 1;
} finally {
  await browser.close();
  await server?.close();
}
