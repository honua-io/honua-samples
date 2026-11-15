import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import reportHealth from '../../.github/scripts/report-gallery-health.cjs';
import { resolveLink } from '../lib/gallery-health-check.mjs';
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

for (const headStatus of [404, 405, 501]) {
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

for (const status of [200, 401, 403, 429, 500]) {
  test(`link check preserves HEAD ${status} without a GET retry`, async () => {
    const request = {
      head: async () => ({ status: () => status, ok: () => status === 200, dispose: async () => {} }),
      get: async () => assert.fail('unexpected GET retry'),
    };
    assert.equal(await resolveLink(request, 'https://example.org/download'), status === 200 ? 'ok' : `HTTP ${status}`);
  });
}

test('GET transport errors remain link failures', async () => {
  const request = {
    head: async () => ({ status: () => 404, dispose: async () => {} }),
    get: async () => { throw new Error('connection refused'); },
  };
  assert.equal(await resolveLink(request, 'https://example.org/download'), 'connection refused');
});
