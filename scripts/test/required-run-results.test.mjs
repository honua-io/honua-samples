import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("production gallery fails before rendering when run results are missing", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "required-run-results-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ["scripts/build-gallery.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, KEY_LIST_URL: "", REQUIRE_RUN_RESULTS: "1", RUN_RESULTS_PATH: path.join(dir, "absent.json") },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /cannot read required run results/);
});

test("Pages stops on absent runs or a failed artifact download", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pages-run-results-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const workflow = await readFile(path.join(root, ".github/workflows/pages.yml"), "utf8");
  const step = workflow.split("      - name: Download latest run-results artifact\n")[1].split("      - name:")[0];
  const script = step.split("        run: |\n")[1].split("\n").map((line) => line.slice(10)).join("\n");
  await writeFile(path.join(dir, "gh"), '#!/bin/sh\nif [ "$2" = list ]; then printf "%s" "$STUB_RUN_ID"; else exit "$STUB_DOWNLOAD_STATUS"; fi\n', { mode: 0o755 });
  for (const [runId, downloadStatus, expectedStatus] of [["", "0", 1], ["null", "0", 1], ["42", "9", 9], ["42", "0", 0]]) {
    const result = spawnSync("bash", ["-c", script], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: "honua-io/honua-samples", STUB_RUN_ID: runId, STUB_DOWNLOAD_STATUS: downloadStatus },
    });
    assert.equal(result.status, expectedStatus, result.stderr);
  }
});
