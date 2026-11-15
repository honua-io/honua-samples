import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import reportHealth from '../../.github/scripts/report-gallery-health.cjs';
import { checkLinkUrls, createLinkCache, resolveLink, UNVERIFIED } from '../lib/gallery-health-check.mjs';
import { countLaidOut, MAP_CONTAINER_SELECTOR, renderedMapEvidence } from '../lib/gallery-health-map.mjs';

test('loaded source features and basemap pixels cannot substitute for painted application features', () => {
  let rendered = [];
  const map = {
    basemapLayers: ['waterbodies'],
    getCanvas: () => ({ getBoundingClientRect: () => ({ width: 400 }) }),
    getStyle: () => ({ sources: { basemap: { type: 'vector' }, waterbodies: { type: 'geojson' }, parcels: { type: 'vector' } }, layers: [{ id: 'base', source: 'basemap' }, { id: 'waterbodies', source: 'waterbodies' }, { id: 'parcels', source: 'parcels' }] }),
    querySourceFeatures: () => [{ id: 'loaded-but-not-painted' }],
    queryRenderedFeatures: ({ layers }) => { assert.deepEqual(layers, ['parcels']); return rendered; },
  };
  globalThis.window = { __galleryHealthMaps: [map] };
  globalThis.document = { querySelectorAll: () => [] };
  try {
    assert.equal(renderedMapEvidence().painted, false);
    rendered = [{ id: 'visible-feature' }];
    assert.equal(renderedMapEvidence().painted, true);
  } finally { delete globalThis.window; delete globalThis.document; }
});

test('a hidden map canvas does not count as a container that must paint', () => {
  const hidden = { getBoundingClientRect: () => ({ width: 0, height: 0 }) };
  const visible = { getBoundingClientRect: () => ({ width: 320, height: 280 }) };
  const hiddenMap = {
    getCanvas: () => ({ getBoundingClientRect: () => ({ width: 0, height: 0 }) }),
    getStyle: () => ({ sources: { parcels: { type: 'geojson' } }, layers: [{ id: 'parcels', source: 'parcels' }] }),
    queryRenderedFeatures: () => [{ id: 'hidden-feature' }],
  };
  const install = (nodes) => {
    globalThis.window = { __galleryHealthMaps: [hiddenMap] };
    globalThis.document = {
      querySelectorAll: (selector) => (selector.startsWith('.leaflet-overlay') ? [] : nodes),
    };
  };
  try {
    install([hidden, visible]);
    assert.equal(countLaidOut(MAP_CONTAINER_SELECTOR), 1);
    assert.deepEqual(renderedMapEvidence().maps, []);
    assert.equal(renderedMapEvidence().painted, false);
    install([hidden]);
    assert.equal(countLaidOut(MAP_CONTAINER_SELECTOR), 0);
    assert.deepEqual(renderedMapEvidence().maps, []);
    assert.equal(renderedMapEvidence().painted, false);
  } finally { delete globalThis.window; delete globalThis.document; }
});

test('functions sent into the page do not call module helpers', () => {
  const hidden = { getBoundingClientRect: () => ({ width: 0, height: 0 }) };
  const visible = { getBoundingClientRect: () => ({ width: 320, height: 280 }) };
  globalThis.document = {
    querySelectorAll: (selector) => (selector.startsWith('.leaflet-overlay') ? [] : [hidden, visible]),
  };
  globalThis.window = { __galleryHealthMaps: [] };
  try {
    const count = new Function(`return (${countLaidOut})`)();
    assert.equal(count(MAP_CONTAINER_SELECTOR), 1);
    const evidence = new Function(`return (${renderedMapEvidence})`)();
    assert.equal(evidence().painted, false);
    assert.equal('containers' in evidence(), false);
  } finally { delete globalThis.window; delete globalThis.document; }
});

test('nightly reporter reuses one issue, closes on recovery and reopens on incomplete runs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gallery-health-issue-'));
  const original = process.cwd();
  const issues = [];
  const github = {
    paginate: async () => issues,
    rest: { issues: {
      listForRepo() {}, createLabel: async () => {},
      create: async (issue) => { issues.push({ ...issue, number: 7, state: 'open' }); },
      update: async (update) => { Object.assign(issues[0], update); },
    } },
  };
  const context = { repo: { owner: 'example', repo: 'samples' }, serverUrl: 'https://github.com', runId: 42 };
  try {
    process.chdir(directory);
    await mkdir('.artifacts/gallery-health', { recursive: true });
    const result = async (ok) => {
      await writeFile('.artifacts/gallery-health/latest.json', JSON.stringify({ ok }));
      await writeFile('.artifacts/gallery-health/latest.md', ok ? 'PASS' : 'FAIL');
      await reportHealth({ github, context });
    };
    await result(true);
    assert.equal(issues.length, 0, 'a healthy first run does not create an alert');
    await result(false);
    await result(false);
    assert.equal(issues.length, 1);
    assert.match(issues[0].body, /actions\/runs\/42/);
    await result(true);
    assert.equal(issues[0].state, 'closed');
    await rm('.artifacts/gallery-health/latest.json');
    await reportHealth({ github, context });
    assert.equal(issues[0].state, 'open');
    assert.match(issues[0].body, /runner did not finish/);
    assert.ok(issues[0].body.includes('\n'), 'issue body uses readable Markdown lines');
    assert.equal(issues.length, 1);
  } finally {
    process.chdir(original);
    await rm(directory, { recursive: true, force: true });
  }
});

for (const headStatus of [403, 404, 405, 501]) {
  for (const getStatus of [200, 404, 500]) {
    test(`link check resolves HEAD ${headStatus} through GET ${getStatus}`, async () => {
      const calls = [];
      const response = (status, method) => ({
        status: () => status, ok: () => status === 200,
        dispose: async () => calls.push(`dispose ${method}`),
      });
      const request = {
        head: async () => { calls.push('HEAD'); return response(headStatus, 'HEAD'); },
        get: async () => { calls.push('GET'); return response(getStatus, 'GET'); },
      };
      assert.equal(await resolveLink(request, 'https://example.org/download'), getStatus === 200 ? 'ok' : `HTTP ${getStatus}`);
      assert.deepEqual(calls, ['HEAD', 'dispose HEAD', 'GET', 'dispose GET']);
    });
  }
}

for (const status of [200, 401, 500]) {
  test(`link check preserves HEAD ${status} without a GET retry`, async () => {
    const request = {
      head: async () => ({ status: () => status, ok: () => status === 200, dispose: async () => {} }),
      get: async () => assert.fail('unexpected GET retry'),
    };
    assert.equal(await resolveLink(request, 'https://example.org/download'), status === 200 ? 'ok' : `HTTP ${status}`);
  });
}

const stubResponse = (status, headers = {}) => ({ status: () => status, ok: () => status === 200, headers: () => headers, dispose: async () => {} });

test('an outside bot wall (403 on HEAD and GET) is unverified, not broken', async () => {
  const request = { head: async () => stubResponse(403), get: async () => stubResponse(403) };
  assert.equal(await resolveLink(request, 'https://www.npmjs.com/package/x'), `${UNVERIFIED}HTTP 403`);
});

test('a 403 or 429 from a Honua host stays a broken link', async () => {
  for (const url of ['https://honua.io/demo.html', 'https://samples.honua.io/x/']) {
    for (const code of [403, 429]) {
      const request = { head: async () => stubResponse(code), get: async () => stubResponse(code) };
      assert.equal(await resolveLink(request, url, { wait: async () => {} }), `HTTP ${code}`);
    }
  }
});

test('a blank or zero Retry-After uses the default delay and reports the rate limit', async () => {
  for (const value of ['', '0', 'soon']) {
    const waits = [];
    let seen = 0;
    const request = { head: async () => stubResponse(429, { 'retry-after': value }), get: async () => stubResponse(200) };
    assert.equal(await resolveLink(request, 'https://github.com/o/r', { wait: async (ms) => waits.push(ms), onOutsideDelay: () => seen++ }), 'ok');
    assert.deepEqual(waits, [3_000]);
    assert.equal(seen, 1);
  }
});

test('a rate limit waits for Retry-After (capped) and retries once with GET', async () => {
  const waits = [];
  let gets = 0;
  const request = { head: async () => stubResponse(429, { 'retry-after': '120' }), get: async () => stubResponse(++gets === 1 ? 200 : 500) };
  assert.equal(await resolveLink(request, 'https://github.com/o/r/blob/x', { wait: async (ms) => waits.push(ms) }), 'ok');
  assert.deepEqual(waits, [5_000]);
});

test('a rate limit that persists is unverified, and a 404 after the wait is broken', async () => {
  const wait = async () => {};
  assert.equal(await resolveLink({ head: async () => stubResponse(429), get: async () => stubResponse(429) }, 'https://github.com/o/r', { wait }), `${UNVERIFIED}HTTP 429`);
  assert.equal(await resolveLink({ head: async () => stubResponse(429), get: async () => stubResponse(404) }, 'https://github.com/o/r', { wait }), 'HTTP 404');
});

test('GET transport errors remain link failures', async () => {
  const request = {
    head: async () => ({ status: () => 404, dispose: async () => {} }),
    get: async () => { throw new Error('connection refused'); },
  };
  assert.equal(await resolveLink(request, 'https://example.org/download'), 'connection refused');
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const slowRateLimited = async (_request, url, { onOutsideDelay }) => {
  if (url.includes('github.com') || url.includes('honua.io')) { onOutsideDelay(); await sleep(40); }
  return 'ok';
};
const deadlineUrls = [1, 2, 3, 4].map((n) => `https://github.com/o/r/${n}`).concat(['https://www.npmjs.com/a', 'https://docs.example.org/b']);

test('links left after an outside rate-limit wait on the page are unverified, not broken', async () => {
  const links = await checkLinkUrls(deadlineUrls, null, { budgetMs: 10, resolve: slowRateLimited });
  assert.deepEqual(links.broken, []);
  assert.equal(links.unverified.length, 2);
  assert.match(links.unverified[0], /npmjs.*deadline exceeded after an outside host was rate limited or unreachable/);
});

test('a missed deadline stays broken when the page saw no outside rate limit', async () => {
  const slow = async () => { await sleep(40); return 'ok'; };
  const links = await checkLinkUrls(deadlineUrls, null, { budgetMs: 10, resolve: slow });
  assert.equal(links.broken.length, 2);
  assert.deepEqual(links.unverified, []);
});

test('a Honua host rate limit does not excuse a missed deadline', async () => {
  const urls = [1, 2, 3, 4].map((n) => `https://samples.honua.io/${n}`).concat(['https://www.npmjs.com/a']);
  const links = await checkLinkUrls(urls, null, { budgetMs: 10, resolve: slowRateLimited });
  assert.equal(links.broken.length, 1);
});

test('the rate-limit excuse does not carry over to a later page', async () => {
  const cache = createLinkCache();
  await checkLinkUrls(deadlineUrls, null, { cache, budgetMs: 10, resolve: slowRateLimited });
  const slow = async () => { await sleep(40); return 'ok'; };
  const later = [1, 2, 3, 4, 5].map((n) => `https://docs.example.org/later/${n}`);
  const links = await checkLinkUrls(later, null, { cache, budgetMs: 10, resolve: slow });
  assert.equal(links.broken.length, 1);
});

test('an outside host that stays rate limited is not requested again', async () => {
  const cache = createLinkCache();
  let calls = 0;
  const limited = async () => { calls++; return `${UNVERIFIED}HTTP 429`; };
  await checkLinkUrls(['https://github.com/o/r/1'], null, { cache, resolve: limited });
  const links = await checkLinkUrls(['https://github.com/o/r/2', 'https://github.com/o/r/3'], null, { cache, resolve: limited });
  assert.equal(calls, 1);
  assert.equal(links.unverified.length, 2);
  assert.deepEqual(links.broken, []);
});

test('an outside host that resets or times out is unverified; DNS failures and Honua hosts stay broken', async () => {
  const failing = (message) => ({ head: async () => { throw new Error(message); }, get: async () => assert.fail('unexpected GET') });
  assert.equal(await resolveLink(failing('apiRequestContext.head: read ECONNRESET'), 'https://msc.fema.gov/portal/home'), `${UNVERIFIED}apiRequestContext.head: read ECONNRESET`);
  assert.equal(await resolveLink(failing('apiRequestContext.head: Timeout 15000ms exceeded.'), 'https://example.org/x'), `${UNVERIFIED}apiRequestContext.head: Timeout 15000ms exceeded.`);
  assert.equal(await resolveLink(failing('getaddrinfo ENOTFOUND gone.example.org'), 'https://gone.example.org/'), 'getaddrinfo ENOTFOUND gone.example.org');
  assert.equal(await resolveLink(failing('read ECONNRESET'), 'https://samples.honua.io/x/'), 'read ECONNRESET');
});

test('a page that waits on another page\'s rate-limited request is excused too', async () => {
  const cache = createLinkCache();
  const shared = [1, 2, 3, 4].map((n) => `https://github.com/o/r/${n}`);
  const first = checkLinkUrls(shared, null, { cache, budgetMs: 10, resolve: slowRateLimited });
  const second = checkLinkUrls(shared.concat(['https://www.npmjs.com/a']), null, { cache, budgetMs: 10, resolve: slowRateLimited });
  const [, links] = await Promise.all([first, second]);
  assert.deepEqual(links.broken, []);
  assert.equal(links.unverified.length, 1);
});

test('links that miss the budget while an outside rate limit is still being waited out are unverified', async () => {
  const resolve = async (_request, url, { onOutsideDelay }) => {
    if (url.includes('github.com')) { onOutsideDelay(); await sleep(60); }
    else await sleep(20);
    return 'ok';
  };
  const urls = ['https://github.com/o/r/1', 'https://docs.example.org/1', 'https://docs.example.org/2', 'https://docs.example.org/3',
    'https://docs.example.org/4', 'https://docs.example.org/5'];
  const links = await checkLinkUrls(urls, null, { budgetMs: 10, resolve });
  assert.deepEqual(links.broken, []);
  assert.equal(links.unverified.length, 2);
});

test('an outside timeout excuses the late links and short-circuits its host', async () => {
  let calls = 0;
  const resolve = async (request, url, options) => {
    if (!url.includes('fema')) return 'ok';
    calls++;
    await sleep(30);
    return resolveLink({ head: async () => { throw new Error('apiRequestContext.head: Timeout 15000ms exceeded.'); } }, url, options);
  };
  const cache = createLinkCache();
  const urls = [1, 2, 3, 4, 5, 6].map((n) => `https://msc.fema.gov/${n}`);
  const links = await checkLinkUrls(urls, null, { cache, budgetMs: 10, resolve });
  assert.deepEqual(links.broken, []);
  assert.equal(links.unverified.length, 6);
  await checkLinkUrls(['https://msc.fema.gov/7'], null, { cache, resolve });
  assert.equal(calls, 4);
});

test('a Honua host that resets is not short-circuited: its later 404 stays broken', async () => {
  const cache = createLinkCache();
  const resolve = async (_request, url) => url.endsWith('/1') ? 'read ECONNRESET' : 'HTTP 404';
  await checkLinkUrls(['https://samples.honua.io/1'], null, { cache, resolve });
  const links = await checkLinkUrls(['https://samples.honua.io/2'], null, { cache, resolve });
  assert.deepEqual(links.broken, ['https://samples.honua.io/2: HTTP 404']);
});

test('a later page reading a settled delayed result is not excused', async () => {
  const cache = createLinkCache();
  await checkLinkUrls(['https://github.com/o/r/1'], null, { cache, budgetMs: 1000, resolve: slowRateLimited });
  const slow = async () => { await sleep(40); return 'ok'; };
  const later = ['https://github.com/o/r/1', 'https://docs.example.org/a', 'https://docs.example.org/b', 'https://docs.example.org/c',
    'https://docs.example.org/d', 'https://docs.example.org/e'];
  const links = await checkLinkUrls(later, null, { cache, budgetMs: 10, resolve: slow });
  // The cached link frees its worker at once, so four fresh links start and one misses the budget.
  assert.deepEqual(links.broken, ['https://docs.example.org/e: link-check deadline exceeded']);
  assert.deepEqual(links.unverified, []);
});
