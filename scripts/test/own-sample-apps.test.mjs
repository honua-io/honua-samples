import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadGalleryPublicPortfolio } from "../lib/gallery-public-portfolio.mjs";
import {
  dataOriginsOf,
  isOwnBrowserSample,
  resolveAppEntrypoint,
  sha256,
  stageOwnBrowserApp,
  verifyPublishedOwnApp,
} from "../lib/own-sample-apps.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = `<!doctype html><script src="https://cdn.jsdelivr.net/npm/x@1.0.0/x.js"></script><script>fetch("https://demo.honua.io/rest/services?f=json")</script>`;

function git(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" }).trim();
}

async function fixtureRepo(files) {
  const root = await mkdtemp(path.join(tmpdir(), "own-sample-apps-"));
  git(root, "init", "-q");
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), content);
  }
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
  return { root, commit: git(root, "rev-parse", "HEAD") };
}

const manifest = (command = "src/index.html", dataMode = "public-live") => ({ id: "demo", dataMode, entrypoint: { type: "browser", command } });

async function listFiles(root, prefix = "") {
  const out = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(root, relative)));
    else out.push(relative);
  }
  return out;
}

test("every public own browser sample stages as a runnable app at HEAD", async () => {
  // The guard that keeps a future public browser sample from silently
  // shipping the "No runnable build published yet" panel.
  const portfolio = await loadGalleryPublicPortfolio();
  const commit = git(REPO_ROOT, "rev-parse", "HEAD");
  const out = await mkdtemp(path.join(tmpdir(), "own-sample-apps-head-"));
  const staged = [];
  try {
    for (const dirName of (await readdir(path.join(REPO_ROOT, "samples"))).sort()) {
      let sample;
      try {
        sample = JSON.parse(await readFile(path.join(REPO_ROOT, "samples", dirName, "sample.json"), "utf8"));
      } catch {
        continue;
      }
      if (!isOwnBrowserSample(sample)) continue;
      if (portfolio.byIdentity.get(`honua-samples:${sample.id}`)?.disposition !== "public") continue;
      const result = await stageOwnBrowserApp({ repoRoot: REPO_ROOT, dirName, manifest: sample, sourceCommit: commit, destDir: path.join(out, dirName) });
      assert.equal(result.ok, true, `${dirName}: ${result.reason}`);
      assert.equal(result.app.builtFrom.commit, commit);
      if (sample.dataMode === "public-live") assert.deepEqual(result.app.dataOrigins, ["https://demo.honua.io"], dirName);
      assert.deepEqual(await verifyPublishedOwnApp(path.join(out, dirName), result.app, { readdirRecursive: listFiles }), []);
      staged.push(dirName);
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
  assert.ok(staged.length >= 4, `expected the four map-first browser samples to stage, staged ${staged.join(", ")}`);
});

test("stages committed files with sha256 digests and the single data origin", async () => {
  const { root, commit } = await fixtureRepo({
    "samples/demo/sample.json": "{}",
    "samples/demo/README.md": "# not published",
    "samples/demo/src/index.html": PAGE,
    "samples/demo/src/lib/app.js": "export const x = 1;\n",
  });
  const destDir = path.join(root, "out");
  const result = await stageOwnBrowserApp({ repoRoot: root, dirName: "demo", manifest: manifest(), sourceCommit: commit, destDir });
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.app.files.map((f) => f.path), ["index.html", "lib/app.js"]);
  assert.equal(result.app.files[0].sha256, sha256(Buffer.from(PAGE)));
  assert.deepEqual(result.app.dataOrigins, ["https://demo.honua.io"]);
  assert.deepEqual(result.app.builtFrom, { commit, path: "samples/demo/src" });
  assert.deepEqual((await listFiles(destDir)).sort(), ["index.html", "lib/app.js"]);
  assert.deepEqual(await verifyPublishedOwnApp(destDir, result.app, { readdirRecursive: listFiles }), []);

  await writeFile(path.join(destDir, "index.html"), `${PAGE}<!-- tampered -->`);
  await writeFile(path.join(destDir, "extra.js"), "");
  const failures = await verifyPublishedOwnApp(destDir, result.app, { readdirRecursive: listFiles });
  assert.ok(failures.some((f) => f.startsWith("index.html: published bytes")), failures.join("; "));
  assert.ok(failures.some((f) => f.startsWith("extra.js: published but not")), failures.join("; "));
  await rm(root, { recursive: true, force: true });
});

test("an uncommitted, untracked, or edited entrypoint fails staging", async () => {
  const { root, commit } = await fixtureRepo({ "samples/demo/src/index.html": PAGE });
  const destDir = path.join(root, "out");
  await writeFile(path.join(root, "samples/demo/src/index.html"), `${PAGE}<!-- edit -->`);
  let result = await stageOwnBrowserApp({ repoRoot: root, dirName: "demo", manifest: manifest(), sourceCommit: commit, destDir });
  assert.equal(result.ok, false);
  assert.match(result.reason, /uncommitted changes/);
  await writeFile(path.join(root, "samples/demo/src/index.html"), PAGE);

  result = await stageOwnBrowserApp({ repoRoot: root, dirName: "demo", manifest: manifest("src/missing.html"), sourceCommit: commit, destDir });
  assert.equal(result.ok, false);
  assert.match(result.reason, /is not committed/);

  // create-honua-app style: entrypoint in a build output directory git does not track.
  result = await stageOwnBrowserApp({ repoRoot: root, dirName: "demo", manifest: manifest("app/index.html"), sourceCommit: commit, destDir });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no committed files/);
  await rm(root, { recursive: true, force: true });
});

test("symlinks and unsafe entrypoints are refused", async () => {
  const { root } = await fixtureRepo({ "samples/demo/src/index.html": PAGE });
  await symlink("/etc/hostname", path.join(root, "samples/demo/src/link.txt"));
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "symlink");
  const commit = git(root, "rev-parse", "HEAD");
  const result = await stageOwnBrowserApp({ repoRoot: root, dirName: "demo", manifest: manifest(), sourceCommit: commit, destDir: path.join(root, "out") });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not a regular committed file/);
  await rm(root, { recursive: true, force: true });

  assert.throws(() => resolveAppEntrypoint("../other/src/index.html"), /escapes/);
  assert.throws(() => resolveAppEntrypoint("/abs/index.html"), /escapes/);
  assert.throws(() => resolveAppEntrypoint("index.html"), /subdirectory/);
  assert.throws(() => resolveAppEntrypoint("src/main.ts"), /not an HTML file/);
  assert.deepEqual(resolveAppEntrypoint("src/index.html"), { appDir: "src", entrypoint: "index.html" });
});

test("a public-live sample must name exactly one data origin", async () => {
  const twoOrigins = `${PAGE}<script>fetch("https://other.example.org/x")</script>`;
  const { root, commit } = await fixtureRepo({ "samples/demo/src/index.html": twoOrigins });
  const result = await stageOwnBrowserApp({ repoRoot: root, dirName: "demo", manifest: manifest(), sourceCommit: commit, destDir: path.join(root, "out") });
  assert.equal(result.ok, false);
  assert.match(result.reason, /exactly one data origin; found https:\/\/demo\.honua\.io, https:\/\/other\.example\.org/);
  await rm(root, { recursive: true, force: true });

  assert.deepEqual(dataOriginsOf(PAGE), ["https://demo.honua.io"]);
  assert.deepEqual(dataOriginsOf(`<script src="https://unpkg.com/x@1/x.js"></script>`), []);
});

test("a non-sha source commit is refused before reading git", async () => {
  const result = await stageOwnBrowserApp({ repoRoot: REPO_ROOT, dirName: "maplibre-ogc-tiles-mvt", manifest: manifest(), sourceCommit: "trunk", destDir: path.join(tmpdir(), "never-written") });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not a full git sha/);
});

test("only the optional basemap probe on the sample's own data origin is a documented degraded response", async () => {
  const { documentedDegradedResponse } = await import("../lib/own-sample-apps.mjs");
  const dataOrigin = "https://demo.honua.io";
  const probe = "https://demo.honua.io/api/v1/tiles/pmtiles/maui-basemap";
  assert.equal(documentedDegradedResponse({ url: probe, status: 404, dataOrigin })?.state, "basemap-unavailable");
  assert.equal(documentedDegradedResponse({ url: probe, status: 503, dataOrigin })?.state, "basemap-unavailable");
  // Not an error, no known data origin, another origin, or any other path: no exception.
  assert.equal(documentedDegradedResponse({ url: probe, status: 206, dataOrigin }), null);
  assert.equal(documentedDegradedResponse({ url: probe, status: 404, dataOrigin: null }), null);
  assert.equal(documentedDegradedResponse({ url: "https://evil.example/api/v1/tiles/pmtiles/maui-basemap", status: 404, dataOrigin }), null);
  for (const path of [
    "/rest/services/maui-place-names/FeatureServer/6/query",
    "/ogc/features/collections/maui-zoning/items",
    "/ogc/tiles/collections/maui-buildings/tiles/WebMercatorQuad/15/14000/4000",
    "/api/v1/tiles/pmtiles/maui-basemap/extra",
  ]) {
    assert.equal(documentedDegradedResponse({ url: `${dataOrigin}${path}`, status: 404, dataOrigin }), null, path);
  }
  assert.equal(documentedDegradedResponse({ url: "not a url", status: 404, dataOrigin }), null);
});
