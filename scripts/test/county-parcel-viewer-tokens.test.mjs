// samples/county-parcel-viewer mirrors the gallery's color tokens by name and
// value (design D14) instead of importing gallery.css, so the built app stays
// self-contained. This test fails when a shared token drifts.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GALLERY_CSS = path.join(REPO_ROOT, "scripts", "gallery-assets", "gallery.css");
const VIEWER_CSS = path.join(REPO_ROOT, "samples", "county-parcel-viewer", "src", "styles.css");
// The names design D14 requires the viewer to carry.
const REQUIRED = ["--paper", "--raised", "--ink", "--muted", "--line", "--green", "--red", "--yellow", "--code"];

/** Custom properties declared in the first `:root { ... }` block. */
function rootTokens(css) {
  const block = /:root\s*\{([^}]*)\}/u.exec(css.replace(/\/\*[\s\S]*?\*\//gu, ""));
  assert.ok(block, "no :root block");
  const tokens = new Map();
  for (const match of block[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/giu)) tokens.set(match[1], match[2].trim().toLowerCase());
  return tokens;
}

test("county-parcel-viewer carries the gallery tokens D14 names", async () => {
  const viewer = rootTokens(await readFile(VIEWER_CSS, "utf8"));
  for (const name of REQUIRED) assert.ok(viewer.has(name), `${name} is missing from the viewer's :root`);
});

test("every token the viewer shares with gallery.css has the gallery's value", async () => {
  const gallery = rootTokens(await readFile(GALLERY_CSS, "utf8"));
  const viewer = rootTokens(await readFile(VIEWER_CSS, "utf8"));
  const shared = [...viewer.keys()].filter((name) => gallery.has(name));
  assert.ok(shared.length >= REQUIRED.length);
  for (const name of shared) assert.equal(viewer.get(name), gallery.get(name), `${name} drifted from scripts/gallery-assets/gallery.css`);
});

test("the drift check notices a changed value", () => {
  const gallery = rootTokens(":root { --ink:#172622; --paper:#f4efdc; }");
  const viewer = rootTokens(":root {\n  --ink: #172623;\n  --paper: #F4EFDC;\n}");
  assert.equal(viewer.get("--paper"), gallery.get("--paper"));
  assert.notEqual(viewer.get("--ink"), gallery.get("--ink"));
});
