#!/usr/bin/env node
// Appends a "Flaky samples" section to $GITHUB_STEP_SUMMARY (or stdout, when
// that env var is unset -- e.g. a local run) listing every sample in the
// latest results/run-results.v1.json whose result has "flaky": true (passed,
// but only after at least one failed attempt). Used by the run-samples
// workflow's nightly schedule (honua-io/honua-samples#2, deliverable 3) so a
// flake doesn't just disappear into a green checkmark unattended.
//
// Zero npm dependencies, matching the rest of this repo's scripts.
//
// Env vars (all optional):
//   RUN_RESULTS_PATH     default "results/run-results.v1.json"
//   GITHUB_STEP_SUMMARY  path to append the markdown to; stdout if unset

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const RUN_RESULTS_PATH = path.resolve(
  REPO_ROOT,
  process.env.RUN_RESULTS_PATH ?? "results/run-results.v1.json",
);

async function main() {
  let envelope;
  try {
    envelope = JSON.parse(await readFile(RUN_RESULTS_PATH, "utf8"));
  } catch (err) {
    console.log(`summarize-flaky: no run results at ${RUN_RESULTS_PATH} -- nothing to summarize (${err.message})`);
    return;
  }

  const flaky = (envelope.results ?? []).filter((r) => r.flaky);

  const lines =
    flaky.length === 0
      ? ["No flaky samples tonight."]
      : [
          "| Sample | Attempts | First failure |",
          "|---|---|---|",
          ...flaky.map(
            (r) => `| ${r.id} | ${r.attempts?.length ?? "?"} | ${r.attempts?.[0]?.error ?? "(no error recorded)"} |`,
          ),
        ];

  const markdown = ["## Flaky samples", ...lines, ""].join("\n");

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    await appendFile(summaryPath, `${markdown}\n`, "utf8");
  } else {
    console.log(markdown);
  }
  console.log(`summarize-flaky: ${flaky.length} flaky sample(s) found`);
}

main().catch((err) => {
  console.error(`summarize-flaky: ${err.message}`);
  process.exitCode = 1;
});
