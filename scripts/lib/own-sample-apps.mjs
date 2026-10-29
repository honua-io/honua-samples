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
// A built sample (entrypoint.build, e.g. a Vite app) follows the same rules
// with three differences:
//   - The build runs in a clean `git archive` export of samples/<id>/ at the
//     source commit, so the working tree (edited or not) never reaches the
//     published bytes; the build's outputDir is what gets staged and digested.
//   - Output symlinks, special files, and paths escaping outputDir fail.
//   - The data-origin scan reads the app's own committed source (index.html
//     and src/, TypeScript included), not the bundle: a bundled SDK carries
//     literal hosts it never contacts for this app.
//   builtFrom records the build command, outputDir, and the package-lock.json
//   sha256 beside the commit.
// A sample that fails any rule is reported with a reason; the gallery then
// shows the honest no-bundle panel and --check / the browser smoke go red.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const OWN_APP_MANIFEST_FORMAT = "honua.samples.own-app.v1";
export const OWN_APP_MANIFEST_NAME = "app.manifest.v1.json";
export const OWN_SAMPLE_SOURCE_REPO = "honua-samples";

// Published-package CDNs the samples load pinned libraries from (README rule:
// published packages only). They are libraries, not data origins.
export const LIBRARY_ORIGINS = Object.freeze(["https://cdn.jsdelivr.net", "https://unpkg.com"]);

// Sites a sample only links to (attribution and the official flood map), never
// fetches from (R13). They are not data origins. The browser verify lanes
// assert at runtime that no request goes to them.
export const NAVIGATION_ORIGINS = Object.freeze(["https://www.openstreetmap.org", "https://msc.fema.gov"]);

const REGULAR_FILE_MODES = new Set(["100644", "100755"]);
const ORIGIN_PATTERN = /https:\/\/[a-z0-9.-]+(?::\d+)?/giu;
// Source files the data-origin scan reads. Built samples add TypeScript.
const STATIC_SOURCE_PATTERN = /\.(html|m?js)$/u;
const BUILT_SOURCE_PATTERN = /\.(html|[cm]?[jt]sx?)$/u;
const BUILD_TIMEOUT_MS = 15 * 60 * 1000;

export function isOwnBrowserSample(manifest) {
  return manifest?.entrypoint?.type === "browser";
}

export function hasAppBuild(manifest) {
  return manifest?.entrypoint?.build !== undefined;
}

// Cross-field rules for entrypoint.build that sample.v1.schema.json cannot
// express (scripts/lib/mini-schema.mjs has no if/then). Shared by
// scripts/validate-manifests.mjs and the stager. Returns a list of errors.
export function appBuildErrors(entrypoint) {
  const build = entrypoint?.build;
  if (build === undefined) return [];
  const errors = [];
  if (entrypoint.type !== "browser") errors.push(`entrypoint.build is only allowed with entrypoint.type "browser" (found ${JSON.stringify(entrypoint.type)})`);
  if (!build || typeof build !== "object" || Array.isArray(build)) return [...errors, "entrypoint.build must be an object"];
  if (typeof build.command !== "string" || !build.command.trim()) errors.push("entrypoint.build.command is empty");
  const outputDir = relativeInside(build.outputDir);
  if (!outputDir.ok) errors.push(`entrypoint.build.outputDir ${JSON.stringify(build.outputDir)} ${outputDir.reason} the sample directory`);
  else if (outputDir.path === ".") errors.push("entrypoint.build.outputDir must be a subdirectory of the sample (for example dist) so only build output is published");
  const published = relativeInside(build.publishedEntrypoint);
  if (!published.ok) errors.push(`entrypoint.build.publishedEntrypoint ${JSON.stringify(build.publishedEntrypoint)} ${published.reason} outputDir`);
  else if (!published.path.endsWith(".html")) errors.push(`entrypoint.build.publishedEntrypoint ${JSON.stringify(build.publishedEntrypoint)} is not an HTML file`);
  return errors;
}

// A relative POSIX path that cannot climb out of its base directory.
function relativeInside(value) {
  if (typeof value !== "string" || !value.trim()) return { ok: false, reason: "is empty in" };
  const trimmed = value.trim();
  if (trimmed.includes("\\")) return { ok: false, reason: "must use forward slashes in" };
  const normalized = path.posix.normalize(trimmed.replace(/\/+$/u, "")) || ".";
  if (normalized.startsWith("/") || /^[a-z]:/iu.test(normalized) || normalized.split("/").includes("..")) {
    return { ok: false, reason: "escapes" };
  }
  return { ok: true, path: normalized };
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
    if (!LIBRARY_ORIGINS.includes(origin) && !NAVIGATION_ORIGINS.includes(origin)) origins.add(origin);
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
    const { files, entrypoint, builtFrom, sourceText } = hasAppBuild(manifest)
      ? await collectBuiltFiles({ repoRoot, dirName, manifest, sourceCommit })
      : await collectCommittedFiles({ repoRoot, dirName, manifest, sourceCommit });

    const dataMode = manifest.dataMode ?? null;
    const dataOrigins = dataOriginsOf(sourceText);
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
      builtFrom,
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

// Static sample: the committed files under the entrypoint's own directory.
async function collectCommittedFiles({ repoRoot, dirName, manifest, sourceCommit }) {
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
  if (!files.some((file) => file.path === entrypoint)) throw new Error(`entrypoint ${appRepoPath}/${entrypoint} is not committed at ${sourceCommit.slice(0, 12)}`);
  const sourceText = files.filter((f) => STATIC_SOURCE_PATTERN.test(f.path)).map((f) => f.bytes.toString("utf8")).join("\n");
  return { files, entrypoint, builtFrom: { commit: sourceCommit, path: appRepoPath }, sourceText };
}

// Built sample: export samples/<id>/ at the source commit into a temp
// directory, scan its own source, run the build there, and collect outputDir.
async function collectBuiltFiles({ repoRoot, dirName, manifest, sourceCommit }) {
  const [buildError] = appBuildErrors(manifest.entrypoint);
  if (buildError) throw new Error(buildError);
  const { command } = manifest.entrypoint.build;
  const outputDir = relativeInside(manifest.entrypoint.build.outputDir).path;
  const entrypoint = relativeInside(manifest.entrypoint.build.publishedEntrypoint).path;
  const sampleRepoPath = `samples/${dirName}`;
  const at = sourceCommit.slice(0, 12);
  const exportRoot = await mkdtemp(path.join(tmpdir(), "own-sample-build-"));
  try {
    let archive;
    try {
      archive = git(repoRoot, ["archive", "--format=tar", sourceCommit, "--", `${sampleRepoPath}/`], "buffer");
    } catch (error) {
      throw new Error(`cannot export ${sampleRepoPath}/ at ${at}: ${firstLine(error)}`);
    }
    execFileSync("tar", ["-x", "-f", "-", "-C", exportRoot], { input: archive, stdio: ["pipe", "pipe", "pipe"] });
    const sampleDir = path.join(exportRoot, ...sampleRepoPath.split("/"));

    const lockfile = await readRegularFile(sampleDir, "package-lock.json", `${sampleRepoPath}/package-lock.json is not committed at ${at}; a built sample installs from its lockfile`);

    // Scan before building, so the build cannot rewrite what is scanned.
    const sources = [];
    if (await lstat(path.join(sampleDir, "index.html")).catch(() => null)) {
      sources.push({ path: "index.html", bytes: await readRegularFile(sampleDir, "index.html") });
    }
    const srcStat = await lstat(path.join(sampleDir, "src")).catch(() => null);
    if (srcStat?.isDirectory()) sources.push(...(await collectTree(sampleDir, "src", `${sampleRepoPath}/`)));
    else if (srcStat) throw new Error(`${sampleRepoPath}/src is not a directory`);
    const scanned = sources.filter((f) => BUILT_SOURCE_PATTERN.test(f.path));
    if (scanned.length === 0) throw new Error(`${sampleRepoPath}/ has no committed index.html or src/ source at ${at}`);

    try {
      execFileSync("/bin/sh", ["-c", command], { cwd: sampleDir, encoding: "utf8", timeout: BUILD_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      const tail = String(error?.stderr || error?.stdout || error?.message || error).trim().split("\n").slice(-5).join(" | ");
      throw new Error(`build command ${JSON.stringify(command)} failed for ${sampleRepoPath}: ${tail}`);
    }

    const outRoot = path.join(sampleDir, ...outputDir.split("/"));
    const outStat = await lstat(outRoot).catch(() => null);
    if (!outStat) throw new Error(`the build did not produce ${sampleRepoPath}/${outputDir}/`);
    if (outStat.isSymbolicLink() || !outStat.isDirectory()) throw new Error(`${sampleRepoPath}/${outputDir} is not a real directory`);
    if (!(await realpath(outRoot)).startsWith(`${await realpath(sampleDir)}${path.sep}`)) throw new Error(`${sampleRepoPath}/${outputDir} escapes the sample directory`);
    const files = (await collectTree(outRoot, "", `${sampleRepoPath}/${outputDir}/`)).sort((a, b) => a.path.localeCompare(b.path));
    if (files.length === 0) throw new Error(`the build produced no files in ${sampleRepoPath}/${outputDir}/`);
    if (!files.some((file) => file.path === entrypoint)) throw new Error(`the build did not produce ${sampleRepoPath}/${outputDir}/${entrypoint}`);

    return {
      files,
      entrypoint,
      builtFrom: {
        commit: sourceCommit,
        path: sampleRepoPath,
        build: { command, outputDir, lockfile: "package-lock.json", lockfileSha256: sha256(lockfile) },
      },
      sourceText: scanned.map((f) => f.bytes.toString("utf8")).join("\n"),
    };
  } finally {
    await rm(exportRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function readRegularFile(root, relative, missingMessage) {
  const absolute = path.join(root, ...relative.split("/"));
  const stat = await lstat(absolute).catch(() => null);
  if (!stat) throw new Error(missingMessage ?? `${relative} is missing`);
  if (!stat.isFile()) throw new Error(`${relative} is not a regular file`);
  return readFile(absolute);
}

// Every regular file under root/prefix as { path (relative to root), bytes }.
// Symlinks and special files fail; label prefixes the paths in errors.
async function collectTree(root, prefix, label) {
  const out = [];
  for (const entry of await readdir(path.join(root, ...prefix.split("/").filter(Boolean)), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (path.posix.normalize(relative).split("/").includes("..")) throw new Error(`${label}${relative} escapes its directory`);
    if (entry.isSymbolicLink()) throw new Error(`${label}${relative} is a symlink; only regular files are published`);
    if (entry.isDirectory()) out.push(...(await collectTree(root, relative, label)));
    else if (entry.isFile()) out.push({ path: relative, bytes: await readFile(path.join(root, ...relative.split("/"))) });
    else throw new Error(`${label}${relative} is not a regular file`);
  }
  return out;
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
