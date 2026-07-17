#!/usr/bin/env node
// Headless sample runner (scaffold for honua-io/honua-samples#2).
//
// Executes every samples/<id>/sample.json with status "active" against an
// already-composed Honua server (see docker/compose.yml and
// .github/workflows/run-samples.yml), and writes a per-sample result
// envelope to results/run-results.v1.json for honua-evidence to ingest.
//
// Zero npm dependencies: fetch is a Node >=18 built-in, everything else is
// node:child_process/node:fs.

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SAMPLES_DIR = path.join(REPO_ROOT, "samples");
const RESULTS_DIR = path.join(REPO_ROOT, "results");
const RESULTS_PATH = path.join(RESULTS_DIR, "run-results.v1.json");

const BASE_URL = process.env.HONUA_BASE_URL ?? "http://localhost:8080";
const READY_TIMEOUT_MS = Number(process.env.HONUA_READY_TIMEOUT_MS ?? 120_000);
const READY_POLL_INTERVAL_MS = 2_000;

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
  const skipped = manifests.filter(({ manifest }) => manifest.status !== "active");

  for (const { dirName, manifest } of skipped) {
    console.log(`run-samples: skipping ${dirName} (status=${manifest.status})`);
  }

  console.log(`run-samples: executing ${active.length} active sample(s) against ${BASE_URL} (server ${serverVersion})`);

  const results = [];
  for (const { dirName, manifest } of active) {
    results.push(await runSample(dirName, manifest, serverVersion));
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  const envelope = {
    schema: "run-results.v1",
    generatedAt: new Date().toISOString(),
    serverVersion,
    baseUrl: BASE_URL,
    results,
  };
  await writeFile(RESULTS_PATH, JSON.stringify(envelope, null, 2) + "\n", "utf8");
  console.log(`run-samples: wrote ${results.length} result(s) to ${path.relative(REPO_ROOT, RESULTS_PATH)}`);

  const failed = results.filter((r) => r.outcome === "fail");
  if (failed.length > 0) {
    console.error(`run-samples: ${failed.length} sample(s) failed: ${failed.map((r) => r.id).join(", ")}`);
    process.exitCode = 1;
  }
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

function runSample(dirName, manifest, serverVersion) {
  return new Promise((resolve) => {
    const started = Date.now();
    const sampleCwd = path.join(SAMPLES_DIR, dirName);
    const [command, ...args] = manifest.entrypoint.command.split(" ");

    console.log(`run-samples: [${manifest.id}] running "${manifest.entrypoint.command}"`);

    const child = spawn(command, args, {
      cwd: sampleCwd,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", (err) => {
      resolve(buildResult(manifest, serverVersion, started, "fail", err.message));
    });

    child.on("exit", (code) => {
      const outcome = code === 0 ? "pass" : "fail";
      resolve(buildResult(manifest, serverVersion, started, outcome, code === 0 ? undefined : `exit code ${code}`));
    });
  });
}

function buildResult(manifest, serverVersion, started, outcome, error) {
  return {
    id: manifest.id,
    capabilities: manifest.capabilities,
    outcome,
    durationMs: Date.now() - started,
    serverVersion,
    ...(error ? { error } : {}),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(`run-samples: ${err.message}`);
  process.exitCode = 1;
});
