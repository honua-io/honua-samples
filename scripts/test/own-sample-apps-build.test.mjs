// Built browser samples (entrypoint.build): schema, validator cross-field
// rules, and staging from a clean export of the committed sample. The build
// command in every fixture is a tiny node script writing dist/, so these
// tests need no network and no real Vite install.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "../lib/mini-schema.mjs";
import { appBuildErrors, sha256, stageOwnBrowserApp } from "../lib/own-sample-apps.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCHEMA = JSON.parse(await readFile(path.join(REPO_ROOT, "schemas", "sample.v1.schema.json"), "utf8"));

const BUILD = { command: "node build.mjs", outputDir: "dist", publishedEntrypoint: "index.html" };
const INDEX = `<!doctype html><script type="module" src="./src/main.ts"></script>`;
const MAIN_TS = `const base: string = "https://demo.honua.io";\nfetch(\`\${base}/rest/services?f=json\`);\n`;
const LOCK = `{"name":"demo","lockfileVersion":3,"requires":true,"packages":{}}\n`;
// Copies the committed index.html into dist/ and writes a bundle carrying a
// literal host a bundled SDK would contain -- dist/ is never origin-scanned.
const BUILD_SCRIPT = `import { cpSync, mkdirSync, writeFileSync } from "node:fs";
mkdirSync("dist/assets", { recursive: true });
cpSync("index.html", "dist/index.html");
writeFileSync("dist/assets/app.js", 'const tiles = "https://services.arcgisonline.com/x";');
`;

function git(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" }).trim();
}

async function fixtureRepo(overrides = {}) {
  const files = {
    "samples/demo/package.json": `{"name":"demo","private":true,"type":"module"}\n`,
    "samples/demo/package-lock.json": LOCK,
    "samples/demo/index.html": INDEX,
    "samples/demo/src/main.ts": MAIN_TS,
    "samples/demo/build.mjs": BUILD_SCRIPT,
    ...overrides,
  };
  const root = await mkdtemp(path.join(tmpdir(), "own-sample-build-test-"));
  git(root, "init", "-q");
  for (const [relative, content] of Object.entries(files)) {
    if (content === null) continue;
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), content);
  }
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
  return { root, commit: git(root, "rev-parse", "HEAD") };
}

const builtManifest = (build = BUILD, type = "browser") => ({ id: "demo", dataMode: "public-live", entrypoint: { type, command: "index.html", build } });

async function baseManifest() {
  return JSON.parse(await readFile(path.join(REPO_ROOT, "samples", "maplibre-ogc-tiles-mvt", "sample.json"), "utf8"));
}

async function stage(root, commit, manifest = builtManifest()) {
  const destDir = path.join(root, "out");
  return { destDir, result: await stageOwnBrowserApp({ repoRoot: root, dirName: "demo", manifest, sourceCommit: commit, destDir }) };
}

test("the schema accepts entrypoint.build and rejects malformed ones", async () => {
  const sample = await baseManifest();
  const check = (entrypoint) => {
    const errors = [];
    validateAgainstSchema(SCHEMA, { ...sample, entrypoint }, "$", errors);
    return errors;
  };
  assert.deepEqual(check({ type: "browser", command: "index.html", build: BUILD }), []);
  assert.ok(check({ type: "browser", command: "index.html", build: { command: "npm ci", outputDir: "dist" } }).some((e) => /publishedEntrypoint/.test(e)));
  assert.ok(check({ type: "browser", command: "index.html", build: { ...BUILD, extra: true } }).some((e) => /extra/.test(e)));
  assert.ok(check({ type: "browser", command: "index.html", build: { ...BUILD, outputDir: "" } }).some((e) => /minLength/.test(e)));
});

test("appBuildErrors enforces browser-only and paths inside the sample", () => {
  assert.deepEqual(appBuildErrors({ type: "browser", command: "src/index.html" }), []);
  assert.deepEqual(appBuildErrors({ type: "browser", command: "index.html", build: BUILD }), []);
  assert.deepEqual(appBuildErrors({ type: "browser", command: "index.html", build: { ...BUILD, outputDir: "dist/", publishedEntrypoint: "app/index.html" } }), []);
  const fails = (entrypoint, pattern) => assert.ok(appBuildErrors(entrypoint).some((e) => pattern.test(e)), JSON.stringify(appBuildErrors(entrypoint)));
  fails({ type: "node", command: "node index.mjs", build: BUILD }, /only allowed with entrypoint.type "browser"/);
  fails({ type: "browser", command: "index.html", build: { ...BUILD, outputDir: "../dist" } }, /outputDir "..\/dist" escapes the sample directory/);
  fails({ type: "browser", command: "index.html", build: { ...BUILD, outputDir: "dist/../../x" } }, /escapes/);
  fails({ type: "browser", command: "index.html", build: { ...BUILD, outputDir: "/tmp/dist" } }, /escapes/);
  fails({ type: "browser", command: "index.html", build: { ...BUILD, outputDir: "." } }, /must be a subdirectory/);
  fails({ type: "browser", command: "index.html", build: { ...BUILD, outputDir: "dist\\x" } }, /forward slashes/);
  fails({ type: "browser", command: "index.html", build: { ...BUILD, publishedEntrypoint: "../index.html" } }, /publishedEntrypoint "..\/index.html" escapes outputDir/);
  fails({ type: "browser", command: "index.html", build: { ...BUILD, publishedEntrypoint: "main.js" } }, /not an HTML file/);
  fails({ type: "browser", command: "index.html", build: { ...BUILD, command: " " } }, /command is empty/);
});

test("validate-manifests reports the build cross-field rules", async () => {
  const samplesDir = await mkdtemp(path.join(tmpdir(), "validate-build-"));
  try {
    const sample = await baseManifest();
    const write = async (id, entrypoint) => {
      await mkdir(path.join(samplesDir, id));
      await writeFile(path.join(samplesDir, id, "sample.json"), JSON.stringify({ ...sample, id, entrypoint }));
    };
    await write("built-ok", { type: "browser", command: "index.html", build: BUILD });
    let run = spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts", "validate-manifests.mjs"), samplesDir], { encoding: "utf8", env: { ...process.env, KEY_LIST_URL: "" } });
    assert.equal(run.status, 0, run.stderr);

    await write("built-node", { type: "node", command: "node index.mjs", build: BUILD });
    await write("built-escape", { type: "browser", command: "index.html", build: { ...BUILD, outputDir: "../elsewhere" } });
    run = spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts", "validate-manifests.mjs"), samplesDir], { encoding: "utf8", env: { ...process.env, KEY_LIST_URL: "" } });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /built-node\/sample\.json\n {2}- entrypoint\.build is only allowed with entrypoint\.type "browser"/);
    assert.match(run.stderr, /built-escape\/sample\.json\n {2}- entrypoint\.build\.outputDir "\.\.\/elsewhere" escapes the sample directory/);
    assert.doesNotMatch(run.stderr, /built-ok/);
  } finally {
    await rm(samplesDir, { recursive: true, force: true });
  }
});

test("a built sample stages its build output from committed bytes, with provenance", async () => {
  const { root, commit } = await fixtureRepo();
  try {
    // Working-tree edits and untracked files must never reach the staged app.
    await writeFile(path.join(root, "samples/demo/index.html"), `${INDEX}<!-- uncommitted edit -->`);
    await writeFile(path.join(root, "samples/demo/src/extra.ts"), `fetch("https://other.example.org/x");`);
    const { destDir, result } = await stage(root, commit);
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual(result.app.files.map((f) => f.path), ["assets/app.js", "index.html"]);
    assert.equal(await readFile(path.join(destDir, "index.html"), "utf8"), INDEX);
    assert.equal(result.app.files.find((f) => f.path === "index.html").sha256, sha256(Buffer.from(INDEX)));
    assert.equal(result.app.entrypoint, "index.html");
    // The bundle's services.arcgisonline.com literal is not a data origin: only source is scanned.
    assert.deepEqual(result.app.dataOrigins, ["https://demo.honua.io"]);
    assert.deepEqual(result.app.builtFrom, {
      commit,
      path: "samples/demo",
      build: { command: "node build.mjs", outputDir: "dist", lockfile: "package-lock.json", lockfileSha256: sha256(Buffer.from(LOCK)) },
    });
    // The build ran in an export, not the working tree.
    await assert.rejects(readFile(path.join(root, "samples/demo/dist/index.html")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a second data origin in a committed .ts source fails a built sample", async () => {
  const { root, commit } = await fixtureRepo({ "samples/demo/src/geocode.ts": `export const url: string = "https://other.example.org/search";\n` });
  try {
    const { destDir, result } = await stage(root, commit);
    assert.equal(result.ok, false);
    assert.match(result.reason, /exactly one data origin; found https:\/\/demo\.honua\.io, https:\/\/other\.example\.org/);
    await assert.rejects(readFile(path.join(destDir, "index.html")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("symlinks and escaping output are refused", async () => {
  const cases = [
    [`import { symlinkSync } from "node:fs";\n${BUILD_SCRIPT}symlinkSync("/etc/hostname", "dist/assets/leak.txt");\n`, /dist\/assets\/leak\.txt is a symlink/],
    [`import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";\nmkdirSync("real"); writeFileSync("real/index.html", "");\nsymlinkSync("real", "dist");\n`, /samples\/demo\/dist is not a real directory/],
    [`import { mkdirSync, writeFileSync } from "node:fs";\nmkdirSync("dist"); writeFileSync("dist/other.html", "");\n`, /did not produce samples\/demo\/dist\/index\.html/],
    [`process.exit(3);\n`, /build command "node build\.mjs" failed/],
  ];
  for (const [script, pattern] of cases) {
    const { root, commit } = await fixtureRepo({ "samples/demo/build.mjs": script });
    try {
      const { result } = await stage(root, commit);
      assert.equal(result.ok, false, script);
      assert.match(result.reason, pattern);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
  const { root, commit } = await fixtureRepo();
  try {
    const { result } = await stage(root, commit, builtManifest({ ...BUILD, outputDir: "../../out" }));
    assert.equal(result.ok, false);
    assert.match(result.reason, /escapes the sample directory/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a built sample without a committed lockfile is refused", async () => {
  const { root, commit } = await fixtureRepo({ "samples/demo/package-lock.json": null });
  try {
    const { result } = await stage(root, commit);
    assert.equal(result.ok, false);
    assert.match(result.reason, /package-lock\.json is not committed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a sample without entrypoint.build stages exactly as before", async () => {
  const page = `<!doctype html><script>fetch("https://demo.honua.io/x")</script>`;
  const { root, commit } = await fixtureRepo({
    "samples/demo/src/index.html": page,
    // Static samples keep their committed-file scan: TypeScript is not read,
    // and build.mjs is never run.
    "samples/demo/src/types.ts": `const u = "https://other.example.org";`,
  });
  try {
    const { destDir, result } = await stage(root, commit, { id: "demo", dataMode: "public-live", entrypoint: { type: "browser", command: "src/index.html" } });
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual(result.app.builtFrom, { commit, path: "samples/demo/src" });
    assert.deepEqual(result.app.files.map((f) => f.path), ["index.html", "main.ts", "types.ts"]);
    assert.deepEqual(result.app.dataOrigins, ["https://demo.honua.io"]);
    assert.equal(await readFile(path.join(destDir, "index.html"), "utf8"), page);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
