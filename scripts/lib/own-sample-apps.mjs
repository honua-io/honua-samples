// Stages this repo's own browser samples (samples/<id>/sample.json with
// entrypoint.type "browser") as runnable gallery apps under site/<id>/app/.
//
// Integrity and honesty rules (mirroring the sdk-js bundle embeds in
// scripts/lib/sample-bundles.mjs):
//   - Files are read from the git object store AT the gallery's source commit
//     (`git ls-tree` + `git cat-file`), never from a mutable working tree, so
//     the provenance line "Built from honua-samples @<commit>" is exact.
//   - The working-tree copy must be byte-identical to the committed blob; an
//     uncommitted edit fails staging instead of shipping bytes the page then
//     misattributes.
//   - Only regular files (mode 100644/100755) under the entrypoint's own
//     directory are staged -- no symlinks, submodules, path traversal, or the
//     sample's README/manifest/verify specs.
//   - Every staged file is SHA-256 digested into app.manifest.v1.json, which
//     the browser smoke re-verifies against the published bytes.
//   - The data origin in the provenance line ("public-live against
//     demo.honua.io") is read from the staged source itself: exactly one
//     non-library https origin must appear, otherwise staging fails.
// A sample that fails any rule is reported with a reason; the gallery then
// shows the honest no-bundle panel and --check / the browser smoke go red.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const OWN_APP_MANIFEST_FORMAT = "honua.samples.own-app.v1";
export const OWN_APP_MANIFEST_NAME = "app.manifest.v1.json";
export const OWN_SAMPLE_SOURCE_REPO = "honua-samples";

// Published-package CDNs the samples load pinned libraries from (README rule:
// published packages only). They are libraries, not data origins.
export const LIBRARY_ORIGINS = Object.freeze(["https://cdn.jsdelivr.net", "https://unpkg.com"]);

const REGULAR_FILE_MODES = new Set(["100644", "100755"]);
const ORIGIN_PATTERN = /https:\/\/[a-z0-9.-]+(?::\d+)?/giu;

export function isOwnBrowserSample(manifest) {
  return manifest?.entrypoint?.type === "browser";
}

// Returns { appDir, entrypoint } relative to the sample directory, or throws.
export function resolveAppEntrypoint(command) {
  if (typeof command !== "string" || !command.trim()) throw new Error("entrypoint.command is empty");
  const normalized = path.posix.normalize(command.trim());
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`entrypoint.command ${JSON.stringify(command)} escapes the sample directory`);
  }
  if (!normalized.endsWith(".html")) throw new Error(`entrypoint.command ${JSON.stringify(command)} is not an HTML file`);
  const appDir = path.posix.dirname(normalized);
  if (appDir === ".") {
    throw new Error("entrypoint must live in a subdirectory (for example src/index.html) so only app files are published");
  }
  return { appDir, entrypoint: path.posix.relative(appDir, normalized) };
}

export function dataOriginsOf(text) {
  const origins = new Set();
  for (const match of String(text).matchAll(ORIGIN_PATTERN)) {
    const origin = match[0].toLowerCase();
    if (!LIBRARY_ORIGINS.includes(origin)) origins.add(origin);
  }
  return [...origins].sort();
}

function git(repoRoot, args, encoding = "utf8") {
  return execFileSync("git", args, { cwd: repoRoot, encoding, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function listCommittedFiles(repoRoot, commit, treePath) {
  const raw = git(repoRoot, ["ls-tree", "-r", "-z", "--full-tree", commit, "--", `${treePath}/`]);
  return raw
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      const [mode, type, object] = line.slice(0, tab).split(" ");
      return { mode, type, object, repoPath: line.slice(tab + 1) };
    });
}

// Stages one sample. Returns { ok: true, app } or { ok: false, reason }.
export async function stageOwnBrowserApp({ repoRoot, dirName, manifest, sourceCommit, destDir }) {
  try {
    if (!/^[0-9a-f]{40}$/u.test(sourceCommit ?? "")) throw new Error(`source commit ${JSON.stringify(sourceCommit)} is not a full git sha`);
    const { appDir, entrypoint } = resolveAppEntrypoint(manifest?.entrypoint?.command);
    const sampleRepoPath = `samples/${dirName}`;
    const appRepoPath = `${sampleRepoPath}/${appDir}`;
    let entries;
    try {
      entries = listCommittedFiles(repoRoot, sourceCommit, appRepoPath);
    } catch (error) {
      throw new Error(`cannot read ${appRepoPath}/ at ${sourceCommit.slice(0, 12)}: ${firstLine(error)}`);
    }
    if (entries.length === 0) throw new Error(`${appRepoPath}/ has no committed files at ${sourceCommit.slice(0, 12)}`);
    for (const entry of entries) {
      if (entry.type !== "blob" || !REGULAR_FILE_MODES.has(entry.mode)) {
        throw new Error(`${entry.repoPath} is not a regular committed file (mode ${entry.mode}, ${entry.type})`);
      }
    }
    const files = [];
    for (const entry of entries.sort((a, b) => a.repoPath.localeCompare(b.repoPath))) {
      const bytes = git(repoRoot, ["cat-file", "blob", entry.object], "buffer");
      let working;
      try {
        working = await readFile(path.join(repoRoot, entry.repoPath));
      } catch {
        throw new Error(`${entry.repoPath} is committed but missing from the working tree`);
      }
      if (!working.equals(bytes)) throw new Error(`${entry.repoPath} has uncommitted changes; commit it so the staged bytes match ${sourceCommit.slice(0, 12)}`);
      files.push({ path: path.posix.relative(appRepoPath, entry.repoPath), bytes });
    }
    const entry = files.find((file) => file.path === entrypoint);
    if (!entry) throw new Error(`entrypoint ${appRepoPath}/${entrypoint} is not committed at ${sourceCommit.slice(0, 12)}`);

    const dataMode = manifest.dataMode ?? null;
    const dataOrigins = dataOriginsOf(files.filter((f) => /\.(html|m?js)$/u.test(f.path)).map((f) => f.bytes.toString("utf8")).join("\n"));
    if ((dataMode === "public-live" || dataMode === "live") && dataOrigins.length !== 1) {
      throw new Error(`a ${dataMode} sample must reference exactly one data origin; found ${dataOrigins.length ? dataOrigins.join(", ") : "none"}`);
    }

    await rm(destDir, { recursive: true, force: true });
    for (const file of files) {
      const target = path.join(destDir, ...file.path.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.bytes);
    }
    const app = {
      format: OWN_APP_MANIFEST_FORMAT,
      id: manifest.id ?? dirName,
      sourceRepo: OWN_SAMPLE_SOURCE_REPO,
      builtFrom: { commit: sourceCommit, path: appRepoPath },
      entrypoint,
      dataMode,
      dataOrigins,
      files: files.map((file) => ({ path: file.path, bytes: file.bytes.length, sha256: sha256(file.bytes) })),
    };
    return { ok: true, app };
  } catch (error) {
    await rm(destDir, { recursive: true, force: true }).catch(() => {});
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

// Re-verifies a published app directory against its manifest. Returns a list
// of failures (empty when every file matches and nothing extra is published).
export async function verifyPublishedOwnApp(appDir, app, { readdirRecursive } = {}) {
  const failures = [];
  for (const file of app.files ?? []) {
    try {
      const bytes = await readFile(path.join(appDir, ...file.path.split("/")));
      if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) failures.push(`${file.path}: published bytes do not match the staged sha256`);
    } catch {
      failures.push(`${file.path}: missing from the published app`);
    }
  }
  if (readdirRecursive) {
    const listed = new Set((app.files ?? []).map((f) => f.path));
    for (const relative of await readdirRecursive(appDir)) {
      if (!listed.has(relative)) failures.push(`${relative}: published but not in the app manifest`);
    }
  }
  return failures;
}

// The one documented degraded state an own browser sample handles on the page
// itself: its optional PMTiles basemap probe fails, it says "plain background"
// and still renders its data layer. Both gallery smokes accept exactly this
// response -- an HTTP error on the basemap archive path of the sample's own
// data origin -- and nothing else.
export const OWN_APP_DEGRADED_RESPONSES = Object.freeze([
  Object.freeze({
    pattern: /^\/api\/v1\/tiles\/pmtiles\/[^/]+$/u,
    state: "basemap-unavailable",
    note: "PMTiles basemap probe failed; the sample draws its layer on a plain background",
  }),
]);

export function documentedDegradedResponse({ url, status, dataOrigin }) {
  if (!dataOrigin || !(status >= 400)) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== dataOrigin) return null;
  return OWN_APP_DEGRADED_RESPONSES.find((entry) => entry.pattern.test(parsed.pathname)) ?? null;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function dataOriginHost(app) {
  const origin = app?.dataOrigins?.length === 1 ? app.dataOrigins[0] : null;
  return origin ? new URL(origin).host : null;
}

function firstLine(error) {
  const text = String(error?.stderr || error?.message || error);
  return text.trim().split("\n")[0];
}
