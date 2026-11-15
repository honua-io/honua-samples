import path from 'node:path';
import { countLaidOut, MAP_CONTAINER_SELECTOR, renderedMapEvidence, VISIBLE_MAP_SELECTOR } from './gallery-health-map.mjs';

export async function checkGalleryPage(context, entry, { directory, id, timeout = 45_000, linkCache = new Map() }) {
  const page = await context.newPage();
  const errors = [];
  const result = { ...entry, ok: false, errors, screenshot: null };
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.bringToFront();
    const response = await page.goto(entry.url, { waitUntil: 'load', timeout });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
    const mapContainers = await Promise.all(page.frames().map((frame) => frame.evaluate(countLaidOut, VISIBLE_MAP_SELECTOR)));
    const expectsMap = entry.mapRequired ?? mapContainers.some((count) => count > 0);
    result.mapRequired = expectsMap;
    await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, null, { timeout });
    result.firstPaintMs = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null);
    if (result.firstPaintMs === null) throw new Error('No first contentful paint recorded');
    result.maps = await waitForMaps(page, { required: expectsMap, timeout });
    result.redirectedTo = page.url() === entry.url ? null : page.url();
    // Source-only cards can redirect to repository documentation. Verify that
    // destination resolves, without treating the external site's navigation as demo links.
    result.links = new URL(page.url()).origin === new URL(entry.url).origin
      ? await checkLinks(page, context.request, linkCache, result) : 0;
    if (errors.length) throw new Error(`Console/page errors: ${errors.join('; ')}`);
    result.ok = true;
  } catch (error) {
    result.failure = error.message;
    result.screenshot = `${id}.png`;
    await page.screenshot({ path: path.join(directory, result.screenshot), fullPage: true, timeout: 15_000 })
      .catch((failure) => { result.screenshotError = failure.message; });
  } finally { await page.close(); }
  return result;
}

async function waitForMaps(page, { required, timeout }) {
  const deadline = Date.now() + timeout;
  let evidence;
  do {
    evidence = await Promise.all(page.frames().map(async (frame) => {
      const rendered = await frame.evaluate(renderedMapEvidence).catch(() => null);
      if (!rendered) return null;
      return { ...rendered, containers: await frame.evaluate(countLaidOut, MAP_CONTAINER_SELECTOR) };
    }));
    const candidates = evidence.filter(Boolean);
    const maps = candidates.flatMap((frame) => frame.maps);
    const hasFeatures = maps.length ? maps.every((map) => map.features > 0) : candidates.some((frame) => frame.leafletFeatures > 0);
    const hasContainers = candidates.some((frame) => frame.containers > 0);
    if (hasFeatures || (!required && !hasContainers)) return candidates;
    await page.waitForTimeout(250);
  } while (Date.now() < deadline);
  throw new Error(`Map never painted application features: ${JSON.stringify(evidence)}`);
}

async function checkLinks(page, request, cache, result = {}) {
  const links = (await Promise.all(page.frames().map((frame) => frame.locator('a[href]')
    .evaluateAll((nodes) => nodes.map((node) => node.href))))).flat();
  const urls = links.filter((url) => /^https?:/.test(url)).map((url) => { const target = new URL(url); target.hash = ''; return target.href; });
  const broken = [];
  const unverified = [];
  // Bound concurrency so a page with hundreds of source links cannot burst a host.
  const pending = [...new Set(urls)];
  const deadline = Date.now() + 45_000;
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (pending.length) {
      const url = pending.shift();
      const { host, hostname } = new URL(url);
      const slowed = `rate-limit-seen:${host}`;
      if (Date.now() >= deadline) {
        // Time spent waiting out an outside host's rate limit is not a broken link.
        if (cache.has(slowed)) unverified.push(`${url}: link-check deadline exceeded after HTTP 429 from ${host}`);
        else broken.push(`${url}: link-check deadline exceeded`);
        continue;
      }
      // After one persistent outside rate limit, stop requesting that host for the rest of the run.
      const limited = `rate-limited:${host}`;
      if (!cache.has(url)) {
        cache.set(url, cache.has(limited) ? Promise.resolve(`${UNVERIFIED}HTTP 429 (host rate limited)`)
          : resolveLink(request, url, { onRateLimit: () => { if (!FIRST_PARTY(hostname)) cache.set(slowed, true); } }));
      }
      const status = await cache.get(url);
      if (status === `${UNVERIFIED}HTTP 429`) cache.set(limited, true);
      if (status.startsWith(UNVERIFIED)) unverified.push(`${url}: ${status.slice(UNVERIFIED.length)}`);
      else if (status !== 'ok') broken.push(`${url}: ${status}`);
    }
  }));
  if (unverified.length) result.unverifiedLinks = unverified;
  if (broken.length) throw new Error(`Broken links: ${broken.join('; ')}`);
  return [...new Set(urls)].length;
}

// An outside site's rate limit (429) or bot wall (403) says nothing about
// whether the link exists: report it as unverified instead of broken. A 403 or
// 429 from Honua's own hosts stays a failure.
export const UNVERIFIED = 'unverified: ';
const FIRST_PARTY = (hostname) => hostname === 'honua.io' || hostname.endsWith('.honua.io');

function retryDelayMs(response) {
  const header = String(response.headers()['retry-after'] ?? '').trim();
  const seconds = /^\d+$/.test(header) ? Number(header) : 0;
  return seconds > 0 ? Math.min(seconds * 1000, 5_000) : 3_000;
}

export async function resolveLink(request, url, { wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), onRateLimit = () => {} } = {}) {
  try {
    let response = await request.head(url, { timeout: 15_000 });
    if ([403, 404, 405, 501].includes(response.status())) {
      await response.dispose();
      response = await request.get(url, { timeout: 15_000 });
    }
    if (response.status() === 429) {
      onRateLimit();
      const delay = retryDelayMs(response);
      await response.dispose();
      await wait(delay);
      response = await request.get(url, { timeout: 15_000 });
    }
    const code = response.status();
    const status = response.ok() ? 'ok'
      : (code === 429 || code === 403) && !FIRST_PARTY(new URL(url).hostname) ? `${UNVERIFIED}HTTP ${code}`
        : `HTTP ${code}`;
    await response.dispose();
    return status;
  } catch (error) { return error.message; }
}
