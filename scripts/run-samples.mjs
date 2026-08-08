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
//   - `entrypoint.type: "browser"` samples run headless via Playwright
//     against a tiny static server (scripts/lib/browser-lane.mjs).
//   - `--edition <community|pro|enterprise>` (default "community") gates
//     which samples actually execute: a sample whose manifest `edition`
//     exceeds this is recorded with outcome "skipped", never run. Pair with
//     `docker compose -f docker/compose.yml -f docker/compose.pro.yml` (see
//     that file) to actually grant a higher edition to the composed server.
//   - Every sample gets up to HONUA_SAMPLE_MAX_ATTEMPTS attempts (default 2,
//     i.e. one retry) on failure; every attempt is recorded in the result's
//     `attempts[]`, and a pass that only happened after a retry is flagged
//     `flaky: true` so nightly runs can call it out separately from a clean
//     pass.
//
// Zero npm dependencies for everything except the browser lane: fetch is a
// Node >=18 built-in, everything else is node:child_process/node:fs/node:http.
// See scripts/lib/browser-lane.mjs for why Playwright is the one exception
// and how it's kept out of any package.json.

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgainstSchema } from "./lib/mini-schema.mjs";
import { ensureBrowserReady, runBrowserSample, startStaticServer } from "./lib/browser-lane.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SAMPLES_DIR = path.join(REPO_ROOT, "samples");
const RESULTS_DIR = path.join(REPO_ROOT, "results");
const RESULTS_PATH = path.join(RESULTS_DIR, "run-results.v1.json");
const SCHEMA_PATH = path.join(REPO_ROOT, "schemas", "run-results.v1.schema.json");

const BASE_URL = process.env.HONUA_BASE_URL ?? "http://localhost:8080";
const PUBLIC_BASE_URL = process.env.HONUA_PUBLIC_BASE_URL ?? "https://demo.honua.io";
const READY_TIMEOUT_MS = Number(process.env.HONUA_READY_TIMEOUT_MS ?? 120_000);
const READY_POLL_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = Math.max(1, Number(process.env.HONUA_SAMPLE_MAX_ATTEMPTS ?? 2));
const BROWSER_STATIC_PORT = Number(process.env.HONUA_BROWSER_STATIC_PORT ?? 3000);
const BROWSER_TIMEOUT_MS = Number(process.env.HONUA_BROWSER_TIMEOUT_MS ?? 30_000);

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

  /** @type {{ browser: import("playwright").Browser, close: () => Promise<void> } | undefined} */
  let browserLane;
  if (hasBrowserSample) {
    browserLane = await setUpBrowserLane();
  }

  const results = [];
  try {
    for (const { dirName, manifest } of active) {
      results.push(await runSampleWithGating(dirName, manifest, serverVersion, browserLane));
    }
  } finally {
    if (browserLane) {
      await browserLane.close();
    }
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  const envelope = {
    schema: "run-results.v1",
    generatedAt: new Date().toISOString(),
    serverVersion,
    baseUrl: BASE_URL,
    edition: RUNNER_EDITION,
    results,
  };
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

async function setUpBrowserLane() {
  const chromium = await ensureBrowserReady({ repoRoot: REPO_ROOT, log: console.log });
  const staticServer = await startStaticServer({ rootDir: SAMPLES_DIR, port: BROWSER_STATIC_PORT });
  console.log(`run-samples: browser lane static server listening at ${staticServer.url}`);
  const browser = await chromium.launch();
  return {
    browser,
    async close() {
      await browser.close();
      await staticServer.close();
    },
  };
}

function requiredEdition(manifest) {
  const key = manifest.edition ?? "community";
  return EDITION_RANK[key] ?? EDITION_RANK.community;
}

async function runSampleWithGating(dirName, manifest, serverVersion, browserLane) {
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
  return runSampleWithRetries(dirName, manifest, serverVersion, browserLane);
}

async function runSampleWithRetries(dirName, manifest, serverVersion, browserLane) {
  const attempts = [];
  for (let attemptNum = 1; attemptNum <= MAX_ATTEMPTS; attemptNum++) {
    if (attemptNum > 1) {
      console.log(`run-samples: [${manifest.id}] retrying (attempt ${attemptNum}/${MAX_ATTEMPTS})...`);
    }
    const started = Date.now();
    const attemptResult =
      manifest.entrypoint?.type === "browser"
        ? await runBrowserAttempt(dirName, manifest, browserLane)
        : await runProcessAttempt(dirName, manifest);
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
  };
}

async function runBrowserAttempt(dirName, manifest, browserLane) {
  const sampleUrl = new URL(`${dirName}/${manifest.entrypoint.command}`, `http://localhost:${BROWSER_STATIC_PORT}/`);
  sampleUrl.searchParams.set("baseUrl", targetBaseUrl(manifest));
  if (process.env.HONUA_ADMIN_API_KEY) {
    sampleUrl.searchParams.set("apiKey", process.env.HONUA_ADMIN_API_KEY);
  }
  console.log(`run-samples: [${manifest.id}] opening ${sampleUrl} (headless browser)`);
  return runBrowserSample({ browser: browserLane.browser, url: sampleUrl.toString(), timeoutMs: BROWSER_TIMEOUT_MS });
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
