import path from 'node:path';
import { countLaidOut, MAP_CONTAINER_SELECTOR, renderedMapEvidence, VISIBLE_MAP_SELECTOR } from './gallery-health-map.mjs';

export async function checkGalleryPage(context, entry, { directory, id, timeout = 45_000, linkCache = createLinkCache() }) {
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
    result.links = 0;
    if (new URL(page.url()).origin === new URL(entry.url).origin) {
      const links = await checkLinkUrls(await pageLinks(page), context.request, { cache: linkCache });
      result.links = links.count;
      if (links.unverified.length) result.unverifiedLinks = links.unverified;
      if (links.broken.length) throw new Error(`Broken links: ${links.broken.join('; ')}`);
    }
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

async function pageLinks(page) {
  const links = (await Promise.all(page.frames().map((frame) => frame.locator('a[href]')
    .evaluateAll((nodes) => nodes.map((node) => node.href))))).flat();
  return [...new Set(links.filter((url) => /^https?:/.test(url))
    .map((url) => { const target = new URL(url); target.hash = ''; return target.href; }))];
}

// One cache for a whole run: each URL is requested once, and an outside host
// that stays rate limited after a retry is not asked again.
export function createLinkCache() {
  return { results: new Map(), stalledHosts: new Set() };
}

function startLookup(request, url, cache, resolve) {
  const entry = { settled: false };
  let delayed = false;
  const onOutsideDelay = () => { delayed = true; };
  const status = cache.stalledHosts.has(new URL(url).host)
    ? Promise.resolve(`${UNVERIFIED}host already rate limited or unreachable in this run`)
    : resolve(request, url, { onOutsideDelay });
  entry.promise = status.then((value) => { entry.settled = true; return { status: value, delayed }; });
  return entry;
}

export async function checkLinkUrls(urls, request, { cache = createLinkCache(), budgetMs = 45_000, resolve = resolveLink } = {}) {
  const outcome = { count: urls.length, broken: [], unverified: [] };
  const deadline = Date.now() + budgetMs;
  // Set when this page waited out an outside rate limit: links it then had no
  // time left for are unverified, not broken.
  let waitedOnOutsideHost = false;
  const lookup = async (url) => {
    const { host, hostname } = new URL(url);
    if (!cache.results.has(url)) cache.results.set(url, startLookup(request, url, cache, resolve));
    const entry = cache.results.get(url);
    // Only a page that actually waited on the delayed request (it was still in
    // flight) is excused; a later page reading the settled result is not.
    const waited = !entry.settled;
    const { status, delayed } = await entry.promise;
    if (waited && delayed && !isHonuaHost(hostname)) waitedOnOutsideHost = true;
    if (stalls(status) && !isHonuaHost(hostname)) cache.stalledHosts.add(host);
    return status;
  };
  const record = (url, status) => {
    if (status.startsWith(UNVERIFIED)) outcome.unverified.push(`${url}: ${status.slice(UNVERIFIED.length)}`);
    else if (status !== 'ok') outcome.broken.push(`${url}: ${status}`);
  };
  const late = [];
  const checkOne = async (url) => {
    if (Date.now() < deadline) record(url, await lookup(url));
    else late.push(url);
  };
  // Bound concurrency so a page with hundreds of source links cannot burst a host.
  const pending = [...urls];
  const worker = async () => { while (pending.length) await checkOne(pending.shift()); };
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
  // Classified only after every in-flight request settled, so a rate limit that
  // was still being waited out when the budget ran out is known here.
  const missed = waitedOnOutsideHost ? `${UNVERIFIED}link-check deadline exceeded after an outside host was rate limited or unreachable` : 'link-check deadline exceeded';
  for (const url of late) record(url, missed);
  return outcome;
}

// An outside site's rate limit (429) or bot wall (403) says nothing about
// whether the link exists: report it as unverified instead of broken. A 403 or
// 429 from Honua's own hosts stays a failure.
export const UNVERIFIED = 'unverified: ';
// A rate limit that outlived its retry, or a reset or timeout: later links to
// that host would only wait out the same answer.
const stalls = (status) => status.startsWith(UNVERIFIED) && (status === `${UNVERIFIED}HTTP 429` || OUTSIDE_TRANSPORT.test(status));
const OUTSIDE_TRANSPORT = /ECONNRESET|ETIMEDOUT|Timeout \d+ms exceeded/;
const isHonuaHost = (hostname) => hostname === 'honua.io' || hostname.endsWith('.honua.io');

function retryDelayMs(response) {
  const header = String(response.headers()['retry-after'] ?? '').trim();
  const seconds = /^\d+$/.test(header) ? Number(header) : 0;
  return seconds > 0 ? Math.min(seconds * 1000, 5_000) : 3_000;
}

export async function resolveLink(request, url, { wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), onOutsideDelay = () => {} } = {}) {
  try {
    let response = await request.head(url, { timeout: 15_000 });
    if ([403, 404, 405, 501].includes(response.status())) {
      await response.dispose();
      response = await request.get(url, { timeout: 15_000 });
    }
    if (response.status() === 429) {
      onOutsideDelay();
      const delay = retryDelayMs(response);
      await response.dispose();
      await wait(delay);
      response = await request.get(url, { timeout: 15_000 });
    }
    const code = response.status();
    const status = response.ok() ? 'ok'
      : (code === 429 || code === 403) && !isHonuaHost(new URL(url).hostname) ? `${UNVERIFIED}HTTP ${code}`
        : `HTTP ${code}`;
    await response.dispose();
    return status;
  } catch (error) {
    // An outside host that resets or times out cloud runners is unreachable from
    // here, not proven gone; a DNS failure (the host does not exist) stays broken.
    if (!OUTSIDE_TRANSPORT.test(error.message) || isHonuaHost(new URL(url).hostname)) return error.message;
    onOutsideDelay();
    return `${UNVERIFIED}${error.message}`;
  }
}
