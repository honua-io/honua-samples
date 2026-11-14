import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import reportHealth from '../../.github/scripts/report-gallery-health.cjs';
import { renderedMapEvidence } from '../lib/gallery-health-map.mjs';

test('loaded source features and basemap pixels cannot substitute for painted application features', () => {
  let rendered = [];
  const map = {
    getCanvas: () => ({ getBoundingClientRect: () => ({ width: 400 }) }),
    getStyle: () => ({ sources: { basemap: { type: 'vector' }, parcels: { type: 'vector' } }, layers: [{ id: 'base', source: 'basemap' }, { id: 'parcels', source: 'parcels' }] }),
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
