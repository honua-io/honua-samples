// Headless-browser lane for scripts/run-samples.mjs (honua-io/honua-samples#2,
// deliverable 1: entrypoint.type "browser").
//
// Playwright is declared and locked in package.json. CI installs the package
// and Chromium before invoking this lane; runtime code never mutates
// node_modules, downgrades browsers, or performs network installation.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
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
 * Resolves the lockfile-managed browser driver. Dependency and browser
 * installation are explicit workflow responsibilities.
 *
 * @param {{ repoRoot: string, log: (msg: string) => void }} ctx
 */
export async function ensureBrowserReady({ log }) {
  try {
    const { chromium } = await import("@playwright/test");
    log(`run-samples: using lockfile-managed @playwright/test ${PLAYWRIGHT_VERSION}`);
    return chromium;
  } catch (error) {
    throw new Error(
      `Browser lane is not installed. Run \`npm ci\` and \`npx playwright install chromium\`: ${error.message}`,
    );
  }
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
