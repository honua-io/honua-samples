// Browser lane outcome rules (scripts/lib/browser-lane.mjs): a browser sample
// passes only when its Playwright run exited 0 and every spec ran and passed.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runPlaywrightSample, summarizePlaywrightReport } from "../lib/browser-lane.mjs";

const FILE = "sample-a/verify/sample-a.spec.mjs";

function spec(title, status, { error, duration = 10 } = {}) {
  return {
    title,
    file: FILE,
    line: 1,
    tests: [
      {
        projectName: "chromium",
        status,
        results: status === "skipped" ? [] : [{ duration, ...(error ? { error: { message: error } } : {}) }],
      },
    ],
  };
}

function report(specs, { errors = [] } = {}) {
  return {
    suites: [{ title: FILE, file: FILE, specs: [], suites: [{ title: "group", file: FILE, specs }] }],
    errors,
  };
}

test("every spec passing on exit 0 is a pass, with nested titles and durations", () => {
  const result = summarizePlaywrightReport({
    exitCode: 0,
    report: report([spec("renders", "expected", { duration: 7 }), spec("refuses", "expected")]),
  });
  assert.equal(result.outcome, "pass");
  assert.equal(result.error, undefined);
  assert.deepEqual(
    result.specs.map(({ title, outcome, durationMs, project }) => ({ title, outcome, durationMs, project })),
    [
      { title: "group › renders", outcome: "pass", durationMs: 7, project: "chromium" },
      { title: "group › refuses", outcome: "pass", durationMs: 10, project: "chromium" },
    ],
  );
});

test("a failing spec fails the sample and surfaces its first error line without ANSI codes", () => {
  const result = summarizePlaywrightReport({
    exitCode: 1,
    report: report([
      spec("renders", "unexpected", { error: "\u001b[31mError: pixel is background\u001b[39m\n    at spec.mjs:1" }),
      spec("refuses", "expected"),
    ]),
  });
  assert.equal(result.outcome, "fail");
  assert.equal(result.specs[0].error, "Error: pixel is background");
  assert.match(result.error, /^1\/2 spec\(s\) failed; first: group › renders: Error: pixel is background$/);
});

test("specs skipped after a failed beforeAll are not green", () => {
  const failedSetup = summarizePlaywrightReport({
    exitCode: 1,
    report: report([spec("renders", "unexpected", { error: "seed failed" }), spec("refuses", "skipped")]),
  });
  assert.equal(failedSetup.outcome, "fail");
  assert.deepEqual(
    failedSetup.specs.map((s) => s.outcome),
    ["fail", "skipped"],
  );

  const onlySkipped = summarizePlaywrightReport({ exitCode: 0, report: report([spec("renders", "skipped")]) });
  assert.equal(onlySkipped.outcome, "fail");
  assert.match(onlySkipped.error, /were skipped/);
});

test("a flaky status is a failure: nothing is retried to green", () => {
  const result = summarizePlaywrightReport({ exitCode: 0, report: report([spec("renders", "flaky")]) });
  assert.equal(result.outcome, "fail");
});

test("no specs, no report, a run error, or a non-zero exit is a failure", () => {
  assert.match(summarizePlaywrightReport({ exitCode: 0, report: report([]) }).error, /no Playwright spec ran/);
  assert.match(summarizePlaywrightReport({ exitCode: 1, report: undefined }).error, /without a JSON report/);
  assert.match(
    summarizePlaywrightReport({ exitCode: 1, report: report([], { errors: [{ message: "config broke\nstack" }] }) }).error,
    /^playwright run error: config broke$/,
  );
  assert.match(
    summarizePlaywrightReport({ exitCode: 1, report: report([spec("renders", "expected")]) }).error,
    /exited 1 although every spec passed/,
  );
});

test("a browser sample without a verify spec fails instead of being skipped", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "browser-lane-"));
  try {
    await mkdir(path.join(repoRoot, "samples", "no-spec"), { recursive: true });
    const result = await runPlaywrightSample({
      repoRoot,
      dirName: "no-spec",
      outDir: path.join(repoRoot, "results"),
      env: process.env,
    });
    assert.equal(result.outcome, "fail");
    assert.match(result.error, /has no Playwright verification/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
