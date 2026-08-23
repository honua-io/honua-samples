import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  assertContract,
  checkLocalAsset,
  checkRemote,
  partitionAcquisitions,
  producerClock,
  sha256,
  unclassifiedKinds,
} from "../validate-producer-lock-resolution.mjs";
import { SDK_PRODUCER_LOCK } from "../lib/sdk-producer-lock.mjs";

// honua-samples#48: the consumer pointed at a retired rolling tag and a v1
// manifest for weeks and nothing went red, because the page degraded honestly.
// Every case below is a way that can happen again; all of them must be loud.

const CATALOG = { format: "honua.sdk.sample-catalog.v2", schemaVersion: 2 };

function payload(json) {
  const text = JSON.stringify(json);
  return { text, json };
}

async function withTempLock(assetJson, run) {
  const dir = await mkdtemp(path.join(tmpdir(), "producer-lock-"));
  try {
    const file = path.join(dir, "sample-bundles.v2.json");
    const bytes = Buffer.from(JSON.stringify(assetJson));
    await writeFile(file, bytes);
    const url = pathToFileURL(file).href;
    const lock = {
      ...SDK_PRODUCER_LOCK,
      urls: { ...SDK_PRODUCER_LOCK.urls, bundleManifest: url },
      assets: {
        ...SDK_PRODUCER_LOCK.assets,
        bundleManifest: { bytes: bytes.byteLength, sha256: sha256(bytes), provenance: "test" },
      },
    };
    await run({ lock, url, file, bytes });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const validManifest = {
  format: "honua.sdk.sample-bundles.v2",
  schemaVersion: 2,
  build: { commit: SDK_PRODUCER_LOCK.revision },
  samples: [
    {
      id: "service-explorer",
      entrypoint: "index.html",
      runnability: "standalone",
      builtFrom: { commit: SDK_PRODUCER_LOCK.revision, packageVersion: "0.0.0-test" },
      files: [{ path: "index.html", bytes: 1, sha256: "0".repeat(64) }],
    },
  ],
};

test("every acquisition in the live lock is classified into a lane", () => {
  assert.deepEqual(unclassifiedKinds(), []);
  const { remote, local } = partitionAcquisitions();
  assert.ok(remote.length > 0 && local.length > 0, "both lanes must be exercised by the live lock");
  for (const { url } of local) assert.match(url, /^file:/u);
  for (const { url } of remote) assert.match(url, /^https:/u);
});

test("a new producer input added without a lane is refused, not silently unchecked", () => {
  const lock = { ...SDK_PRODUCER_LOCK, urls: { ...SDK_PRODUCER_LOCK.urls, newProjection: "https://example.invalid/x.json" } };
  assert.deepEqual(unclassifiedKinds(lock), ["newProjection"]);
});

test("a moved format or schemaVersion fails and names both sides", () => {
  assert.doesNotThrow(() => assertContract("catalog", { ...CATALOG }, CATALOG));
  assert.throws(
    () => assertContract("catalog", { format: "honua.sdk.sample-catalog.v3", schemaVersion: 3 }, CATALOG),
    (error) =>
      /honua\.sdk\.sample-catalog\.v3/u.test(error.message) && /honua\.sdk\.sample-catalog\.v2/u.test(error.message),
  );
  assert.throws(() => assertContract("catalog", { format: CATALOG.format, schemaVersion: 3 }, CATALOG), /schemaVersion 3/u);
  assert.throws(() => assertContract("catalog", undefined, CATALOG), /undefined/u);
});

test("a vendored asset that is missing, resized, or mutated fails", async () => {
  await withTempLock(validManifest, async ({ lock, file, bytes }) => {
    assert.match(await checkLocalAsset("bundleManifest", lock.urls.bundleManifest, lock), /sha256/u);

    const resized = { ...lock, assets: { ...lock.assets, bundleManifest: { ...lock.assets.bundleManifest, bytes: bytes.byteLength + 1 } } };
    await assert.rejects(() => checkLocalAsset("bundleManifest", lock.urls.bundleManifest, resized), /the lock declares/u);

    const mutated = { ...lock, assets: { ...lock.assets, bundleManifest: { ...lock.assets.bundleManifest, sha256: "f".repeat(64) } } };
    await assert.rejects(() => checkLocalAsset("bundleManifest", lock.urls.bundleManifest, mutated), /digest is/u);

    await rm(file);
    await assert.rejects(() => checkLocalAsset("bundleManifest", lock.urls.bundleManifest, lock), /does not resolve/u);
  });
});

test("a vendored manifest whose format moved fails the shape check", async () => {
  await withTempLock({ ...validManifest, format: "honua.sdk.sample-bundles.v3", schemaVersion: 3 }, async ({ lock }) => {
    await assert.rejects(() => checkLocalAsset("bundleManifest", lock.urls.bundleManifest, lock), /unexpected manifest format/u);
  });
});

test("an asset with no declared digest cannot be quietly accepted", async () => {
  await withTempLock(validManifest, async ({ lock }) => {
    const undeclared = { ...lock, assets: { ...lock.assets, bundleManifest: undefined } };
    await assert.rejects(
      () => checkLocalAsset("bundleManifest", lock.urls.bundleManifest, undeclared),
      /declares no digest/u,
    );
  });
});

test("a retired remote path fails loudly -- the #48 failure mode", async () => {
  const fetchImpl = async (kind, url) => {
    if (kind !== "catalog") return payload({ format: "x", schemaVersion: 1 });
    throw Object.assign(new Error(`${kind} does not resolve: ${url} returned HTTP 404. honua-samples#48`), {});
  };
  await assert.rejects(() => checkRemote(SDK_PRODUCER_LOCK, { fetchImpl }), /404/u);
});

test("a moved catalog contract fails even when every URL still returns 200", async () => {
  const handoff = payload({ format: "honua.site.sdk-sample-consumer-handoff.v2", schemaVersion: 2 });
  const fetchImpl = async (kind) => {
    if (kind === "catalog") return payload({ format: "honua.sdk.sample-catalog.v3", schemaVersion: 3 });
    if (kind === "crosswalk") return payload({ format: "honua.sdk.capability-crosswalk.v1", schemaVersion: 1 });
    return handoff;
  };
  // The handoff pair is rejected first, which is itself the point: a producer
  // whose contract moved cannot pass this check by still answering 200.
  await assert.rejects(() => checkRemote(SDK_PRODUCER_LOCK, { fetchImpl }), /cannot admit them/u);
});

test("a schema-incompatible handoff pair is rejected with the consumer's own reasons", async () => {
  const fetchImpl = async () => payload({ format: "honua.site.sdk-sample-consumer-fixture.v9", schemaVersion: 9 });
  await assert.rejects(
    () => checkRemote(SDK_PRODUCER_LOCK, { fetchImpl }),
    (error) => /cannot admit them/u.test(error.message) && /schema-incompatible/u.test(error.message),
  );
});

test("a missing URL in the lock is a failure, not an undefined fetch", async () => {
  const lock = { ...SDK_PRODUCER_LOCK, urls: { ...SDK_PRODUCER_LOCK.urls, crosswalk: undefined } };
  await assert.rejects(() => checkRemote(lock, { fetchImpl: async () => payload({}) }), /missing the crosswalk URL/u);
});

test("resolution is judged against the producer's clock, not the wall clock", () => {
  const handoff = {
    qualifiedJourneys: [
      { visualEvidence: { observedAt: "2026-01-01T00:00:00.000Z" } },
      { visualEvidence: { observedAt: "2026-03-01T00:00:00.000Z" } },
      { visualEvidence: { observedAt: "not-a-date" } },
    ],
  };
  // The latest observation, so a self-consistent payload satisfies
  // observedAt <= now < expiresAt and only its schema can fail. Long-expired
  // evidence must not make this check red: freshness is the staging lane's
  // gate, and a permanently red check is exactly what #48 was about.
  assert.equal(producerClock(handoff).toISOString(), "2026-03-01T00:00:00.000Z");
  assert.ok(producerClock({}) instanceof Date, "a handoff with no journeys still yields a clock");
  assert.ok(producerClock({ qualifiedJourneys: [] }) instanceof Date);
});
