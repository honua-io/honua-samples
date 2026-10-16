#!/usr/bin/env node
// GP process template contract (honua-io/honua-samples#65).
//
// templates/gp-python and templates/gp-dotnet are the source that
// `honua-gp-devkit init` mirrors (honua-io/honua-server#6217). Each template
// carries a TEMPLATE-MANIFEST.json listing every file with its SHA-256 so the
// devkit side can verify its embedded copy byte for byte and so a template edit
// that forgets the manifest fails `check` here instead of drifting silently.
//
//   node scripts/gp-templates.mjs check    # validate layout + manifest digests (CI)
//   node scripts/gp-templates.mjs update   # rewrite TEMPLATE-MANIFEST.json files
//   node scripts/gp-templates.mjs print    # emit the manifests as JSON on stdout
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATES_DIR = path.join(REPO_ROOT, "templates");
export const MANIFEST_NAME = "TEMPLATE-MANIFEST.json";
export const MANIFEST_SCHEMA = "honua.gp-template-manifest.v1";

// Required layout for every GP process template: the contract `init` scaffolds.
export const REQUIRED_FILES = {
  "gp-python": [
    "README.md",
    "process/summary_tool.py",
    "schema/inputs.schema.json",
    "schema/outputs.schema.json",
    "fixtures/params.json",
    "fixtures/input.geojson",
    "fixtures/invalid-input.geojson",
    "expected/summary.json",
    "expected/golden.json",
    "tests/test_golden.py",
    "requirements.lock",
    ".vscode/launch.json",
    ".vscode/tasks.json",
    "docker/compose.debug.yaml",
  ],
  "gp-dotnet": [
    "README.md",
    "Directory.Build.props",
    "process/SummaryTool.cs",
    "process/SummaryTool.csproj",
    "schema/inputs.schema.json",
    "schema/outputs.schema.json",
    "fixtures/params.json",
    "fixtures/input.geojson",
    "fixtures/invalid-input.geojson",
    "expected/summary.json",
    "expected/golden.json",
    "tests/SummaryTool.Tests/SummaryTool.Tests.csproj",
    "tests/SummaryTool.Tests/GoldenTests.cs",
    "tests/SummaryTool.Tests/packages.lock.json",
    ".vscode/launch.json",
    ".vscode/tasks.json",
    "docker/compose.debug.yaml",
  ],
};

// Build outputs and local runs never belong in a template manifest.
const IGNORED_SEGMENTS = new Set(["bin", "obj", ".honua", "__pycache__", "node_modules", ".pytest_cache"]);

async function listFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (IGNORED_SEGMENTS.has(entry.name) || entry.name.startsWith(".venv")) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(root, rel)));
    else if (entry.isFile() && entry.name !== MANIFEST_NAME) files.push(rel);
  }
  return files;
}

async function digest(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export async function buildManifest(templateId) {
  const root = path.join(TEMPLATES_DIR, templateId);
  const files = await listFiles(root);
  const entries = [];
  for (const rel of files) {
    const abs = path.join(root, rel);
    entries.push({ path: rel, sha256: await digest(abs), sizeBytes: (await stat(abs)).size });
  }
  return { schemaVersion: MANIFEST_SCHEMA, template: templateId, files: entries };
}

export async function readManifest(templateId) {
  return JSON.parse(await readFile(path.join(TEMPLATES_DIR, templateId, MANIFEST_NAME), "utf8"));
}

export async function checkTemplate(templateId) {
  const problems = [];
  const required = REQUIRED_FILES[templateId];
  if (!required) return [`unknown template ${templateId}`];
  const actual = await buildManifest(templateId);
  const present = new Set(actual.files.map((f) => f.path));
  for (const file of required) {
    if (!present.has(file)) problems.push(`${templateId}: required file missing: ${file}`);
  }
  let committed;
  try {
    committed = await readManifest(templateId);
  } catch (error) {
    return [...problems, `${templateId}: ${MANIFEST_NAME} unreadable (${error.message}); run: node scripts/gp-templates.mjs update`];
  }
  if (committed.schemaVersion !== MANIFEST_SCHEMA) problems.push(`${templateId}: manifest schemaVersion ${committed.schemaVersion} != ${MANIFEST_SCHEMA}`);
  if (committed.template !== templateId) problems.push(`${templateId}: manifest template ${committed.template} != ${templateId}`);
  const committedByPath = new Map((committed.files ?? []).map((f) => [f.path, f]));
  for (const file of actual.files) {
    const entry = committedByPath.get(file.path);
    if (!entry) problems.push(`${templateId}: ${file.path} is not in ${MANIFEST_NAME}`);
    else if (entry.sha256 !== file.sha256) problems.push(`${templateId}: ${file.path} changed (manifest ${entry.sha256.slice(0, 12)}, file ${file.sha256.slice(0, 12)})`);
    committedByPath.delete(file.path);
  }
  for (const stale of committedByPath.keys()) problems.push(`${templateId}: ${stale} is in ${MANIFEST_NAME} but missing from the template`);
  // The golden digest must describe the committed golden artifact.
  try {
    const golden = JSON.parse(await readFile(path.join(TEMPLATES_DIR, templateId, "expected/golden.json"), "utf8"));
    const artifact = path.join(TEMPLATES_DIR, templateId, "expected", golden.artifact);
    const actualDigest = await digest(artifact);
    if (golden.sha256 !== actualDigest) problems.push(`${templateId}: expected/golden.json sha256 ${golden.sha256} != expected/${golden.artifact} (${actualDigest})`);
    if (!golden.harness || !golden.harnessVersion) problems.push(`${templateId}: expected/golden.json must record harness and harnessVersion`);
  } catch (error) {
    problems.push(`${templateId}: expected/golden.json unreadable or invalid (${error.message})`);
  }
  for (const fixture of ["fixtures/params.json", "fixtures/input.geojson", "fixtures/invalid-input.geojson", "schema/inputs.schema.json"]) {
    try {
      JSON.parse(await readFile(path.join(TEMPLATES_DIR, templateId, fixture), "utf8"));
    } catch (error) {
      problems.push(`${templateId}: ${fixture} is not valid JSON (${error.message})`);
    }
  }
  if (problems.some((p) => p.includes("changed") || p.includes("not in") || p.includes("missing from"))) {
    problems.push(`${templateId}: run: node scripts/gp-templates.mjs update (and review the diff)`);
  }
  return problems;
}

export async function updateTemplate(templateId) {
  const manifest = await buildManifest(templateId);
  await writeFile(path.join(TEMPLATES_DIR, templateId, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function main(argv) {
  const command = argv[0] ?? "check";
  const ids = Object.keys(REQUIRED_FILES);
  if (command === "update") {
    for (const id of ids) {
      const manifest = await updateTemplate(id);
      console.log(`gp-templates: wrote ${id}/${MANIFEST_NAME} (${manifest.files.length} files)`);
    }
    return 0;
  }
  if (command === "print") {
    const out = {};
    for (const id of ids) out[id] = await buildManifest(id);
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }
  if (command !== "check") {
    console.error(`gp-templates: unknown command ${command} (check | update | print)`);
    return 2;
  }
  let failed = false;
  for (const id of ids) {
    const problems = await checkTemplate(id);
    if (problems.length === 0) {
      console.log(`gp-templates: ${id} OK`);
      continue;
    }
    failed = true;
    for (const problem of problems) console.error(`::error::${problem}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
