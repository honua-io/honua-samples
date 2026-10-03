// Playwright verification for samples/create-honua-app-vanilla-ts. The flow
// lives in scripts/browser-verification/create-honua-app-spec.mjs; this file
// binds it to the vanilla-ts template's DOM.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineCreateHonuaAppSpec } from "../../../scripts/browser-verification/create-honua-app-spec.mjs";

defineCreateHonuaAppSpec({
  sampleDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  templateId: "vanilla-ts",
  viewSource: "src/main.ts",
  statusSelector: "#status",
  mountedText: "The accepted plan is mounted. Every stage above ran through the public SDK API.",
  mapSelector: "#map",
  featureCountSelector: "#fact-features",
  connectStageSelector: '[data-stage="connect"]',
});
