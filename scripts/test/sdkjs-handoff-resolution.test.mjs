import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";

import {
  DEFAULT_FIXTURE_SNAPSHOT_PATH,
  DEFAULT_FIXTURE_V4_SNAPSHOT_PATH,
  DEFAULT_HANDOFF_SNAPSHOT_PATH,
  DEFAULT_HANDOFF_V2_SNAPSHOT_PATH,
  loadSdkJsHandoff,
} from "../lib/sdkjs-handoff.mjs";

const producerText = (text) => text.replaceAll("\r\n", "\n");
const nextHandoffText = producerText(await readFile(DEFAULT_HANDOFF_V2_SNAPSHOT_PATH, "utf8"));
const nextFixtureText = producerText(await readFile(DEFAULT_FIXTURE_V4_SNAPSHOT_PATH, "utf8"));
const legacyHandoffText = producerText(await readFile(DEFAULT_HANDOFF_SNAPSHOT_PATH, "utf8"));
const legacyFixtureText = producerText(await readFile(DEFAULT_FIXTURE_SNAPSHOT_PATH, "utf8"));
const parsedNextHandoff = JSON.parse(nextHandoffText);
const FRESH_NOW = new Date(
  Math.max(...parsedNextHandoff.qualifiedJourneys.map((journey) => Date.parse(journey.visualEvidence.observedAt))) + 1,
);

const URLS = Object.freeze({
  nextHandoff: "https://producer.test/handoff.v2.json",
  nextFixture: "https://producer.test/fixture.v4.json",
  legacyHandoff: "https://producer.test/handoff.v1.json",
  legacyFixture: "https://producer.test/fixture.v3.json",
});

function fetcher(responses, calls) {
  return async (url) => {
    calls.push(url);
    const response = responses.get(url);
    if (response instanceof Error) throw response;
    if (typeof response !== "string") throw new Error(`unavailable ${url}`);
    return response;
  };
}

function options(fetchTextFn, overrides = {}) {
  return {
    nextHandoffUrl: URLS.nextHandoff,
    nextFixtureUrl: URLS.nextFixture,
    handoffUrl: URLS.legacyHandoff,
    fixtureUrl: URLS.legacyFixture,
    now: FRESH_NOW,
    refreshSnapshot: false,
    fetchTextFn,
    ...overrides,
  };
}

test("resolution prefers the admitted next live pair and does not touch fallbacks", async () => {
  const calls = [];
  const result = await loadSdkJsHandoff(
    options(
      fetcher(
        new Map([
          [URLS.nextHandoff, nextHandoffText],
          [URLS.nextFixture, nextFixtureText],
        ]),
        calls,
      ),
    ),
  );
  assert.equal(result.contract, "v2/v4");
  assert.match(result.source, /^next live fetch/);
  assert.deepEqual(calls.sort(), [URLS.nextFixture, URLS.nextHandoff].sort());
});

test("resolution falls from unavailable next live to the admitted next snapshot before legacy live", async () => {
  const calls = [];
  const result = await loadSdkJsHandoff(options(fetcher(new Map(), calls)));
  assert.equal(result.contract, "v2/v4");
  assert.match(result.source, /^next committed snapshot/);
  assert.deepEqual(calls.sort(), [URLS.nextFixture, URLS.nextHandoff].sort());
});

test("resolution reaches legacy live only when both next sources are unavailable", async (t) => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "sdkjs-handoff-resolution-"));
  t.after(() => rm(workDir, { recursive: true, force: true }));
  const calls = [];
  const result = await loadSdkJsHandoff(
    options(
      fetcher(
        new Map([
          [URLS.legacyHandoff, legacyHandoffText],
          [URLS.legacyFixture, legacyFixtureText],
        ]),
        calls,
      ),
      {
        nextSnapshotPath: path.join(workDir, "missing-next-handoff.json"),
        nextFixtureSnapshotPath: path.join(workDir, "missing-next-fixture.json"),
      },
    ),
  );
  assert.equal(result.contract, "v1/v3");
  assert.match(result.source, /^legacy live fetch/);
  assert.deepEqual(
    calls.sort(),
    [URLS.nextFixture, URLS.nextHandoff, URLS.legacyFixture, URLS.legacyHandoff].sort(),
  );
});

test("resolution reaches the legacy snapshot last", async (t) => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "sdkjs-handoff-resolution-"));
  t.after(() => rm(workDir, { recursive: true, force: true }));
  const snapshotPath = path.join(workDir, "handoff.v1.json");
  const fixtureSnapshotPath = path.join(workDir, "fixture.v3.json");
  await writeFile(snapshotPath, legacyHandoffText);
  await writeFile(fixtureSnapshotPath, legacyFixtureText);
  const result = await loadSdkJsHandoff(
    options(fetcher(new Map(), []), {
      nextSnapshotPath: path.join(workDir, "missing-next-handoff.json"),
      nextFixtureSnapshotPath: path.join(workDir, "missing-next-fixture.json"),
      snapshotPath,
      fixtureSnapshotPath,
    }),
  );
  assert.equal(result.contract, "v1/v3");
  assert.match(result.source, /^legacy committed snapshot/);
});

test("a present-invalid next live pair fails closed without reading any fallback", async () => {
  const calls = [];
  const tampered = nextHandoffText.replace("Safe Agent Workbench", "Safe Agent Workshop");
  await assert.rejects(
    loadSdkJsHandoff(
      options(
        fetcher(
          new Map([
            [URLS.nextHandoff, tampered],
            [URLS.nextFixture, nextFixtureText],
            [URLS.legacyHandoff, legacyHandoffText],
            [URLS.legacyFixture, legacyFixtureText],
          ]),
          calls,
        ),
      ),
    ),
    (error) => error.code === "SDKJS_NEXT_PRESENT_INVALID" && /refusing fallback/.test(error.message),
  );
  assert.deepEqual(calls.sort(), [URLS.nextFixture, URLS.nextHandoff].sort());
});

test("a present-invalid next snapshot fails closed without fetching legacy live", async (t) => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "sdkjs-handoff-resolution-"));
  t.after(() => rm(workDir, { recursive: true, force: true }));
  const nextSnapshotPath = path.join(workDir, "handoff.v2.json");
  const nextFixtureSnapshotPath = path.join(workDir, "fixture.v4.json");
  await writeFile(nextSnapshotPath, nextHandoffText.replace("Safe Agent Workbench", "Safe Agent Workshop"));
  await writeFile(nextFixtureSnapshotPath, nextFixtureText);
  const calls = [];
  await assert.rejects(
    loadSdkJsHandoff(
      options(fetcher(new Map(), calls), {
        nextSnapshotPath,
        nextFixtureSnapshotPath,
      }),
    ),
    (error) => error.code === "SDKJS_NEXT_PRESENT_INVALID" && /next snapshot/.test(error.message),
  );
  assert.deepEqual(calls.sort(), [URLS.nextFixture, URLS.nextHandoff].sort());
});
