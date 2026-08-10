import assert from "node:assert/strict";
import test from "node:test";

import { detailStructureFailures, geocodingProofFailures } from "../lib/gallery-live-contract.mjs";
import { viewportFailure } from "../lib/gallery-visual-contract.mjs";

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
