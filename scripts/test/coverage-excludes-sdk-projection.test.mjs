// Evidence-boundary test (honua-io/honua-samples#16): a card projected from
// the honua-sdk-js site-consumer handoff must NEVER appear in
// samples-coverage.v1.json -- that artifact is reserved for samples this
// repo executes in its own run-samples workflow. Runs the real
// scripts/generate-samples-coverage.mjs as a child process against a temp
// samples dir, exactly like the run-samples workflow does.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GENERATOR = path.join(REPO_ROOT, "scripts", "generate-samples-coverage.mjs");

async function writeManifest(samplesDir, id, capabilities) {
  const dir = path.join(samplesDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "sample.json"),
    JSON.stringify(
      {
        id,
        title: `Test sample ${id}`,
        description: "Coverage boundary test manifest.",
        capabilities,
        sdks: ["rest"],
        protocols: ["geoservices-rest"],
        edition: "community",
        entrypoint: { type: "node", command: "node src/run.mjs" },
        status: "active",
      },
      null,
      2,
    ),
  );
}

test("SDK-projected identities are excluded from samples-coverage output", async (t) => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "samples-coverage-boundary-"));
  t.after(() => rm(workDir, { recursive: true, force: true }));

  // A canonical capability key from the pinned fixture, so the entries are
  // otherwise fully admissible.
  const keyFixture = JSON.parse(
    await readFile(path.join(REPO_ROOT, "schemas", "fixtures", "capability-keys.fixture.json"), "utf8"),
  );
  const anyKey = (keyFixture.keys ?? keyFixture).map((k) => (typeof k === "string" ? k : k.key))[0];
  assert.ok(anyKey, "capability-keys fixture yields at least one key");

  // "maplibre-quickstart" is a stable identity projected from the sdk-js
  // handoff snapshot; "own-executed-sample" is this repo's own.
  const samplesDir = path.join(workDir, "samples");
  await writeManifest(samplesDir, "maplibre-quickstart", [anyKey]);
  await writeManifest(samplesDir, "own-executed-sample", [anyKey]);
  const outPath = path.join(workDir, "coverage", "samples-coverage.v1.json");

  const { stderr } = await execFileAsync(process.execPath, [GENERATOR], {
    env: {
      ...process.env,
      KEY_LIST_URL: "",
      SAMPLES_DIR: samplesDir,
      OUT_PATH: outPath,
      RUN_RESULTS_PATH: path.join(workDir, "no-such-run-results.json"),
      SDKJS_HANDOFF_SNAPSHOT_PATH: path.join(workDir, "no-such-legacy-handoff.json"),
      SDKJS_HANDOFF_FIXTURE_SNAPSHOT_PATH: path.join(workDir, "no-such-legacy-fixture.json"),
    },
  });

  const snapshot = JSON.parse(await readFile(outPath, "utf8"));
  const allEntries = Object.values(snapshot.capabilities).flat();
  assert.ok(
    allEntries.some((e) => e.id === "own-executed-sample"),
    "own-executed sample is counted",
  );
  assert.equal(
    allEntries.filter((e) => e.id === "maplibre-quickstart").length,
    0,
    "SDK-projected gallery-only card never appears in samples-coverage output",
  );
  assert.ok(
    !JSON.stringify(snapshot).includes("maplibre-quickstart"),
    "no trace of the SDK-projected identity anywhere in the snapshot",
  );
  assert.match(stderr, /gallery-only identity/, "exclusion is loudly warned, not silent");
});

test("coverage generation still works when the handoff snapshot is unavailable (warns, cannot enforce)", async (t) => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "samples-coverage-nosnap-"));
  t.after(() => rm(workDir, { recursive: true, force: true }));

  const keyFixture = JSON.parse(
    await readFile(path.join(REPO_ROOT, "schemas", "fixtures", "capability-keys.fixture.json"), "utf8"),
  );
  const anyKey = (keyFixture.keys ?? keyFixture).map((k) => (typeof k === "string" ? k : k.key))[0];
  const samplesDir = path.join(workDir, "samples");
  await writeManifest(samplesDir, "own-executed-sample", [anyKey]);
  const outPath = path.join(workDir, "coverage", "samples-coverage.v1.json");

  const { stderr } = await execFileAsync(process.execPath, [GENERATOR], {
    env: {
      ...process.env,
      KEY_LIST_URL: "",
      SAMPLES_DIR: samplesDir,
      OUT_PATH: outPath,
      RUN_RESULTS_PATH: path.join(workDir, "no-such-run-results.json"),
      SDKJS_HANDOFF_V2_SNAPSHOT_PATH: path.join(workDir, "no-such-next-handoff.json"),
      SDKJS_HANDOFF_FIXTURE_V4_SNAPSHOT_PATH: path.join(workDir, "no-such-next-fixture.json"),
      SDKJS_HANDOFF_SNAPSHOT_PATH: path.join(workDir, "no-such-snapshot.json"),
      SDKJS_HANDOFF_FIXTURE_SNAPSHOT_PATH: path.join(workDir, "no-such-fixture-snapshot.json"),
    },
  });
  assert.match(stderr, /SDK-projection exclusion cannot be enforced/);
  const snapshot = JSON.parse(await readFile(outPath, "utf8"));
  assert.ok(Object.values(snapshot.capabilities).flat().some((e) => e.id === "own-executed-sample"));
});
