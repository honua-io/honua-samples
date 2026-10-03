// Headless-browser lane for scripts/run-samples.mjs (entrypoint.type
// "browser"). Every browser sample is proven by its own Playwright specs in
// samples/<id>/verify/*.spec.mjs, run through playwright.config.ts against the
// composed server; see docs/browser-verification/README.md.
//
// Playwright is declared and locked in package.json. CI installs the package
// and Chromium before invoking this lane; runtime code never mutates
// node_modules, downgrades browsers, or performs network installation.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export const PLAYWRIGHT_VERSION = "1.58.2";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Tiny static file server, zero dependencies, scoped to one directory.
 * Serves `samples/` so a browser sample's HTML/JS/CSS assets are reachable
 * over http(s) -- Playwright can't navigate to file:// and have fetch() to a
 * cross-origin server behave like a real deployed page.
 *
 * Binds to a fixed port (default 3000) rather than an ephemeral one because
 * docker/compose.yml's Cors:AllowedOrigins is pinned to
 * "http://localhost:3000" -- browser samples' fetch() calls to the composed
 * honua-server need that origin to match exactly.
 *
 * @param {{ rootDir: string, port: number }} opts
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function startStaticServer({ rootDir, port }) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const decodedPath = decodeURIComponent(url.pathname);
      const filePath = path.join(rootDir, decodedPath);
      // Path-traversal guard: resolved path must stay under rootDir.
      if (!filePath.startsWith(path.resolve(rootDir))) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      const stats = await stat(filePath);
      const resolved = stats.isDirectory() ? path.join(filePath, "index.html") : filePath;
      const body = await readFile(resolved);
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
      res.end(body);
    } catch (err) {
      res.writeHead(404).end(`Not found: ${err.message}`);
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    // "localhost", not "127.0.0.1": docker/compose.yml's Cors:AllowedOrigins
    // is pinned to "http://localhost:3000" exactly -- a browser treats
    // 127.0.0.1 and localhost as different origins even though they resolve
    // to the same interface, so this has to match verbatim.
    server.listen(port, "localhost", () => {
      resolve({
        url: `http://localhost:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

/** Fails fast when `npm ci` has not installed the locked Playwright. */
export async function assertPlaywrightInstalled({ repoRoot }) {
  const packageJson = path.join(repoRoot, "node_modules", "@playwright", "test", "package.json");
  let version;
  try {
    version = JSON.parse(await readFile(packageJson, "utf8")).version;
  } catch (error) {
    throw new Error(
      `Browser lane is not installed. Run \`npm ci\` and \`npx playwright install chromium\`: ${error.message}`,
    );
  }
  if (version !== PLAYWRIGHT_VERSION) {
    throw new Error(`node_modules has @playwright/test ${version}; the lockfile pins ${PLAYWRIGHT_VERSION}. Run \`npm ci\`.`);
  }
  return version;
}

/**
 * Runs one browser sample's Playwright specs (Chromium, no retries) and
 * reduces the JSON report to the runner's outcome.
 *
 * @param {{ repoRoot: string, dirName: string, outDir: string, env: NodeJS.ProcessEnv }} opts
 * @returns {Promise<{ outcome: "pass" | "fail", error?: string, specs: SpecResult[], reportPath: string }>}
 */
export async function runPlaywrightSample({ repoRoot, dirName, outDir, env }) {
  const verifyDir = path.join(repoRoot, "samples", dirName, "verify");
  const specFiles = (await readdir(verifyDir).catch(() => [])).filter((name) => name.endsWith(".spec.mjs"));
  const reportPath = path.join(outDir, `${dirName}.playwright.json`);
  if (specFiles.length === 0) {
    return {
      outcome: "fail",
      error: `browser sample has no Playwright verification (expected samples/${dirName}/verify/*.spec.mjs)`,
      specs: [],
      reportPath,
    };
  }

  await mkdir(outDir, { recursive: true });
  await rm(reportPath, { force: true });
  const cli = path.join(repoRoot, "node_modules", "@playwright", "test", "cli.js");
  const exitCode = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        cli,
        "test",
        "--config",
        path.join(repoRoot, "playwright.config.ts"),
        "--project",
        "chromium",
        "--retries",
        "0",
        "--reporter",
        "list,json",
        `samples/${dirName}/verify/`,
      ],
      {
        cwd: repoRoot,
        env: {
          ...env,
          PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
          HONUA_PW_OUTPUT_DIR: path.join(outDir, "artifacts", dirName),
        },
        stdio: "inherit",
      },
    );
    child.on("error", () => resolve(-1));
    child.on("exit", (code) => resolve(code ?? -1));
  });

  let report;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
  } catch {
    report = undefined;
  }
  return { ...summarizePlaywrightReport({ exitCode, report }), reportPath };
}

/**
 * @typedef {{ title: string, file: string, line: number, project: string, outcome: "pass" | "fail" | "skipped", durationMs: number, error?: string }} SpecResult
 */

/**
 * Pure reduction of a Playwright JSON report. A sample passes only when the
 * run exited 0, at least one spec ran, and every spec passed: a skipped spec
 * (e.g. after a failed beforeAll) is never silently green.
 *
 * @param {{ exitCode: number, report: any }} input
 * @returns {{ outcome: "pass" | "fail", error?: string, specs: SpecResult[] }}
 */
export function summarizePlaywrightReport({ exitCode, report }) {
  if (!report) {
    return { outcome: "fail", error: `playwright exited ${exitCode} without a JSON report`, specs: [] };
  }
  const specs = [];
  const walk = (suite, titles) => {
    const here = suite.title && !suite.file?.endsWith(suite.title) ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      for (const run of spec.tests ?? []) {
        const last = run.results?.at(-1);
        const outcome = run.status === "expected" ? "pass" : run.status === "skipped" ? "skipped" : "fail";
        const message = last?.error?.message ?? last?.errors?.[0]?.message;
        specs.push({
          title: [...here, spec.title].join(" › "),
          file: spec.file,
          line: spec.line,
          project: run.projectName,
          outcome,
          durationMs: (run.results ?? []).reduce((sum, result) => sum + (result.duration ?? 0), 0),
          ...(outcome === "fail" && message ? { error: firstLine(message) } : {}),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };
  for (const suite of report.suites ?? []) walk(suite, []);

  const globalErrors = (report.errors ?? []).map((error) => firstLine(error.message ?? String(error)));
  const failed = specs.filter((spec) => spec.outcome === "fail");
  const skipped = specs.filter((spec) => spec.outcome === "skipped");

  let error;
  if (globalErrors.length > 0) error = `playwright run error: ${globalErrors[0]}`;
  else if (specs.length === 0) error = "no Playwright spec ran";
  else if (failed.length > 0) error = `${failed.length}/${specs.length} spec(s) failed; first: ${failed[0].title}: ${failed[0].error ?? "failed"}`;
  else if (skipped.length > 0) error = `${skipped.length}/${specs.length} spec(s) were skipped; first: ${skipped[0].title}`;
  else if (exitCode !== 0) error = `playwright exited ${exitCode} although every spec passed`;

  return error ? { outcome: "fail", error, specs } : { outcome: "pass", specs };
}

function firstLine(message) {
  // eslint-disable-next-line no-control-regex
  const plain = String(message).replace(/\u001b\[[0-9;]*m/g, "");
  return plain.split("\n").find((line) => line.trim().length > 0)?.trim() ?? plain.trim();
}
