import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildStateLocalSite, validateStateLocalLinks } from '../state-local/build-site.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
test('Explorer includes only admitted apps and preserves their build provenance', async () => {
  const siteDir = await mkdtemp(path.join(tmpdir(), 'state-local-site-'));
  try {
    await buildStateLocalSite({ repoRoot, siteDir, cards: [
      { id: 'unverified', detailPath: '/sdk/unverified/', bundleSample: { dataMode: 'fixture' } },
      { id: 'verified', sourceRepo: 'honua-sdk-js', detailPath: '/sdk/verified/', bundleRunnable: true, bundleSample: { dataMode: 'fixture', builtFrom: { commit: 'sdk-revision' } } },
      { id: 'owned', sourceRepo: 'honua-samples', bundleRunnable: true, detailPath: '/owned/', ownApp: { entrypoint: 'demo.html', dataMode: 'live', builtFrom: { commit: 'sample-revision' } } },
    ] });
    const previews = JSON.parse(await readFile(path.join(siteDir, 'state-local/sdk-explorer/previews.json')));
    assert.deepEqual(previews, {
      'sdk-js:verified': { url: '/sdk/verified/app/', dataMode: 'fixture', dataModeLabel: 'fixture mode', commit: 'sdk-revision' },
      'samples:owned': { url: '/owned/app/demo.html', dataMode: 'live', dataModeLabel: 'live mode', commit: 'sample-revision' },
    });
    for (const route of ['property', '311', 'public-works']) {
      const directory = path.join(siteDir, 'state-local', route);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'index.html'), '<main>Published display demo</main>');
    }
    await assert.rejects(validateStateLocalLinks(siteDir), /index.html: \.\.\/county-parcel-viewer\//);
    await writeFile(path.join(siteDir, 'state-local/index.html'), '<img src="missing.png">');
    await assert.rejects(validateStateLocalLinks(siteDir), /index.html: missing.png/);
    await assert.rejects(buildStateLocalSite({ repoRoot, siteDir, cards: [{ id: 'unsafe', bundleRunnable: true, detailPath: '/unsafe/', ownApp: { entrypoint: '../outside.html' } }] }), /Unsafe sample entrypoint/);
  } finally { await rm(siteDir, { recursive: true, force: true }); }
});

test('link validation ignores inline source examples while checking actual markup', async () => {
  const siteDir = await mkdtemp(path.join(tmpdir(), 'state-local-links-'));
  try {
    for (const route of ['', 'switching/', 'sdk-explorer/']) {
      const dir = path.join(siteDir, 'state-local', route);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'index.html'), '<script>const example = `<a href="missing-source.html">`;</script><a href="#main">Main</a>');
    }
    await validateStateLocalLinks(siteDir);
    await writeFile(path.join(siteDir, 'state-local/index.html'), '<script src="missing.js"></script>');
    await assert.rejects(validateStateLocalLinks(siteDir), /missing.js/);
    await writeFile(path.join(siteDir, 'state-local/index.html'), '<a href="missing-page.html">Missing</a>');
    await assert.rejects(validateStateLocalLinks(siteDir), /missing-page.html/);
  } finally { await rm(siteDir, { recursive: true, force: true }); }
});
