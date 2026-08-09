import assert from "node:assert/strict";
import test from "node:test";
import { resultTimeoutMs, viewportFailure, visibleViewportRatio } from "../lib/gallery-visual-contract.mjs";

test("visible viewport ratio measures only the first viewport", () => {
  assert.equal(visibleViewportRatio({ x: 0, y: 200, width: 1000, height: 800 }, { width: 1440, height: 1000 }), 0.8);
  assert.equal(visibleViewportRatio({ x: 0, y: 900, width: 1000, height: 800 }, { width: 1440, height: 1000 }), 0.1);
  assert.equal(visibleViewportRatio(null, { width: 1440, height: 1000 }), 0);
});

test("fixture and live result budgets remain strict", () => {
  assert.equal(resultTimeoutMs({ dataMode: "fixture" }), 3_000);
  assert.equal(resultTimeoutMs({ dataMode: "hybrid" }), 5_000);
  assert.equal(resultTimeoutMs({ dataMode: "public-live" }), 5_000);
});

test("viewport failures encode the desktop and mobile product thresholds", () => {
  assert.equal(viewportFailure("desktop", 0.55, 0.55), null);
  assert.match(viewportFailure("mobile", 0.39, 0.4), /39\.0%.*40%/);
});
