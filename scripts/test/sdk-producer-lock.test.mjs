import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CATALOG_URL, DEFAULT_CROSSWALK_URL } from "../lib/sdkjs-catalog.mjs";
import { DEFAULT_FIXTURE_V4_URL, DEFAULT_HANDOFF_V2_URL } from "../lib/sdkjs-handoff.mjs";
import { DEFAULT_MANIFEST_URL, DEFAULT_TARBALL_URL, validateManifestShape } from "../lib/sample-bundles.mjs";
import { SDK_PRODUCER_LOCK, assertLockedAssetDigest, assertLockedProducerUrl } from "../lib/sdk-producer-lock.mjs";

test("all default producer acquisitions are immutable and centralized", () => {
  assert.deepEqual(
    [DEFAULT_HANDOFF_V2_URL, DEFAULT_FIXTURE_V4_URL, DEFAULT_CATALOG_URL, DEFAULT_CROSSWALK_URL, DEFAULT_MANIFEST_URL, DEFAULT_TARBALL_URL],
    [SDK_PRODUCER_LOCK.urls.handoffV2, SDK_PRODUCER_LOCK.urls.fixtureV4, SDK_PRODUCER_LOCK.urls.catalog, SDK_PRODUCER_LOCK.urls.crosswalk, SDK_PRODUCER_LOCK.urls.bundleManifest, SDK_PRODUCER_LOCK.urls.bundleArchive],
  );
  for (const url of Object.values(SDK_PRODUCER_LOCK.urls)) assert.doesNotMatch(url, /(?:\/trunk\/|latest)/u);
});

test("production lock rejects trunk, latest, and producer revision drift", () => {
  assert.throws(() => assertLockedProducerUrl("handoffV2", DEFAULT_HANDOFF_V2_URL.replace(SDK_PRODUCER_LOCK.revision, "trunk"), { enforce: true }), /lock mismatch/);
  assert.throws(() => assertLockedProducerUrl("bundleManifest", "https://github.com/honua-io/honua-sdk-js/releases/download/sample-bundles-latest/sample-bundles.v2.json", { enforce: true }), /lock mismatch/);
  const manifest = { format: "honua.sdk.sample-bundles.v2", schemaVersion: 2, samples: [{ id: "drift", entrypoint: "index.html", runnability: "standalone", builtFrom: { commit: "0123456789abcdef0123456789abcdef01234567", packageVersion: "test" }, files: [{ path: "index.html", bytes: 1, sha256: "0".repeat(64) }] }] };
  assert.throws(() => validateManifestShape(manifest, { expectedRevision: SDK_PRODUCER_LOCK.revision }), /lock mismatch/);
});

test("production lock rejects mutated release bytes", () => {
  assert.throws(() => assertLockedAssetDigest("bundleManifest", Buffer.from("mutated"), { enforce: true }), /content mismatch/);
});
