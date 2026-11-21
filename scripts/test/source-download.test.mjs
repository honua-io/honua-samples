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

test('gives up after eight attempts with capped backoff', async () => {
  const calls = serve([503, {}]);
  const delays = [];
  await assert.rejects(download('https://source.test/file', 1_000, { wait: async (ms) => { delays.push(ms); } }), /HTTP 503/);
  assert.equal(calls.length, 8);
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 8000, 8000, 8000]);
});

test('retries a network failure', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return new Response('{"ok":true}');
  };
  assert.deepEqual(await fetchJson('https://source.test/query', 1_000, noWait), { ok: true });
  assert.equal(calls, 2);
});

test('does not retry a client error', async () => {
  const notFound = serve([404, {}]);
  await assert.rejects(download('https://source.test/file', 1_000, noWait), /HTTP 404/);
  assert.equal(notFound.length, 1);
});

test('returns a non-transient ArcGIS error body without retrying', async () => {
  const invalid = serve([200, { error: { code: 400, message: 'Invalid query' } }]);
  assert.deepEqual(await fetchJson('https://source.test/query', 1_000, noWait), { error: { code: 400, message: 'Invalid query' } });
  assert.equal(invalid.length, 1);
});
