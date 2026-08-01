import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MANIFEST_URL,
  assertMinimumBundles,
  parseMinimumBundles,
  validateManifestShape,
} from "../lib/sample-bundles.mjs";

const validManifest = {
  format: "honua.sdk.sample-bundles.v2",
  schemaVersion: 2,
  build: {
    commit: "0123456789abcdef0123456789abcdef01234567",
  },
  samples: [
    {
      id: "service-explorer",
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

test("defaults to the current v2 rolling manifest", () => {
  assert.match(DEFAULT_MANIFEST_URL, /sample-bundles\.v2\.json$/);
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
