import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MANIFEST_URL,
  assertMinimumBundles,
  mergeLocalManifestEntries,
  parseMinimumBundles,
  validateManifestShape,
} from "../lib/sample-bundles.mjs";
import { SDK_PRODUCER_LOCK } from "../lib/sdk-producer-lock.mjs";

const validManifest = {
  format: "honua.sdk.sample-bundles.v2",
  schemaVersion: 2,
  build: {
    commit: "0123456789abcdef0123456789abcdef01234567",
  },
  samples: [
    {
      id: "service-explorer",
      builtFrom: {
        commit: "0123456789abcdef0123456789abcdef01234567",
        packageVersion: "0.0.0-test",
      },
      entrypoint: "index.html",
      runnability: "standalone",
      files: [
        {
          path: "index.html",
          bytes: 1,
          sha256: "0".repeat(64),
        },
      ],
    },
  ],
};

test("defaults to the immutable producer-locked v2 manifest asset", () => {
  assert.equal(DEFAULT_MANIFEST_URL, SDK_PRODUCER_LOCK.urls.bundleManifest);
});

test("accepts the producer's v2 manifest contract", () => {
  assert.doesNotThrow(() => validateManifestShape(validManifest));
});

test("rejects the retired v1 manifest contract", () => {
  assert.throws(
    () => validateManifestShape({ ...validManifest, format: "honua.sdk.sample-bundles.v1", schemaVersion: 1 }),
    /unexpected manifest format/,
  );
});

test("parses and enforces the production runnable-bundle floor", () => {
  assert.equal(parseMinimumBundles(undefined), 0);
  assert.equal(parseMinimumBundles("1"), 1);
  assert.throws(() => parseMinimumBundles("-1"), /non-negative integer/);
  assert.doesNotThrow(() =>
    assertMinimumBundles({ manifest: validManifest, stagedIds: ["service-explorer"] }, 1),
  );
  assert.throws(
    () =>
      assertMinimumBundles(
        { manifest: validManifest, stagedIds: [], degradedReason: "manifest unavailable" },
        1,
      ),
    /requires at least 1 staged standalone bundle.*manifest unavailable/,
  );
});

test("local overrides replace release metadata while local additions append", () => {
  const replacement = { ...validManifest.samples[0], files: [{ path: "index.html", bytes: 2, sha256: "1".repeat(64) }] };
  const addition = { ...replacement, id: "new-local-sample" };
  const merged = mergeLocalManifestEntries(validManifest, [{ manifest: replacement }, { manifest: addition }]);
  assert.deepEqual(merged.samples, [replacement, addition]);
});
