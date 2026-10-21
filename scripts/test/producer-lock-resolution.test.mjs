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
  checkRemoteAsset,
  partitionAcquisitions,
  producerClock,
  sha256,
  unclassifiedKinds,
} from "../validate-producer-lock-resolution.mjs";
import { readDeclaredAssetBytes, SDK_PRODUCER_LOCK } from "../lib/sdk-producer-lock.mjs";

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

test("a split archive is the concatenation of its declared parts", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "producer-lock-parts-"));
  try {
    const partA = Buffer.from("archive-head");
    const partB = Buffer.from("archive-tail");
    await writeFile(path.join(dir, "sample-bundles.tar.gz.part-00"), partA);
    await writeFile(path.join(dir, "sample-bundles.tar.gz.part-01"), partB);
    const whole = Buffer.concat([partA, partB]);
    const url = pathToFileURL(path.join(dir, "sample-bundles.tar.gz")).href;
    const lock = {
      ...SDK_PRODUCER_LOCK,
      urls: { ...SDK_PRODUCER_LOCK.urls, bundleArchive: url },
      assets: {
        ...SDK_PRODUCER_LOCK.assets,
        bundleArchive: {
          bytes: whole.byteLength,
          sha256: sha256(whole),
          provenance: "test",
          parts: [
            { name: "sample-bundles.tar.gz.part-00", bytes: partA.byteLength, sha256: sha256(partA) },
            { name: "sample-bundles.tar.gz.part-01", bytes: partB.byteLength, sha256: sha256(partB) },
          ],
        },
      },
    };
    const read = await readDeclaredAssetBytes("bundleArchive", url, lock);
    assert.equal(sha256(read), sha256(whole));
    assert.match(await checkLocalAsset("bundleArchive", url, lock), /sha256/u);

    await writeFile(path.join(dir, "sample-bundles.tar.gz.part-01"), Buffer.from("mutated-tail"));
    await assert.rejects(() => readDeclaredAssetBytes("bundleArchive", url, lock), /part sample-bundles.tar.gz.part-01 content mismatch/u);
    await rm(path.join(dir, "sample-bundles.tar.gz.part-00"));
    await assert.rejects(() => checkLocalAsset("bundleArchive", url, lock), /does not resolve/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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

test("a remote bundle asset must use an exact-source immutable release and exact bounded bytes", async () => {
  const bytes = Buffer.from(JSON.stringify(validManifest));
  const kind = "bundleManifest";
  const url = `https://github.com/${SDK_PRODUCER_LOCK.repository}/releases/download/sample-bundles-${SDK_PRODUCER_LOCK.revision}/sample-bundles.v2.json`;
  const lock = {
    ...SDK_PRODUCER_LOCK,
    urls: { ...SDK_PRODUCER_LOCK.urls, [kind]: url },
    assets: { ...SDK_PRODUCER_LOCK.assets, [kind]: { bytes: bytes.length, sha256: sha256(bytes), provenance: "test" } },
  };
  const fetchImpl = async () => new Response(bytes, { status: 200 });
  assert.equal(partitionAcquisitions(lock).remote.find((entry) => entry.kind === kind)?.url, url);
  assert.match(await checkRemoteAsset(kind, url, lock, { fetchImpl }), /sha256/u);
  await assert.rejects(() => checkRemoteAsset(kind, url.replace(lock.revision, "latest"), lock, { fetchImpl }), /exact immutable release/u);
  await assert.rejects(() => checkRemoteAsset(kind, url, lock, { fetchImpl: async () => new Response("missing", { status: 404 }) }), /HTTP 404/u);
  await assert.rejects(() => checkRemoteAsset(kind, url, lock, { fetchImpl: async () => new Response(Buffer.concat([bytes, Buffer.from("x")])) }), /exceeds/u);
  const wrongHash = { ...lock, assets: { ...lock.assets, [kind]: { ...lock.assets[kind], sha256: "f".repeat(64) } } };
  await assert.rejects(() => checkRemoteAsset(kind, url, wrongHash, { fetchImpl }), /differ/u);
  const wrongShape = Buffer.from(JSON.stringify({ ...validManifest, format: "honua.sdk.sample-bundles.v3" }));
  const wrongShapeLock = { ...lock, assets: { ...lock.assets, [kind]: { bytes: wrongShape.length, sha256: sha256(wrongShape) } } };
  await assert.rejects(() => checkRemoteAsset(kind, url, wrongShapeLock, { fetchImpl: async () => new Response(wrongShape) }), /unexpected manifest format/u);
});

test("a remote archive uses the same exact-source release and rejects a truncated body", async () => {
  const bytes = Buffer.from("synthetic archive bytes");
  const kind = "bundleArchive";
  const url = `https://github.com/${SDK_PRODUCER_LOCK.repository}/releases/download/sample-bundles-${SDK_PRODUCER_LOCK.revision}/sample-bundles.tar.gz`;
  const lock = {
    ...SDK_PRODUCER_LOCK,
    urls: { ...SDK_PRODUCER_LOCK.urls, [kind]: url },
    assets: { ...SDK_PRODUCER_LOCK.assets, [kind]: { bytes: bytes.length, sha256: sha256(bytes), provenance: "test" } },
  };
  assert.match(await checkRemoteAsset(kind, url, lock, { fetchImpl: async () => new Response(bytes) }), /sha256/u);
  await assert.rejects(
    () => checkRemoteAsset(kind, url, lock, { fetchImpl: async () => new Response(bytes.subarray(0, -1)) }),
    /differ/u,
  );
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
