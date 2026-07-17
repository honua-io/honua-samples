#!/usr/bin/env node
// Validates every samples/<id>/sample.json against schemas/sample.v1.schema.json
// and against the canonical capability key list.
//
// Zero npm dependencies on purpose: this hand-rolls the small subset of JSON
// Schema (draft-07) keywords sample.v1.schema.json actually uses. See
// scripts/lib/mini-schema.mjs for the engine itself (shared with
// scripts/generate-samples-coverage.mjs's self-check of its own output) and
// scripts/lib/capability-keys.mjs for the capability key list loader (also
// shared with generate-samples-coverage.mjs).
//
// Capability key list resolution order:
//   1. KEY_LIST_URL env var, if set to an http(s) URL -- fetched at run time.
//      This is the one-line swap point for honua-io/honua-server#2893's
//      published capability-keys.v1.json once it lands.
//   2. schemas/fixtures/capability-keys.fixture.json -- the pinned fixture
//      committed in this repo (see the loud comment in that file).

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCapabilityKeyList } from "./lib/capability-keys.mjs";
import { validateAgainstSchema } from "./lib/mini-schema.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SCHEMA_PATH = path.join(REPO_ROOT, "schemas", "sample.v1.schema.json");

/**
 * @param {string} samplesDirArg
 */
async function main(samplesDirArg) {
  const samplesDir = path.resolve(REPO_ROOT, samplesDirArg ?? "samples");

  const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
  const { keys: capabilityKeys, source: keyListSource } =
    await loadCapabilityKeyList();

  const sampleDirs = await listSampleDirs(samplesDir);

  /** @type {Map<string, string[]>} */
  const errorsByFile = new Map();
  let manifestCount = 0;

  for (const dirName of sampleDirs) {
    const manifestPath = path.join(samplesDir, dirName, "sample.json");
    const relPath = path.relative(REPO_ROOT, manifestPath);
    const fileErrors = [];

    let raw;
    try {
      raw = await readFile(manifestPath, "utf8");
    } catch {
      // No sample.json in this sample directory at all.
      errorsByFile.set(relPath, [
        `no sample.json found in samples/${dirName}/`,
      ]);
      continue;
    }

    manifestCount++;

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      errorsByFile.set(relPath, [`invalid JSON: ${err.message}`]);
      continue;
    }

    validateAgainstSchema(schema, data, "$", fileErrors);

    // Directory-name / id match (independent of schema validity, but only
    // meaningful once `id` is at least a string).
    if (typeof data?.id === "string" && data.id !== dirName) {
      fileErrors.push(
        `id "${data.id}" does not match directory name "${dirName}"`,
      );
    }

    // Capability keys must be members of the canonical key list.
    if (Array.isArray(data?.capabilities)) {
      for (const key of data.capabilities) {
        if (typeof key === "string" && !capabilityKeys.has(key)) {
          fileErrors.push(
            `unknown capability key "${key}" (not in ${keyListSource})`,
          );
        }
      }
    }

    if (fileErrors.length > 0) {
      errorsByFile.set(relPath, fileErrors);
    }
  }

  report(errorsByFile, manifestCount, capabilityKeys.size, keyListSource);

  return errorsByFile.size === 0;
}

async function listSampleDirs(samplesDir) {
  let entries;
  try {
    entries = await readdir(samplesDir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`cannot read samples directory ${samplesDir}: ${err.message}`);
  }
  const dirs = [];
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      dirs.push(entry.name);
    }
  }
  return dirs.sort();
}

// ---- reporting --------------------------------------------------------

function report(errorsByFile, manifestCount, keyListSize, keyListSource) {
  console.log(`Checked ${manifestCount} manifest(s) against ${keyListSize} known capability key(s) from ${keyListSource}.`);

  if (errorsByFile.size === 0) {
    console.log("All sample manifests are valid.");
    return;
  }

  console.error(`\n${errorsByFile.size} manifest(s) failed validation:\n`);
  for (const [file, errors] of errorsByFile) {
    console.error(file);
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
  }
}

const samplesDirArg = process.argv[2];
main(samplesDirArg)
  .then((ok) => {
    process.exit(ok ? 0 : 1);
  })
  .catch((err) => {
    console.error(`validate-manifests: ${err.message}`);
    process.exit(1);
  });
