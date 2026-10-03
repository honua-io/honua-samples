#!/usr/bin/env node
// Headless sample runner (honua-io/honua-samples#2).
//
// Executes every samples/<id>/sample.json with status "active" against an
// already-composed Honua server (see docker/compose.yml,
// docker/compose.pro.yml, and .github/workflows/run-samples.yml), and writes
// a per-sample result envelope to results/run-results.v1.json for
// honua-evidence to ingest.
//
// Three things beyond the original scaffold (see this repo's #2 for the
// full history):
//   - `entrypoint.type: "browser"` samples are proven by their Playwright
//     specs (samples/<id>/verify/*.spec.mjs, scripts/lib/browser-lane.mjs,
//     docs/browser-verification/) against the composed server. They get one
//     attempt -- a failed spec is never retried to green -- and each also
//     gets its own run-results.v1 envelope under results/browser-verification/.
//   - `--edition <community|pro|enterprise>` (default "community") gates
//     which samples actually execute: a sample whose manifest `edition`
//     exceeds this is recorded with outcome "skipped", never run. Pair with
//     `docker compose -f docker/compose.yml -f docker/compose.pro.yml` (see
//     that file) to actually grant a higher edition to the composed server.
//   - Every non-browser sample gets up to HONUA_SAMPLE_MAX_ATTEMPTS attempts
//     (default 2, i.e. one retry) on failure; every attempt is recorded in the result's
//     `attempts[]`, and a pass that only happened after a retry is flagged
//     `flaky: true` so nightly runs can call it out separately from a clean
//     pass.
//
// Zero npm dependencies for everything except the browser lane: fetch is a
// Node >=18 built-in, everything else is node:child_process/node:fs/node:http.
// Playwright (locked in package.json) is the one exception; see
// scripts/lib/browser-lane.mjs.

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgainstSchema } from "./lib/mini-schema.mjs";
import { assertPlaywrightInstalled, runPlaywrightSample } from "./lib/browser-lane.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SAMPLES_DIR = path.join(REPO_ROOT, "samples");
const RESULTS_DIR = path.join(REPO_ROOT, "results");
const RESULTS_PATH = path.join(RESULTS_DIR, "run-results.v1.json");
const BROWSER_RESULTS_DIR = path.join(RESULTS_DIR, "browser-verification");
const SCHEMA_PATH = path.join(REPO_ROOT, "schemas", "run-results.v1.schema.json");

const BASE_URL = process.env.HONUA_BASE_URL ?? "http://localhost:8080";
const PUBLIC_BASE_URL = process.env.HONUA_PUBLIC_BASE_URL ?? "https://demo.honua.io";
const READY_TIMEOUT_MS = Number(process.env.HONUA_READY_TIMEOUT_MS ?? 120_000);
const READY_POLL_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = Math.max(1, Number(process.env.HONUA_SAMPLE_MAX_ATTEMPTS ?? 2));

const EDITION_RANK = { community: 0, pro: 1, enterprise: 2 };
let RUNNER_EDITION;
try {
  RUNNER_EDITION = parseEdition(getFlag("edition", process.env.HONUA_EDITION ?? "community"));
} catch (err) {
  console.error(`run-samples: ${err.message}`);
  process.exit(1);
}

async function main() {
  await waitForServerReady();
  const serverVersion = await fetchServerVersion();

  const sampleDirs = await listSampleDirs();
  const manifests = [];
  for (const dirName of sampleDirs) {
    const manifestPath = path.join(SAMPLES_DIR, dirName, "sample.json");
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      manifests.push({ dirName, manifest });
    } catch (err) {
      console.error(`run-samples: skipping samples/${dirName}/ -- could not read/parse sample.json: ${err.message}`);
    }
  }

  const active = manifests.filter(({ manifest }) => manifest.status === "active");
  const skippedManifests = manifests.filter(({ manifest }) => manifest.status !== "active");

  for (const { dirName, manifest } of skippedManifests) {
    console.log(`run-samples: skipping ${dirName} (status=${manifest.status})`);
  }

  console.log(
    `run-samples: executing ${active.length} active sample(s) against local ${BASE_URL} and public ${PUBLIC_BASE_URL} (server ${serverVersion}, runner edition "${RUNNER_EDITION}")`,
  );

  const hasBrowserSample = active.some(
    ({ manifest }) => requiredEdition(manifest) <= EDITION_RANK[RUNNER_EDITION] && manifest.entrypoint?.type === "browser",
  );

  if (hasBrowserSample) {
    const version = await assertPlaywrightInstalled({ repoRoot: REPO_ROOT });
    console.log(`run-samples: browser lane uses lockfile-managed @playwright/test ${version}`);
  }

  const results = [];
  for (const { dirName, manifest } of active) {
    // Per-spec detail stays out of the run-results.v1 shape; it is written
    // next to the browser sample's own envelope instead.
    const { specs, ...result } = await runSampleWithGating(dirName, manifest, serverVersion);
    results.push(result);
    if (manifest.entrypoint?.type === "browser") {
      await writeBrowserSampleEnvelope(dirName, result, specs, serverVersion);
    }
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  const envelope = runResultsEnvelope(serverVersion, results);
  await selfCheckEnvelope(envelope);
  await writeFile(RESULTS_PATH, JSON.stringify(envelope, null, 2) + "\n", "utf8");
  console.log(`run-samples: wrote ${results.length} result(s) to ${path.relative(REPO_ROOT, RESULTS_PATH)}`);

  const flaky = results.filter((r) => r.flaky);
  if (flaky.length > 0) {
    console.warn(`run-samples: ${flaky.length} sample(s) passed only after a retry (flaky): ${flaky.map((r) => r.id).join(", ")}`);
  }

  const failed = results.filter((r) => r.outcome === "fail");
  if (failed.length > 0) {
    console.error(`run-samples: ${failed.length} sample(s) failed: ${failed.map((r) => r.id).join(", ")}`);
    process.exitCode = 1;
  }
}

function runResultsEnvelope(serverVersion, results) {
  return {
    schema: "run-results.v1",
    generatedAt: new Date().toISOString(),
    serverVersion,
    baseUrl: BASE_URL,
    edition: RUNNER_EDITION,
    results,
  };
}

/**
 * Per-sample evidence for a browser sample: the same run-results.v1 envelope
 * the runner publishes, holding just this sample, next to the Playwright JSON
 * report the per-spec results came from.
 */
async function writeBrowserSampleEnvelope(dirName, result, specs, serverVersion) {
  await mkdir(BROWSER_RESULTS_DIR, { recursive: true });
  const envelope = runResultsEnvelope(serverVersion, [result]);
  await selfCheckEnvelope(envelope);
  const target = path.join(BROWSER_RESULTS_DIR, `${dirName}.run-results.v1.json`);
  await writeFile(target, JSON.stringify(envelope, null, 2) + "\n", "utf8");
  if (specs) {
    await writeFile(
      path.join(BROWSER_RESULTS_DIR, `${dirName}.specs.json`),
      JSON.stringify({ sample: result.id, outcome: result.outcome, specs }, null, 2) + "\n",
      "utf8",
    );
  }
  console.log(`run-samples: [${result.id}] wrote ${path.relative(REPO_ROOT, target)}`);
}

function requiredEdition(manifest) {
  const key = manifest.edition ?? "community";
  return EDITION_RANK[key] ?? EDITION_RANK.community;
}

async function runSampleWithGating(dirName, manifest, serverVersion) {
  if (requiredEdition(manifest) > EDITION_RANK[RUNNER_EDITION]) {
    const reason = `sample requires edition "${manifest.edition}" but runner is running as "${RUNNER_EDITION}"`;
    console.log(`run-samples: [${manifest.id}] skipped -- ${reason}`);
    return {
      id: manifest.id,
      capabilities: manifest.capabilities,
      outcome: "skipped",
      durationMs: 0,
      serverVersion,
      error: reason,
    };
  }
  return runSampleWithRetries(dirName, manifest, serverVersion);
}

async function runSampleWithRetries(dirName, manifest, serverVersion) {
  const isBrowser = manifest.entrypoint?.type === "browser";
  // Browser samples are judged by their Playwright specs, which never retry
  // (playwright.config.ts retries: 0); retrying the whole sample would be a
  // retry to green by another name.
  const maxAttempts = isBrowser ? 1 : MAX_ATTEMPTS;
  const attempts = [];
  let specs;
  for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
    if (attemptNum > 1) {
      console.log(`run-samples: [${manifest.id}] retrying (attempt ${attemptNum}/${maxAttempts})...`);
    }
    const started = Date.now();
    const attemptResult = isBrowser ? await runBrowserAttempt(dirName, manifest) : await runProcessAttempt(dirName, manifest);
    specs = attemptResult.specs;
    const durationMs = Date.now() - started;
    attempts.push({
      attempt: attemptNum,
      outcome: attemptResult.outcome,
      durationMs,
      ...(attemptResult.error ? { error: attemptResult.error } : {}),
    });
    if (attemptResult.outcome === "pass") {
      break;
    }
  }

  const finalAttempt = attempts[attempts.length - 1];
  const flaky = attempts.length > 1 && finalAttempt.outcome === "pass";

  return {
    id: manifest.id,
    capabilities: manifest.capabilities,
    outcome: finalAttempt.outcome,
    durationMs: finalAttempt.durationMs,
    serverVersion,
    ...(finalAttempt.error ? { error: finalAttempt.error } : {}),
    ...(flaky ? { flaky: true } : {}),
    attempts,
    ...(specs ? { specs } : {}),
  };
}

async function runBrowserAttempt(dirName, manifest) {
  // Browser specs always target the composed server (they seed their own
  // fixture into it); the admin key is only used by the harness to seed.
  console.log(`run-samples: [${manifest.id}] running Playwright verification samples/${dirName}/verify/ against ${BASE_URL}`);
  const run = await runPlaywrightSample({
    repoRoot: REPO_ROOT,
    dirName,
    outDir: BROWSER_RESULTS_DIR,
    env: { ...process.env, HONUA_BASE_URL: BASE_URL },
  });
  for (const spec of run.specs) {
    console.log(`run-samples: [${manifest.id}]   ${spec.outcome.toUpperCase()} ${spec.title}${spec.error ? ` -- ${spec.error}` : ""}`);
  }
  return run;
}

function runProcessAttempt(dirName, manifest) {
  return new Promise((resolve) => {
    const sampleCwd = path.join(SAMPLES_DIR, dirName);
    console.log(`run-samples: [${manifest.id}] running "${manifest.entrypoint.command}"`);

    // shell: true so quoted arguments in entrypoint.command survive; a naive
    // split(" ") breaks the first sample that needs one.
    const child = spawn(manifest.entrypoint.command, {
      cwd: sampleCwd,
      env: { ...process.env, HONUA_BASE_URL: targetBaseUrl(manifest) },
      stdio: "inherit",
      shell: true,
    });

    child.on("error", (err) => {
      resolve({ outcome: "fail", error: err.message });
    });

    child.on("exit", (code) => {
      resolve(code === 0 ? { outcome: "pass" } : { outcome: "fail", error: `exit code ${code}` });
    });
  });
}

function targetBaseUrl(manifest) {
  return manifest.dataMode === "public-live" ? PUBLIC_BASE_URL : BASE_URL;
}

async function listSampleDirs() {
  const entries = await readdir(SAMPLES_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

async function waitForServerReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/healthz/ready`);
      if (response.ok) {
        console.log(`run-samples: ${BASE_URL}/healthz/ready is ready`);
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(READY_POLL_INTERVAL_MS);
  }
  throw new Error(
    `server at ${BASE_URL} did not become ready within ${READY_TIMEOUT_MS}ms: ${lastError?.message}`,
  );
}

async function fetchServerVersion() {
  // /api/v1/admin/version requires the admin API key; best-effort only --
  // falls back to "unknown" rather than failing the run, since server
  // version is metadata on the result envelope, not a correctness gate.
  const adminApiKey = process.env.HONUA_ADMIN_API_KEY;
  if (!adminApiKey) {
    return "unknown";
  }
  try {
    const response = await fetch(`${BASE_URL}/api/v1/admin/version`, {
      headers: { "X-API-Key": adminApiKey },
    });
    if (!response.ok) {
      return "unknown";
    }
    const body = await response.json();
    return body?.data?.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function selfCheckEnvelope(envelope) {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
  const errors = [];
  validateAgainstSchema(schema, envelope, "$", errors);
  if (errors.length > 0) {
    throw new Error(
      `generated run-results envelope failed self-validation against ${path.relative(REPO_ROOT, SCHEMA_PATH)} (this is a bug in run-samples.mjs, not the samples):\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
  }
}

function getFlag(name, fallback) {
  const args = process.argv.slice(2);
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] !== undefined) {
    return args[idx + 1];
  }
  return fallback;
}

function parseEdition(value) {
  if (!(value in EDITION_RANK)) {
    throw new Error(`invalid --edition "${value}" -- must be one of ${Object.keys(EDITION_RANK).join(", ")}`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(`run-samples: ${err.message}`);
  process.exitCode = 1;
});
