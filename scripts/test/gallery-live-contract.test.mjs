import assert from "node:assert/strict";
import test from "node:test";

import {
  columnarProofFailures,
  coverageProofFailures,
  detailStructureFailures,
  geocodingProofFailures,
  imageryCogProofFailures,
  stacFixtureProjectionProofFailures,
} from "../lib/gallery-live-contract.mjs";
import { viewportFailure } from "../lib/gallery-visual-contract.mjs";
import { convergeSemanticAssertion } from "../lib/semantic-convergence.mjs";

test("runnable examples must render inline code before runtime evidence", () => {
  const shared = {
    contentKind: "example",
    runnable: true,
    guidePosition: -1,
    guideStepCount: 0,
    expectedOutcomeCount: 0,
    sourcePosition: -1,
    codeViewCount: 1,
  };
  assert.deepEqual(detailStructureFailures({ ...shared, codePosition: 20, embedPosition: 80 }), []);
  assert.deepEqual(
    detailStructureFailures({ ...shared, codePosition: 80, embedPosition: 20 }),
    ["example detail is not inline-code-first"],
  );
});

test("code-first examples retain strict desktop and mobile result visibility budgets", () => {
  assert.equal(viewportFailure("desktop", 0.55, 0.55), null);
  assert.equal(viewportFailure("mobile", 0.4, 0.4), null);
  assert.match(viewportFailure("desktop", 0.549, 0.55), /requires at least 55%/u);
  assert.match(viewportFailure("mobile", 0.399, 0.4), /requires at least 40%/u);
});

test("runnable projects must lead with runtime evidence and put architecture later", () => {
  const shared = {
    contentKind: "project",
    runnable: true,
    codePosition: -1,
    guidePosition: -1,
    guideStepCount: 0,
    expectedOutcomeCount: 0,
    codeViewCount: 0,
  };
  assert.deepEqual(detailStructureFailures({ ...shared, embedPosition: 20, sourcePosition: 80 }), []);
  assert.deepEqual(
    detailStructureFailures({ ...shared, embedPosition: 80, sourcePosition: 20 }),
    ["project runtime evidence does not lead architecture/source content"],
  );
});

test("geocoding semantic proof requires the existing selected fixture result contract", () => {
  const proof = {
    ready: true,
    mode: "fixture-only",
    endpoint: "/rest/services/World/GeocodeServer/findAddressCandidates",
    resultCount: 3,
    markerCount: 1,
    selectedAddress: "Honolulu Hale",
    selectedScore: 100,
    selectedCoordinates: [-157.858, 21.307],
    lastError: null,
  };
  assert.deepEqual(geocodingProofFailures(proof, 1), []);
  assert.deepEqual(
    geocodingProofFailures({ ...proof, resultCount: 0, markerCount: 0, selectedAddress: "" }, 0),
    [
      "geocoding fixture returned no reviewed candidates",
      "geocoding selected marker count is not one: 0",
      "geocoding selected address is empty",
      "geocoding did not mount a map canvas",
    ],
  );
});

test("coverage proof accepts only the exact rendered fixture", () => {
  const proof = {
    ready: true,
    phase: "ready",
    activeProtocol: "ogc",
    collectionId: "7",
    selectedBand: "elevation",
    mapSourceId: "ogc-elevation",
    imageWidth: 320,
    imageHeight: 220,
    fixtureDigest: "8c7b5b3f8bd31bca2df07c4a70254d75e70d63838c2f77e033def3c1b8d2acff",
    centerPixelValue: 450,
    centerPixelColor: [221, 174, 82],
    ogcByteLength: 281908,
    wcsByteLength: 281908,
    requestCount: 8,
    error: null,
  };
  assert.deepEqual(coverageProofFailures(proof, 1), []);
  assert.ok(coverageProofFailures({ ...proof, fixtureDigest: "0".repeat(64) }, 1).length > 0);
  assert.ok(coverageProofFailures({ ready: true }, 1).length > 0);
});

test("imagery COG proof rejects unmounted or non-fixture transfers", () => {
  const validator = 'etag:"sha256-59ba6110a96c0aba2ab5f5ee27b0eed6ec436956df27bb6312b94573f35190bd"';
  const proof = {
    ready: true,
    disposed: false,
    selectedAssetKey: "cog",
    inspectionStatus: "ready",
    activeLayerCount: 3,
    resources: { activeRequests: 0, disposed: false },
    directCog: {
      phase: "ready",
      selectedAssetKey: "cog",
      candidateCount: 9,
      mapSourceMounted: true,
      mapLayerMounted: true,
      decoderModuleLoads: 1,
      decoderLoads: 1,
      decoderDisposals: 0,
      renderState: "ready",
      renderMounted: true,
      transferRequests: 3,
      transferBytes: 28672,
      assetValidator: validator,
      ranges: [4096, 12288, 12288].map((length) => ({
        length,
        bytesReceived: length,
        outcome: "success",
        status: 206,
        validator,
      })),
    },
    fixtureImagePaths: [
      "/sdk/imagery-cog-quickstart/app/fixtures/cog/tiles/wms-natural-color.png",
      "/sdk/imagery-cog-quickstart/app/fixtures/cog/tiles/image-server-natural-color.png",
    ],
  };
  assert.deepEqual(imageryCogProofFailures(proof, 1), []);
  assert.ok(imageryCogProofFailures({ ...proof, directCog: { ...proof.directCog, mapLayerMounted: false } }, 1).length > 0);
  assert.ok(imageryCogProofFailures({ ...proof, directCog: { ...proof.directCog, assetValidator: "mutable" } }, 1).length > 0);
});

test("columnar proof requires the bounded Arrow query and decoded row", () => {
  const proof = {
    ready: true,
    running: false,
    status: "ready",
    completedRuns: 1,
    cancelledRuns: 0,
    featureCount: 1,
    sourceFeatureCount: 4,
    evidence: {
      rows: 1,
      batches: 1,
      transferBytes: 4160,
      peakBackingBytes: 55,
      ceilings: { maxRows: 25, maxBatches: 2, maxTransferBytes: 16384, maxBackingBytes: 65536 },
    },
    plan: {
      execution: "server-pushdown",
      format: "arrow",
      pushdown: ["columns", "filter", "bbox", "limit", "orderBy"],
    },
    request: {
      method: "GET",
      url: "https://example.invalid/rest/services/Interoperability/Harbors/FeatureServer/0/query?f=arrow&resultRecordCount=25",
    },
    rows: [
      {
        featureId: 1,
        name: "Honolulu Harbor",
        coordinate: [-157.8583, 21.3069],
        timestamp: "1704164645000",
      },
    ],
  };
  assert.deepEqual(columnarProofFailures(proof, 1), []);
  assert.ok(
    columnarProofFailures(
      { ...proof, request: { ...proof.request, url: proof.request.url.replace("f=arrow", "f=json") } },
      1,
    ).length > 0,
  );
  assert.ok(columnarProofFailures({ ...proof, rows: [] }, 1).length > 0);
});

test("STAC proof requires fixture count, selection, projection, and trace together", () => {
  const proof = {
    ready: true,
    loadedCount: 2,
    paginationStatus: "ready for next page",
    selectedItemId: "S2B_MAUI_20260502_WEST",
    selectedAssetKey: "preview",
    selectedAssetFormat: "raster",
    mapReady: true,
    mapImageSourceActive: true,
    mapFootprintSourceActive: true,
    mapSelectionSourceIds: ["selected-stac-image", "selected-stac-footprint"],
    mapSelectionLayerIds: [
      "selected-stac-image-raster",
      "selected-stac-footprint-fill",
      "selected-stac-footprint-line",
    ],
    mappedItemId: "S2B_MAUI_20260502_WEST",
    mappedCoordinates: [
      [-156.72, 20.99],
      [-156.33, 20.99],
      [-156.33, 20.69],
      [-156.72, 20.69],
    ],
    searchRequests: [{ method: "POST", pathname: "/v1/search" }],
    signedAssetKeys: ["preview"],
    previewRequestPaths: ["/v1/collections/sentinel-2-l2a/items/assets/west-maui-preview.png"],
  };
  assert.deepEqual(stacFixtureProjectionProofFailures(proof, 1), []);
  assert.ok(stacFixtureProjectionProofFailures({ loadedCount: 2 }, 1).length > 0);
  assert.ok(stacFixtureProjectionProofFailures({ ...proof, mappedItemId: "different-item" }, 1).length > 0);
  assert.ok(
    stacFixtureProjectionProofFailures(
      { ...proof, searchRequests: [{ method: "GET", pathname: "/v1/search" }] },
      1,
    ).length > 0,
  );
});

test("columnar semantic convergence accepts only the exact proof within the attempt bound", async () => {
  const sourceFeatureCounts = [0, 2, 4];
  let proofIndex = 0;
  const result = await convergeSemanticAssertion(
    async () => {
      const failures = columnarProofFailures(columnarProof(sourceFeatureCounts[proofIndex++]), 1);
      if (failures.length > 0) throw new Error(failures.join("; "));
    },
    { maxAttempts: 5, timeoutMs: 1_000, intervalMs: 10, now: () => 0, sleep: async () => {} },
  );
  assert.deepEqual(result, {
    passed: true,
    attempts: 3,
    maxAttempts: 5,
    timeoutMs: 1_000,
    timedOut: false,
    lastError: "columnar sourceFeatureCount must equal 4",
  });
});

test("columnar semantic convergence rejects persistent partial proof at the attempt bound", async () => {
  const result = await convergeSemanticAssertion(
    async () => {
      const failures = columnarProofFailures(columnarProof(2), 1);
      if (failures.length > 0) throw new Error(failures.join("; "));
    },
    { maxAttempts: 3, timeoutMs: 1_000, intervalMs: 10, now: () => 0, sleep: async () => {} },
  );
  assert.deepEqual(result, {
    passed: false,
    attempts: 3,
    maxAttempts: 3,
    timeoutMs: 1_000,
    timedOut: false,
    lastError: "columnar sourceFeatureCount must equal 4",
  });
});

test("columnar semantic convergence fails at the strict timeout", async () => {
  let clockMs = 0;
  const result = await convergeSemanticAssertion(
    async () => {
      const failures = columnarProofFailures(columnarProof(0), 1);
      if (failures.length > 0) throw new Error(failures.join("; "));
    },
    {
      maxAttempts: 10,
      timeoutMs: 25,
      intervalMs: 10,
      now: () => clockMs,
      sleep: async (delayMs) => {
        clockMs += delayMs;
      },
    },
  );
  assert.deepEqual(result, {
    passed: false,
    attempts: 3,
    maxAttempts: 10,
    timeoutMs: 25,
    timedOut: true,
    lastError: "columnar sourceFeatureCount must equal 4",
  });
});

test("semantic convergence does not admit a non-fixture columnar request", async () => {
  const proof = columnarProof(4);
  proof.request.url = proof.request.url.replace("https://example.invalid", "https://samples.honua.io");
  const result = await convergeSemanticAssertion(
    async () => {
      const failures = columnarProofFailures(proof, 1);
      if (failures.length > 0) throw new Error(failures.join("; "));
    },
    { maxAttempts: 2, timeoutMs: 1_000, intervalMs: 10, now: () => 0, sleep: async () => {} },
  );
  assert.equal(result.passed, false);
  assert.equal(result.attempts, 2);
  assert.match(result.lastError, /bounded fixture Arrow query/u);
});

function columnarProof(sourceFeatureCount) {
  return {
    ready: true,
    running: false,
    status: "ready",
    completedRuns: 1,
    cancelledRuns: 0,
    featureCount: 1,
    sourceFeatureCount,
    evidence: {
      rows: 1,
      batches: 1,
      transferBytes: 4160,
      peakBackingBytes: 55,
      ceilings: { maxRows: 25, maxBatches: 2, maxTransferBytes: 16384, maxBackingBytes: 65536 },
    },
    plan: {
      execution: "server-pushdown",
      format: "arrow",
      pushdown: ["columns", "filter", "bbox", "limit", "orderBy"],
    },
    request: {
      method: "GET",
      url: "https://example.invalid/rest/services/Interoperability/Harbors/FeatureServer/0/query?f=arrow&resultRecordCount=25",
    },
    rows: [
      {
        featureId: 1,
        name: "Honolulu Harbor",
        coordinate: [-157.8583, 21.3069],
        timestamp: "1704164645000",
      },
    ],
  };
}
