#!/usr/bin/env node
// Joins samples/<id>/sample.json manifests with the latest
// results/run-results.v1.json envelope into samples-coverage.v1.json: the
// producer snapshot honua-evidence's capability matrix ingests, keyed by
// capability -> covering sample(s) (honua-io/honua-samples#5).
//
// Zero npm dependencies, matching the rest of this repo's scripts. Capability
// keys are validated against the same canonical key list
// scripts/validate-manifests.mjs uses (KEY_LIST_URL env var, falling back to
// the pinned fixture -- see scripts/lib/capability-keys.mjs) so a typo'd key
// can never leak into the published snapshot, even on a run where
// validate.yml hasn't gated the manifest first (e.g. the nightly
// run-samples schedule).
//
// Capabilities with zero covering samples are never emitted -- the
// `capabilities` map only contains keys with >=1 entry, so honua-evidence's
// matrix renders missing coverage honestly instead of as a padded gap.
//
// Env vars (all optional):
//   SAMPLES_DIR       default "samples"
//   RUN_RESULTS_PATH  default "results/run-results.v1.json" (scripts/run-samples.mjs's output;
//                     missing is tolerated -- coverage is emitted without lastRun info)
//   OUT_PATH          default "coverage/samples-coverage.v1.json"
//   KEY_LIST_URL      see scripts/lib/capability-keys.mjs

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCapabilityKeyList } from "./lib/capability-keys.mjs";
import { validateAgainstSchema } from "./lib/mini-schema.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SCHEMA_PATH = path.join(REPO_ROOT, "schemas", "samples-coverage.v1.schema.json");
const SAMPLES_DIR = path.resolve(REPO_ROOT, process.env.SAMPLES_DIR ?? "samples");
const RUN_RESULTS_PATH = path.resolve(
  REPO_ROOT,
  process.env.RUN_RESULTS_PATH ?? "results/run-results.v1.json",
);
const OUT_PATH = path.resolve(
  REPO_ROOT,
  process.env.OUT_PATH ?? "coverage/samples-coverage.v1.json",
);
const GALLERY_BASE_URL = "https://samples.honua.io";

async function main() {
  const { keys: capabilityKeys, source: keyListSource } = await loadCapabilityKeyList();
  const manifests = await loadManifests();
  const resultsById = await loadLatestResults();

  const capabilities = {};
  let droppedUnknownKeys = 0;

  for (const { dirName, manifest } of manifests) {
    const result = resultsById.get(manifest.id);
    const entry = {
      id: manifest.id,
      title: manifest.title,
      url: `${GALLERY_BASE_URL}/${manifest.id}`,
      sdks: manifest.sdks,
      edition: manifest.edition ?? "community",
      ...(result ? { lastRun: result } : {}),
    };

    for (const key of manifest.capabilities ?? []) {
      if (!capabilityKeys.has(key)) {
        console.warn(
          `generate-samples-coverage: skipping unknown capability key "${key}" from samples/${dirName}/sample.json (not in ${keyListSource}) -- run scripts/validate-manifests.mjs to find and fix it`,
        );
        droppedUnknownKeys++;
        continue;
      }
      (capabilities[key] ??= []).push(entry);
    }
  }

  const snapshot = {
    schemaVersion: "samples-coverage.v1",
    generatedAt: new Date().toISOString(),
    capabilities,
  };

  await selfCheck(snapshot);

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

  const capCount = Object.keys(capabilities).length;
  console.log(
    `generate-samples-coverage: wrote ${capCount} covered capability key(s) from ${manifests.length} sample(s) to ${path.relative(REPO_ROOT, OUT_PATH)} (keys validated against ${keyListSource})`,
  );
  if (droppedUnknownKeys > 0) {
    console.warn(
      `generate-samples-coverage: dropped ${droppedUnknownKeys} unknown capability key reference(s) -- see warnings above.`,
    );
  }
}

async function loadManifests() {
  let entries;
  try {
    entries = await readdir(SAMPLES_DIR, { withFileTypes: true });
  } catch (err) {
    throw new Error(`cannot read samples directory ${SAMPLES_DIR}: ${err.message}`);
  }
  const dirNames = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  const manifests = [];
  for (const dirName of dirNames) {
    const manifestPath = path.join(SAMPLES_DIR, dirName, "sample.json");
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifests.push({ dirName, manifest });
    } catch (err) {
      console.warn(
        `generate-samples-coverage: skipping samples/${dirName}/ -- could not read/parse sample.json: ${err.message}`,
      );
    }
  }
  return manifests;
}

/**
 * @returns {Promise<Map<string, { outcome: string, serverVersion: string, at: string }>>}
 *   keyed by sample id. Entries in run-results.v1.json for sample ids that no
 *   longer exist (a sample was deleted/renamed since that run) are silently
 *   unused -- they're simply never looked up.
 */
async function loadLatestResults() {
  let raw;
  try {
    raw = await readFile(RUN_RESULTS_PATH, "utf8");
  } catch {
    console.warn(
      `generate-samples-coverage: no run results at ${path.relative(REPO_ROOT, RUN_RESULTS_PATH)} -- coverage will list samples without lastRun info (has scripts/run-samples.mjs run yet?)`,
    );
    return new Map();
  }

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON in ${RUN_RESULTS_PATH}: ${err.message}`);
  }

  const resultsById = new Map();
  for (const result of envelope.results ?? []) {
    if (!result?.id) continue;
    resultsById.set(result.id, {
      outcome: result.outcome,
      serverVersion: result.serverVersion,
      at: envelope.generatedAt,
    });
  }
  return resultsById;
}

async function selfCheck(snapshot) {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
  const errors = [];
  validateAgainstSchema(schema, snapshot, "$", errors);
  if (errors.length > 0) {
    throw new Error(
      `generated snapshot failed self-validation against ${path.relative(REPO_ROOT, SCHEMA_PATH)} (this is a bug in generate-samples-coverage.mjs, not the input data):\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
  }
}

main().catch((err) => {
  console.error(`generate-samples-coverage: ${err.message}`);
  process.exitCode = 1;
});
