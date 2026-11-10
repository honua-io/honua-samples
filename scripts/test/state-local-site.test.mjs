import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
      'sdk-js:verified': { url: '/sdk/verified/app/', dataMode: 'fixture', commit: 'sdk-revision' },
      'samples:owned': { url: '/owned/app/demo.html', dataMode: 'live', commit: 'sample-revision' },
    });
    await assert.rejects(validateStateLocalLinks(siteDir), /index.html: \.\.\/county-parcel-viewer\//);
    await writeFile(path.join(siteDir, 'state-local/index.html'), '<img src="missing.png">');
    await assert.rejects(validateStateLocalLinks(siteDir), /index.html: missing.png/);
    await assert.rejects(buildStateLocalSite({ repoRoot, siteDir, cards: [{ id: 'unsafe', bundleRunnable: true, detailPath: '/unsafe/', ownApp: { entrypoint: '../outside.html' } }] }), /Unsafe sample entrypoint/);
  } finally { await rm(siteDir, { recursive: true, force: true }); }
});
