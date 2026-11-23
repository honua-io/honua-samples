import test from 'node:test';
import assert from 'node:assert/strict';
import { h3Prerequisite, readServerManifest } from '../state-local/analysis-capabilities.mjs';

const server = (analysis) => ({ limits: { analysis } });

test('H3 records only when the server limit matches the configured cell limit', () => {
  assert.deepEqual(h3Prerequisite(server({ h3Available: true, maxH3CellsPerQuery: 100000 }), 100000), { record: true });
  assert.deepEqual(h3Prerequisite(server({ maxH3CellsPerQuery: 500 }), 500), { record: true });
  assert.throws(() => h3Prerequisite(server({ h3Available: true, maxH3CellsPerQuery: 500 }), 100000), /does not match.*500/);
  assert.throws(() => h3Prerequisite({ limits: {} }, 100), /no limits.analysis/);
});

test('a server without h3-pg skips H3 with the reason instead of failing the capture', () => {
  const result = h3Prerequisite(server({ h3Available: false, maxH3CellsPerQuery: 500 }), 100000);
  assert.equal(result.record, false);
  assert.match(result.reason, /h3Available=false/);
});

test('an unreadable manifest names the admin key requirement', async () => {
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://example.org/api/v1/capabilities/manifest');
    assert.equal(options.headers['X-API-Key'], 'harness');
    return new Response('denied', { status: 401 });
  };
  await assert.rejects(readServerManifest('https://example.org/workbench/', { 'X-API-Key': 'harness' }, fetcher), /HTTP 401.*HONUA_ANALYSIS_API_KEY/);
  const ok = async () => new Response(JSON.stringify(server({ maxH3CellsPerQuery: 7 })), { status: 200 });
  assert.equal((await readServerManifest('https://example.org', {}, ok)).limits.analysis.maxH3CellsPerQuery, 7);
});
