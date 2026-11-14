import assert from "node:assert/strict";
import test from "node:test";
import { requestAction, createGithubSourceVerifier } from "../lib/gallery-source-smoke.mjs";

const commit = "a".repeat(40);
const sourceUrl = (path) => new URL(`https://github.com/honua-io/honua-samples/${path}`);

function fixture(responses) {
  const requests = [];
  const delays = [];
  const options = [];
  const page = {
    request: { async get(href, requestOptions) {
      options.push(requestOptions);
      requests.push(href);
      const next = responses.shift();
      assert.ok(next, "Unexpected source request");
      return { status: () => next.status ?? 200, ok: () => (next.status ?? 200) === 200,
        headers: () => next.headers ?? {}, json: async () => next.body };
    } },
    waitForTimeout: async (delay) => delays.push(delay),
  };
  return { page, requests, delays, options };
}

test("source checks share the exact-commit Git tree across files and directories", async () => {
  const { page, requests } = fixture([{ body: { tree: [
    { path: "samples/parcel", type: "tree" }, { path: "jobs/query.json", type: "blob" },
  ] } }]);
  const verifySource = createGithubSourceVerifier();
  await verifySource(page, sourceUrl(`tree/${commit}/samples/parcel`));
  await verifySource(page, sourceUrl(`blob/${commit}/jobs/query.json`));
  assert.deepEqual(requests, [`https://api.github.com/repos/honua-io/honua-samples/git/trees/${commit}?recursive=1`]);
});

test("a missing path or wrong Git object type fails", async () => {
  const { page } = fixture([{ body: { tree: [{ path: "samples/parcel", type: "blob" }] } }]);
  const verifySource = createGithubSourceVerifier();
  await assert.rejects(verifySource(page, sourceUrl(`tree/${commit}/samples/parcel`)), /missing/u);
  await assert.rejects(verifySource(page, sourceUrl(`blob/${commit}/jobs/missing.json`)), /missing/u);
});

test("another producer revision gets its own pinned source tree", async () => {
  const { page, requests } = fixture([{ body: { tree: [] } }, { body: { tree: [] } }]);
  const verifySource = createGithubSourceVerifier();
  for (const revision of [commit, "b".repeat(40)]) {
    await assert.rejects(verifySource(page, sourceUrl(`tree/${revision}/samples/missing`)), /missing/u);
  }
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0], requests[1]);
});

test("truncated and malformed source trees cannot pass", async () => {
  for (const body of [{ tree: [], truncated: true }, {}]) {
    const { page } = fixture([{ body }]);
    const verifySource = createGithubSourceVerifier();
    await assert.rejects(verifySource(page, sourceUrl(`tree/${commit}/samples/parcel`)), /Incomplete/u);
  }
});

test("source API errors remain failures", async () => {
  const { page } = fixture([{ status: 404 }]);
  const verifySource = createGithubSourceVerifier();
  await assert.rejects(verifySource(page, sourceUrl(`tree/${commit}/samples/parcel`)), /returned 404/u);
});

test("rate limits respect Retry-After and recover within the bounded retry", async () => {
  const { page, delays, requests } = fixture([{ status: 429, headers: { "retry-after": "3" } }, { status: 200 }]);
  assert.equal((await requestAction(page, "https://gallery.example/")).status(), 200);
  assert.deepEqual(delays, [3000]);
  assert.equal(requests.length, 2);
});

test("persistent or long rate limits return the failure without unbounded waits", async () => {
  const persistent = fixture([{ status: 429 }, { status: 429 }, { status: 429 }]);
  assert.equal((await requestAction(persistent.page, "https://gallery.example/")).status(), 429);
  assert.deepEqual(persistent.delays, [2000, 2000]);
  const long = fixture([{ status: 429, headers: { "retry-after": "60" } }]);
  assert.equal((await requestAction(long.page, "https://gallery.example/")).status(), 429);
  assert.deepEqual(long.delays, []);
});


test("source API authentication is request-scoped and cannot follow redirects", async () => {
  const { page, options } = fixture([{ body: { tree: [{ path: "jobs/query.json", type: "blob" }] } }, { status: 200 }]);
  await createGithubSourceVerifier("test-token")(page, sourceUrl(`blob/${commit}/jobs/query.json`));
  assert.equal(options[0].headers.Authorization, "Bearer test-token");
  assert.equal(options[0].maxRedirects, 0);
  await requestAction(page, "https://gallery.example/");
  assert.equal(options[1].headers, undefined);
});

test("source checks remain usable anonymously without a token", async () => {
  const { page, options } = fixture([{ body: { tree: [{ path: "jobs/query.json", type: "blob" }] } }]);
  await createGithubSourceVerifier("")(page, sourceUrl(`blob/${commit}/jobs/query.json`));
  assert.equal(options[0].headers, undefined);
});
