#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(repoRoot, "site");
const snapshotPath = path.join(repoRoot, "config", "sample-bundles.snapshot.json");
const evidenceDir = path.join(repoRoot, ".artifacts", "gallery-browser-smoke");
const evidencePath = path.join(evidenceDir, "browser-smoke.v1.json");
const minimumApps = parseMinimum(process.env.MIN_RUNNABLE_BUNDLES ?? "1");

const mediaTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".pmtiles", "application/vnd.pmtiles"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
]);

async function main() {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const standalone = snapshot.manifest.samples.filter((sample) => sample.runnability === "standalone");
  const published = [];
  for (const sample of standalone) {
    try {
      await stat(path.join(siteRoot, "sdk", sample.id, "app", sample.entrypoint));
      published.push(sample);
    } catch {
      // The count gate below reports missing apps without claiming they ran.
    }
  }
  if (published.length < minimumApps) {
    throw new Error(`gallery browser gate requires ${minimumApps} published standalone app(s), found ${published.length}`);
  }

  await mkdir(evidenceDir, { recursive: true });
  const server = createStaticServer();
  let browser;
  const results = [];
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("gallery smoke server has no TCP address");
    const origin = `http://127.0.0.1:${address.port}`;

    browser = await chromium.launch({ headless: true });
    for (const sample of published) results.push(await smokeSample(browser, origin, sample));
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      if (server.listening) {
        await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    }
  }

  const receipt = {
    format: "honua.samples.gallery-browser-smoke.v1",
    generatedAt: new Date().toISOString(),
    sourceBundleCommit: published[0]?.builtFrom?.commit ?? null,
    summary: {
      required: minimumApps,
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
    },
    results,
  };
  await writeFile(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(receipt.summary)}\n`);
  for (const result of results) {
    process.stdout.write(`${result.passed ? "PASS" : "FAIL"} ${result.id} ${result.title}\n`);
    for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  }
  if (receipt.summary.failed > 0) process.exitCode = 1;
}

async function smokeSample(browser, origin, sample) {
  const page = await browser.newPage();
  const failures = [];
  const observedRequests = new Set();
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "";
    if (
      sample.id === "overture-geoparquet" &&
      errorText === "net::ERR_ABORTED" &&
      /duckdb|eh\.wasm|mvp\.wasm/u.test(request.url())
    ) {
      return;
    }
    failures.push(`requestfailed: ${request.method()} ${request.url()} ${errorText}`);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400 && url.pathname !== "/favicon.ico") {
      failures.push(`response: ${response.status()} ${response.request().method()} ${response.url()}`);
    }
    observedRequests.add(url.pathname);
  });

  let title = "";
  let screenshot = null;
  try {
    const response = await page.goto(`${origin}/sdk/${sample.id}/`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (!response || response.status() !== 200) failures.push(`navigation status: ${response?.status() ?? "none"}`);
    const iframe = page.locator("iframe[title$='-- running sample']");
    if ((await iframe.count()) !== 1) failures.push("detail page does not contain exactly one running-sample iframe");
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    await page.waitForTimeout(500);
    title = await page.title();
    const frame = iframe.contentFrame();
    if (frame) {
      const body = (await frame.locator("body").innerText()).replace(/\s+/gu, " ");
      if (!body.trim()) failures.push("sample iframe body is empty");
      for (const signal of ["Demo error:", "Unable to load /", "No runnable build published yet"]) {
        if (body.includes(signal)) failures.push(`visible failure signal: ${signal}`);
      }
    }
  } catch (error) {
    failures.push(`navigation: ${error instanceof Error ? error.message : String(error)}`);
  }

  const uniqueFailures = [...new Set(failures)];
  if (uniqueFailures.length > 0) {
    screenshot = `${sample.id}.png`;
    await page.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: true });
  }
  await page.close();
  return {
    id: sample.id,
    title,
    passed: uniqueFailures.length === 0,
    requestCount: observedRequests.size,
    failures: uniqueFailures,
    screenshot,
  };
}

function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "index.html";
      let filePath = path.resolve(siteRoot, relativePath);
      if (filePath !== siteRoot && !filePath.startsWith(`${siteRoot}${path.sep}`)) {
        return sendStatus(response, 400, "Invalid path");
      }
      const metadata = await stat(filePath);
      if (metadata.isDirectory()) filePath = path.join(filePath, "index.html");
      await sendFile(request, response, filePath);
    } catch (error) {
      if (error?.code === "ENOENT") return sendStatus(response, 404, "Not found");
      sendStatus(response, 500, error instanceof Error ? error.message : String(error));
    }
  });
}

async function sendFile(request, response, filePath) {
  const metadata = await stat(filePath);
  const range = parseRange(request.headers.range, metadata.size);
  const headers = {
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "content-type": mediaTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
  };
  if (range) {
    const length = range.end - range.start + 1;
    response.writeHead(206, {
      ...headers,
      "content-length": length,
      "content-range": `bytes ${range.start}-${range.end}/${metadata.size}`,
    });
    if (request.method === "HEAD") return response.end();
    createReadStream(filePath, { start: range.start, end: range.end }).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, "content-length": metadata.size });
  if (request.method === "HEAD") return response.end();
  createReadStream(filePath).pipe(response);
}

function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d+)-(\d*)$/u.exec(header);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

function parseMinimum(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`MIN_RUNNABLE_BUNDLES must be a positive integer, received ${JSON.stringify(value)}`);
  }
  return parsed;
}

function sendStatus(response, status, message) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
