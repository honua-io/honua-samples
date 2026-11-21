import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { download, fetchJson } from '../state-local/download.mjs';

const realFetch = globalThis.fetch;
const noWait = { wait: async () => {} };
afterEach(() => { globalThis.fetch = realFetch; });

function serve(...replies) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const [status, body] = replies[Math.min(calls.length, replies.length) - 1];
    return new Response(JSON.stringify(body), { status });
  };
  return calls;
}

test('retries a transient HTTP 500 page and returns the later success', async () => {
  const calls = serve([500, {}], [200, { features: [1] }]);
  assert.deepEqual(await fetchJson('https://source.test/query', 1_000, noWait), { features: [1] });
  assert.equal(calls.length, 2);
});

test('retries an ArcGIS error body reported with HTTP 200', async () => {
  const calls = serve([200, { error: { code: 500, message: 'Error performing query operation' } }], [200, { count: 3 }]);
  assert.deepEqual(await fetchJson('https://source.test/query', 1_000, noWait), { count: 3 });
  assert.equal(calls.length, 2);
});

test('gives up after eight attempts', async () => {
  const calls = serve([503, {}]);
  await assert.rejects(download('https://source.test/file', 1_000, noWait), /HTTP 503/);
  assert.equal(calls.length, 8);
});

test('does not retry a client error or a non-transient ArcGIS error', async () => {
  const notFound = serve([404, {}]);
  await assert.rejects(download('https://source.test/file', 1_000, noWait), /HTTP 404/);
  assert.equal(notFound.length, 1);
  const invalid = serve([200, { error: { code: 400, message: 'Invalid query' } }]);
  assert.deepEqual(await fetchJson('https://source.test/query', 1_000, noWait), { error: { code: 400, message: 'Invalid query' } });
  assert.equal(invalid.length, 1);
});
