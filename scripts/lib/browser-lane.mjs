// Headless-browser lane for scripts/run-samples.mjs (honua-io/honua-samples#2,
// deliverable 1: entrypoint.type "browser").
//
// Playwright is this repo's one allowed exception to the zero-npm-dependency
// house style -- there is no way to execute a sample's real browser-side
// JS/DOM code headlessly without a real browser engine. To keep it OUT of any
// package.json (this repo has none, on purpose), the browser is installed
// on demand into REPO_ROOT/node_modules via a pinned, explicit
// `npm install --no-save` -- NOT tracked by any manifest, gitignored like
// every other node_modules/ in this repo.
//
// Why not just shell out to `npx playwright@<pinned>` for everything (the
// obvious zero-footprint option)? Because npx only puts the temp install's
// node_modules/.bin on PATH for the CLI it launches -- it does NOT make the
// installed package importable/requireable from an arbitrary script (no
// NODE_PATH, no cwd change), which is a hard blocker for actually driving a
// page (waiting for a selector, reading an attribute) rather than just
// running a fixed CLI subcommand like `screenshot`. Installing into
// REPO_ROOT/node_modules with a pinned version gets us a normal, resolvable
// `import "playwright"` from any script under this repo (Node's standard
// upward node_modules walk finds it), while still writing nothing to any
// committed dependency manifest. `npx playwright@<pinned> install chromium`
// (or the equivalent local invocation below) is still what actually
// downloads the browser binary, matching the "prefer npx" guidance for that
// one-off operation.
//
// Pin bumps: update PLAYWRIGHT_VERSION below (and re-run once locally so the
// version check re-installs) -- there is no lockfile to bump instead.

import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export const PLAYWRIGHT_VERSION = "1.48.2";

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
 * Ensures a pinned `playwright` install is resolvable from REPO_ROOT, and
 * that its Chromium browser binary is downloaded. Idempotent and cheap on a
 * warm cache (both `npm install` and `playwright install` no-op quickly when
 * the pinned version/binary are already present).
 *
 * @param {{ repoRoot: string, log: (msg: string) => void }} ctx
 */
export async function ensureBrowserReady({ repoRoot, log }) {
  const pkgPath = path.join(repoRoot, "node_modules", "playwright", "package.json");
  let installedVersion;
  try {
    installedVersion = JSON.parse(await readFile(pkgPath, "utf8")).version;
  } catch {
    installedVersion = undefined;
  }

  if (installedVersion !== PLAYWRIGHT_VERSION) {
    log(
      `run-samples: installing playwright@${PLAYWRIGHT_VERSION} into node_modules/ (found ${installedVersion ?? "none"}) -- one-time, not committed, not in any package.json`,
    );
    // shell: true so this resolves "npm" off PATH the same way a developer's
    // or CI runner's shell would, rather than guessing at npm's install
    // layout relative to the running node binary.
    execFileSync("npm", ["install", "--no-save", "--no-audit", "--no-fund", `playwright@${PLAYWRIGHT_VERSION}`], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
    });
  }

  log(`run-samples: ensuring Chromium (playwright@${PLAYWRIGHT_VERSION}) is installed...`);
  execFileSync(
    process.execPath,
    [path.join(repoRoot, "node_modules", "playwright", "cli.js"), "install", "chromium"],
    { cwd: repoRoot, stdio: "inherit" },
  );

  // Dynamic import: only resolvable once the install step above has run, and
  // only ever needed at all when the sample set actually contains a
  // "browser" entrypoint sample.
  const { chromium } = await import(path.join(repoRoot, "node_modules", "playwright", "index.mjs"));
  return chromium;
}

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

/**
 * Runs one browser-lane sample attempt: navigate to the sample's HTML entry
 * point, wait for the `[data-sample-status]` DOM marker convention (see
 * schemas/sample.v1.schema.json's entrypoint.command description), and read
 * its value.
 *
 * @param {{ browser: import("playwright").Browser, url: string, timeoutMs: number }} opts
 * @returns {Promise<{ outcome: "pass" | "fail", error?: string }>}
 */
export async function runBrowserSample({ browser, url, timeoutMs }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  try {
    await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
    await page.waitForSelector("[data-sample-status]", { timeout: timeoutMs });
    const status = await page.getAttribute("[data-sample-status]", "data-sample-status");
    if (status === "pass") {
      return { outcome: "pass" };
    }
    const detail = await page.getAttribute("[data-sample-status]", "data-sample-error").catch(() => null);
    return {
      outcome: "fail",
      error: `page reported data-sample-status="${status}"${detail ? `: ${detail}` : ""}`,
    };
  } catch (err) {
    const consoleTail = consoleErrors.length > 0 ? ` (console errors: ${consoleErrors.slice(-3).join(" | ")})` : "";
    return { outcome: "fail", error: `${err.message}${consoleTail}` };
  } finally {
    await context.close();
  }
}
