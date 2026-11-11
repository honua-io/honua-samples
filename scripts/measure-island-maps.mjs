// Pan/zoom performance gate for the island demo maps. For each full map: Kahului, Lahaina, Kihei, then
// island-wide. Records when each move's tile data arrived, time to tiles loaded, map area still blank 1 s after
// the move starts, animation frame times and main-thread stalls, then checks the camera survives a reload
// through the URL hash.
//
// Env: HONUA_MAP_ROUTES (comma list), HONUA_GALLERY_URL (measure a published site instead of ./site),
// HONUA_MAP_REPORT (output dir), HONUA_MAP_NETWORK=broadband|none, HONUA_MAP_GL=swiftshader|hardware.
// Diagnostics: HONUA_MAP_LOCAL_BASEMAP=<file> answers street-basemap range requests from a local copy of the same
// archive; HONUA_MAP_TRACE=1 writes a Chrome trace per route next to the report.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
const targets = { tilesLoadedMs: 1000, blankTilesAt1s: 0, mainThreadStallMs: 200 };
const blankCheckMs = 1000;
const moveDurationMs = 300;
const settleTimeoutMs = 30000;
const networks = {
  broadband: { offline: false, latency: 20, downloadThroughput: 50e6 / 8, uploadThroughput: 10e6 / 8 },
  none: null,
};
const networkName = process.env.HONUA_MAP_NETWORK ?? 'broadband';
if (!(networkName in networks)) throw new Error(`HONUA_MAP_NETWORK must be one of ${Object.keys(networks).join(', ')}`);
const glMode = process.env.HONUA_MAP_GL ?? 'swiftshader';
const launchArgs = { swiftshader: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  hardware: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] }[glMode];
if (!launchArgs) throw new Error('HONUA_MAP_GL must be swiftshader or hardware');
const tracing = Boolean(process.env.HONUA_MAP_TRACE);
const localBasemap = process.env.HONUA_MAP_LOCAL_BASEMAP ? await readFile(process.env.HONUA_MAP_LOCAL_BASEMAP) : null;

const output = path.resolve(process.env.HONUA_MAP_REPORT ?? 'artifacts/island-performance');
await mkdir(output, { recursive: true });
const server = process.env.HONUA_GALLERY_URL ? null
  : await startStaticServer({ rootDir: path.resolve('site'), port: 0 });
const baseUrl = process.env.HONUA_GALLERY_URL ?? server.url;
const browser = await chromium.launch({ args: launchArgs, headless: glMode !== 'hardware' });

// Init scripts run in the page before its own scripts. This one reports map errors to Node (so they survive the
// hash reload) and finds the full map: the largest kit map that writes its camera to the URL hash.
function installMapCapture() {
  let kit;
  Object.defineProperty(window, 'HM', {
    configurable: true,
    get: () => kit,
    set(value) {
      kit = value;
      const create = value.create;
      value.create = function (...args) {
        const map = create(...args);
        map?.on('error', (event) => window.__reportMapError(event.error?.message ?? String(event.error)));
        return map;
      };
    },
  });
  window.__mainMap = () => {
    const area = (map) => map.getContainer().clientWidth * map.getContainer().clientHeight;
    return (kit?.maps ?? []).filter((map) => map._hash).sort((a, b) => area(b) - area(a))[0];
  };
}

// A tile is blank when it has no data and no loaded ancestor or descendant MapLibre could draw in its place.
function installBlankTileCounter() {
  const covers = (outer, inner) => outer.z < inner.z
    && inner.x >> (inner.z - outer.z) === outer.x && inner.y >> (inner.z - outer.z) === outer.y;
  window.__blankTiles = (map) => Object.entries(map.style.sourceCaches).flatMap(([source, cache]) => {
    const tiles = Object.values(cache._tiles);
    const drawn = tiles.filter((tile) => tile.hasData()).map((tile) => tile.tileID.canonical);
    return tiles.filter((tile) => !tile.hasData())
      .map((tile) => tile.tileID.canonical)
      .filter((id) => !drawn.some((other) => covers(other, id) || covers(id, other)))
      .map((id) => `${source}/${id.z}/${id.x}/${id.y}`);
  });
}

function installFrameSampler() {
  window.__sampleFrames = (map) => {
    const sample = { all: [], moving: [], running: true };
    // Frame times are differences between rAF timestamps; the first callback only sets the baseline.
    let last = null;
    const frame = (now) => {
      if (last !== null) {
        sample.all.push(now - last);
        if (map.isMoving()) sample.moving.push(now - last);
      }
      last = now;
      if (sample.running) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return sample;
  };
}

function installLongTaskObserver() {
  window.__observeLongTasks = () => {
    const durations = [];
    const record = (entries) => durations.push(...entries.map((entry) => entry.duration));
    const observer = new PerformanceObserver((list) => record(list.getEntries()));
    observer.observe({ type: 'longtask' });
    return () => {
      record(observer.takeRecords());
      observer.disconnect();
      return durations;
    };
  };
}

async function settle(page) {
  await page.waitForFunction(() => {
    const map = window.__mainMap();
    return map && window.HM.maps.every((each) => each.loaded() && each.areTilesLoaded() && !each.isMoving());
  }, null, { timeout: 60000 });
}

async function measureStop(page, stop) {
  const raw = await page.evaluate(async ({ destination, blankCheckMs, moveDurationMs, settleTimeoutMs }) => {
    const map = window.__mainMap();
    const stopLongTasks = window.__observeLongTasks();
    const frames = window.__sampleFrames(map);
    performance.setResourceTimingBufferSize(10000);
    performance.clearResourceTimings();
    const started = performance.now();
    let blankAt1s = null;
    map.easeTo({ center: destination.center, zoom: destination.zoom, duration: moveDurationMs });
    while (map.isMoving() || !map.areTilesLoaded() || performance.now() - started < moveDurationMs + 50) {
      const elapsed = performance.now() - started;
      if (blankAt1s === null && elapsed >= blankCheckMs) blankAt1s = window.__blankTiles(map);
      if (elapsed > settleTimeoutMs) throw new Error(`${destination.name}: tiles did not settle within ${settleTimeoutMs} ms`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const tilesLoadedMs = performance.now() - started;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    frames.running = false;
    const tileFetches = performance.getEntriesByType('resource')
      .filter((entry) => /\.pmtiles(\?|$)|\/tiles\/pmtiles\//.test(entry.name) && entry.startTime >= started);
    return { tilesLoadedMs, blankAt1s: blankAt1s ?? [], frames, longTasks: stopLongTasks(),
      tileRequests: tileFetches.length, tileDataReadyMs: Math.max(0, ...tileFetches.map((entry) => entry.responseEnd - started)) };
  }, { destination: stop, blankCheckMs, moveDurationMs, settleTimeoutMs });
  return summarizeStop(stop.name, raw);
}

function summarizeStop(name, raw) {
  const round = (value) => Math.round(value * 10) / 10;
  const percentile = (values, fraction) => {
    const sorted = [...values].sort((a, b) => a - b);
    return round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0);
  };
  return { name, tileRequests: raw.tileRequests, tileDataReadyMs: round(raw.tileDataReadyMs),
    tilesLoadedMs: round(raw.tilesLoadedMs), blankTilesAt1s: raw.blankAt1s.length, blankTileSample: raw.blankAt1s.slice(0, 5),
    animationFrames: raw.frames.moving.length, animationP95FrameMs: percentile(raw.frames.moving, 0.95),
    maxFrameMs: percentile(raw.frames.all, 1),
    stalls: raw.longTasks.filter((duration) => duration > targets.mainThreadStallMs).map(round) };
}

async function checkHash(page) {
  const expected = await page.evaluate(() => window.__mainMap().getCenter().toArray());
  if (!/[#&]map=\d+(\.\d+)?\/-?\d/.test(page.url())) throw new Error(`Map camera was not saved to the URL hash (${new URL(page.url()).hash || 'no hash'})`);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page);
  const actual = await page.evaluate(() => window.__mainMap().getCenter().toArray());
  if (actual.some((coordinate, index) => Math.abs(coordinate - expected[index]) > 0.002)) {
    throw new Error('Reload did not restore the shared map extent');
  }
  return new URL(page.url()).hash;
}

async function serveLocalBasemap(page, hits) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range, etag', etag: '"local-basemap"' };
  await page.route('**/tiles/pmtiles/maui-basemap', (route) => {
    hits.count += 1;
    const match = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
    if (!match) return route.fulfill({ status: 200, body: localBasemap, headers: cors });
    const start = Number(match[1]);
    if (start >= localBasemap.length) return route.fulfill({ status: 416, headers: { ...cors, 'content-range': `bytes */${localBasemap.length}` } });
    const end = Math.min(Number(match[2] || localBasemap.length - 1), localBasemap.length - 1);
    return route.fulfill({ status: 206, body: localBasemap.subarray(start, end + 1),
      headers: { ...cors, 'content-range': `bytes ${start}-${end}/${localBasemap.length}`, 'accept-ranges': 'bytes' } });
  });
}

async function measureMap(page, route) {
  const response = await page.goto(`${baseUrl}/state-local/${route}/`, { waitUntil: 'domcontentloaded' });
  if (!response?.ok()) throw new Error(`Route not built or not served (HTTP ${response?.status()})`);
  await settle(page);
  const firstView = await page.evaluate(() => {
    const gl = window.__mainMap().painter.context.gl;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return { ms: performance.now(), renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  const measurements = [];
  for (const stop of stops) measurements.push(await measureStop(page, stop));
  await page.screenshot({ path: path.join(output, `${route}-island.png`) });
  const hash = await checkHash(page);
  return { renderer: firstView.renderer, firstViewMs: Math.round(firstView.ms), hash, measurements };
}

async function measureRoute(route) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const localBasemapHits = { count: 0 };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.exposeFunction('__reportMapError', (message) => errors.push(message));
  for (const probe of [installMapCapture, installBlankTileCounter, installFrameSampler, installLongTaskObserver]) {
    await page.addInitScript(probe);
  }
  try {
    if (localBasemap) await serveLocalBasemap(page, localBasemapHits);
    if (tracing) await browser.startTracing(page, { path: path.join(output, `${route}-trace.json`), screenshots: false });
    if (networks[networkName]) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', networks[networkName]);
    }
    const result = await measureMap(page, route);
    return { route, ...result, ...(localBasemap && { localBasemapHits: localBasemapHits.count }), errors };
  } catch (error) {
    return { route, measurements: [], errors: [...errors, error.message] };
  } finally {
    if (tracing) await browser.stopTracing().catch(() => {});
    await context.close();
  }
}

const failsTarget = (stop) => stop.tilesLoadedMs > targets.tilesLoadedMs
  || stop.blankTilesAt1s > targets.blankTilesAt1s || stop.stalls.length > 0;

function describeNetwork() {
  const conditions = networks[networkName];
  const tiles = process.env.HONUA_GALLERY_URL ? `Honua tiles from ${baseUrl}` : 'Honua tiles from the local static site';
  const basemap = localBasemap
    ? 'street basemap from a local copy (diagnostic: Playwright routing disables the HTTP cache for every request and bypasses throttling for the basemap)'
    : 'street basemap and glyphs from their public hosts';
  const emulation = conditions
    ? `${networkName} emulation (${conditions.downloadThroughput * 8 / 1e6}/${conditions.uploadThroughput * 8 / 1e6} Mbit/s, ${conditions.latency} ms)`
    : 'no network emulation';
  return `${emulation}; ${tiles}; ${basemap}`;
}

function markdown(report) {
  const lines = [`# Island map performance (${report.measuredAt})`, '',
    `Renderer: ${report.renderer}. Network: ${report.network}.`, '',
    `Targets: tiles loaded <= ${targets.tilesLoadedMs} ms, no blank tile ${blankCheckMs} ms after the move starts,`
      + ` no main-thread task > ${targets.mainThreadStallMs} ms. "Tile data in" is when the move's last tile response arrived`
      + ' (network only); "Tiles loaded" adds decoding and rendering.', '',
    '| Route | First view (ms) | Stop | Tile requests | Tile data in (ms) | Tiles loaded (ms)'
      + ` | Blank at ${blankCheckMs / 1000} s | Animation p95 frame (ms) | Max frame (ms)`
      + ` | Tasks > ${targets.mainThreadStallMs} ms | Pass |`,
    '|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|'];
  for (const result of report.results) {
    for (const stop of result.measurements) {
      lines.push(`| ${result.route} | ${result.firstViewMs} | ${stop.name} | ${stop.tileRequests} | ${stop.tileDataReadyMs}`
        + ` | ${stop.tilesLoadedMs} | ${stop.blankTilesAt1s} | ${stop.animationP95FrameMs} | ${stop.maxFrameMs}`
        + ` | ${stop.stalls.length} | ${failsTarget(stop) ? 'no' : 'yes'} |`);
    }
    if (result.errors.length) lines.push(`| ${result.route} | | error: ${result.errors.join('; ').replaceAll('|', '/')} | | | | | | | | no |`);
  }
  return `${lines.join('\n')}\n\n${report.note}\n`;
}

const results = [];
try {
  for (const route of routes) {
    results.push(await measureRoute(route));
    console.log(JSON.stringify(results.at(-1)));
  }
  const renderers = [...new Set(results.map((result) => result.renderer).filter(Boolean))];
  const report = { measuredAt: new Date().toISOString(), renderer: renderers.join(', ') || glMode,
    network: describeNetwork(), targets,
    note: 'One browser context per route. "First view" runs from navigation start to the opening view fully loaded (the cold-cache'
      + ' number); the stops then reuse that context, and Kahului starts next to the opening view. Stop times include the'
      + ` ${moveDurationMs} ms camera animation. "Blank at ${blankCheckMs / 1000} s" may count a still-loading retained`
      + ' parent alongside its empty child, and treats a tile with one loaded child as covered, so it can over-count and'
      + ' can miss a tile only partly drawn by its children. Software GL (SwiftShader) times are an upper bound for a'
      + ' machine with a GPU.',
    results };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(output, 'report.md'), markdown(report));
  if (results.some((result) => result.errors.length || result.measurements.some(failsTarget))) process.exitCode = 1;
} finally {
  await browser.close();
  await server?.close();
}
