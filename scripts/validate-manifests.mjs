#!/usr/bin/env node
// Validates every samples/<id>/sample.json against schemas/sample.v1.schema.json
// and against the canonical capability key list.
//
// Zero npm dependencies on purpose: this hand-rolls the small subset of JSON
// Schema (draft-07) keywords sample.v1.schema.json actually uses (type,
// required, properties, additionalProperties, items, enum, pattern,
// minLength, minItems, uniqueItems). If the schema grows real conditional
// logic (allOf/oneOf/$ref/etc.) swap this for ajv rather than extending the
// mini-engine below.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SCHEMA_PATH = path.join(REPO_ROOT, "schemas", "sample.v1.schema.json");
const FIXTURE_KEY_LIST_PATH = path.join(
  REPO_ROOT,
  "schemas",
  "fixtures",
  "capability-keys.fixture.json",
);

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

async function loadCapabilityKeyList() {
  const url = process.env.KEY_LIST_URL?.trim();

  if (url) {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(
        `KEY_LIST_URL is set to "${url}" but is not an http(s) URL. ` +
          `Unset it to fall back to the local fixture, or point it at the published capability-keys.v1.json.`,
      );
    }
    let response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new Error(
        `failed to fetch KEY_LIST_URL (${url}): ${err.message}`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `KEY_LIST_URL (${url}) returned HTTP ${response.status}`,
      );
    }
    const json = await response.json();
    return { keys: toKeySet(json), source: `KEY_LIST_URL (${url})` };
  }

  const json = JSON.parse(await readFile(FIXTURE_KEY_LIST_PATH, "utf8"));
  return {
    keys: toKeySet(json),
    source: "schemas/fixtures/capability-keys.fixture.json (pinned fixture -- see KEY_LIST_URL)",
  };
}

/**
 * Accepts either a bare array of keys or an object with a `keys` array, so
 * this keeps working unchanged once the real honua-server#2893 artifact
 * format is known.
 */
function toKeySet(json) {
  if (Array.isArray(json)) {
    return new Set(json);
  }
  if (json && Array.isArray(json.keys)) {
    return new Set(json.keys);
  }
  throw new Error(
    "capability key list must be a JSON array of strings, or an object with a `keys` array",
  );
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

// ---- minimal JSON Schema (draft-07 subset) validator ----------------------

/**
 * @param {any} schema
 * @param {any} value
 * @param {string} pathLabel
 * @param {string[]} errors
 */
function validateAgainstSchema(schema, value, pathLabel, errors) {
  if (schema.type) {
    const actual = jsonType(value);
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.includes(actual)) {
      errors.push(
        `${pathLabel}: expected type ${expected.join(" | ")}, got ${actual}`,
      );
      return; // further checks would be misleading against the wrong type
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(
      `${pathLabel}: value ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`,
    );
  }

  if (typeof value === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(
        `${pathLabel}: "${value}" does not match pattern ${schema.pattern}`,
      );
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${pathLabel}: string is shorter than minLength ${schema.minLength}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${pathLabel}: array has fewer than minItems ${schema.minItems}`);
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const key = typeof item === "object" ? JSON.stringify(item) : item;
        if (seen.has(key)) {
          errors.push(`${pathLabel}: array items must be unique (duplicate ${JSON.stringify(item)})`);
        }
        seen.add(key);
      }
    }
    if (schema.items) {
      value.forEach((item, i) => {
        validateAgainstSchema(schema.items, item, `${pathLabel}[${i}]`, errors);
      });
    }
  }

  if (schema.type === "object" || (value && typeof value === "object" && !Array.isArray(value) && schema.properties)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const requiredKey of schema.required ?? []) {
        if (!(requiredKey in value)) {
          errors.push(`${pathLabel}: missing required property "${requiredKey}"`);
        }
      }
      if (schema.additionalProperties === false && schema.properties) {
        for (const key of Object.keys(value)) {
          if (!(key in schema.properties)) {
            errors.push(`${pathLabel}: unexpected additional property "${key}"`);
          }
        }
      }
      for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
        if (key in value) {
          validateAgainstSchema(subSchema, value[key], `${pathLabel}.${key}`, errors);
        }
      }
    }
  }
}

function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value; // "object" | "string" | "number" | "boolean" | "undefined"
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
