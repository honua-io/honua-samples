// Playwright verification for samples/create-honua-app-react-ts. The flow
// lives in scripts/browser-verification/create-honua-app-spec.mjs; this file
// binds it to the react-ts template's DOM. The React starter renders no
// feature count or per-stage state, so the query answer and the map pixels
// carry the fixture oracle.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineCreateHonuaAppSpec } from "../../../scripts/browser-verification/create-honua-app-spec.mjs";

defineCreateHonuaAppSpec({
  sampleDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  templateId: "react-ts",
  viewSource: "src/App.tsx",
  statusSelector: "output.status",
  mountedText: "The accepted plan is mounted through the kernel lifecycle.",
  mapSelector: ".map",
});
