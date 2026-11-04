// Design D14 as revised when the gallery moved onto honua.io's visual world:
//
// - scripts/gallery-assets/gallery.css carries the binding Honua brand palette
//   (honua-site assets/theme.css) under the `--honua-*` names. The values are
//   pinned here so the gallery cannot drift from the brand without a
//   deliberate edit to this test.
// - samples/county-parcel-viewer is an app inside an iframe, self-contained
//   by design (D13: its own bundled fonts, its own light palette). It keeps
//   the D14 token names so its stylesheet stays legible against the design
//   notes, but it no longer mirrors gallery values: the gallery is dark
//   ocean chrome, the viewer is a daylight map.

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
// honua-site assets/theme.css, the binding brand palette.
const HONUA_PALETTE = {
  "--honua-bg": "#08131a",
  "--honua-surface": "#0e1e27",
  "--honua-surface-2": "#162a34",
  "--honua-surface-3": "#1f3a47",
  "--honua-line": "#22343f",
  "--honua-line-soft": "#172730",
  "--honua-text": "#e6efee",
  "--honua-muted": "#8ea7a6",
  "--honua-faint": "#7f999a",
  "--honua-teal": "#3aa088",
  "--honua-teal-bright": "#5fc4a6",
  "--honua-blue": "#5fa1cc",
  "--honua-blue-bright": "#85c9f4",
  "--honua-blue-deep": "#3a7aa0",
  "--honua-amber": "#d9824a",
  "--honua-amber-bright": "#f2aa78",
  "--honua-cream": "#e9efed",
  "--honua-danger": "#f29c95",
  "--honua-on-accent": "#04151a",
};

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

test("the gallery carries the honua.io brand palette by name and value", async () => {
  const gallery = rootTokens(await readFile(GALLERY_CSS, "utf8"));
  for (const [name, value] of Object.entries(HONUA_PALETTE)) assert.equal(gallery.get(name), value, `${name} drifted from honua-site assets/theme.css`);
});

test("the gallery no longer shares the viewer's light-palette names", async () => {
  const gallery = rootTokens(await readFile(GALLERY_CSS, "utf8"));
  const viewer = rootTokens(await readFile(VIEWER_CSS, "utf8"));
  const shared = [...viewer.keys()].filter((name) => gallery.has(name));
  assert.deepEqual(shared, [], `viewer and gallery share tokens again: ${shared.join(", ")}; decide which one owns them`);
});

test("the gallery serves its own type, not a font CDN", async () => {
  const css = await readFile(GALLERY_CSS, "utf8");
  assert.match(css, /font-family:\s*HonuaSans;\s*src:\s*url\("fonts\/archivo-latin\.woff2"\)/u);
  assert.match(css, /font-family:\s*HonuaMono;\s*src:\s*url\("fonts\/martian-mono-latin\.woff2"\)/u);
  assert.doesNotMatch(css, /fonts\.(?:googleapis|gstatic)\.com|cdn\.jsdelivr\.net|unpkg\.com/u);
});

test("the drift check notices a changed value", () => {
  const gallery = rootTokens(":root { --ink:#172622; --paper:#f4efdc; }");
  const viewer = rootTokens(":root {\n  --ink: #172623;\n  --paper: #F4EFDC;\n}");
  assert.equal(viewer.get("--paper"), gallery.get("--paper"));
  assert.notEqual(viewer.get("--ink"), gallery.get("--ink"));
});
