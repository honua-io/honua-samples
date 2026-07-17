// Shared capability-key-list loader for scripts/validate-manifests.mjs and
// scripts/generate-samples-coverage.mjs.
//
// Resolution order:
//   1. KEY_LIST_URL env var, if set to an http(s) URL -- fetched at run time.
//      This is the swap point for honua-io/honua-server#2893's published
//      capability-keys.v1.json (wired as the KEY_LIST_URL repo variable in
//      .github/workflows/validate.yml and .github/workflows/run-samples.yml).
//   2. schemas/fixtures/capability-keys.fixture.json -- the pinned fixture
//      committed in this repo (see the loud comment in that file), used when
//      KEY_LIST_URL is unset (e.g. a local run with no env configured).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE_KEY_LIST_PATH = path.join(
  REPO_ROOT,
  "schemas",
  "fixtures",
  "capability-keys.fixture.json",
);

export async function loadCapabilityKeyList() {
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
 * Accepts a bare array of keys, an object with a `keys` array, or the
 * canonical capability-keys.v1.json shape from honua-server#2893
 * (`{ capabilities: [{ key, ... }] }`).
 */
export function toKeySet(json) {
  if (Array.isArray(json)) {
    return new Set(json);
  }
  if (json && Array.isArray(json.keys)) {
    return new Set(json.keys);
  }
  if (json && Array.isArray(json.capabilities)) {
    return new Set(json.capabilities.map((c) => c.key));
  }
  throw new Error(
    "capability key list must be a JSON array of strings, or an object with a `keys` array",
  );
}
