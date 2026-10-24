#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT, resultTimeoutMs, viewportFailure, visibleViewportRatio } from "./lib/gallery-visual-contract.mjs";
import { SDK_PRODUCER_LOCK } from "./lib/sdk-producer-lock.mjs";
import { loadGalleryPublicPortfolio } from "./lib/gallery-public-portfolio.mjs";
import {
  documentedDegradedResponse,
  isOwnBrowserSample,
  OWN_APP_MANIFEST_FORMAT,
  OWN_APP_MANIFEST_NAME,
  OWN_SAMPLE_SOURCE_REPO,
  verifyPublishedOwnApp,
} from "./lib/own-sample-apps.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(repoRoot, "site");
const snapshotPath = path.join(repoRoot, "config", "sample-bundles.snapshot.json");
const stagedStatusPath = path.join(repoRoot, ".sample-bundles-staging", "status.json");
const evidenceDir = path.join(repoRoot, ".artifacts", "gallery-browser-smoke");
const evidencePath = path.join(evidenceDir, "browser-smoke.v1.json");
const minimumApps = parseMinimum(process.env.MIN_PUBLISHED_RUNNABLE_APPS ?? "1");
const expectedSourceCommit = process.env.EXPECTED_SOURCE_COMMIT?.trim() || null;

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
  let bundleState;
  try {
    bundleState = JSON.parse(await readFile(stagedStatusPath, "utf8"));
  } catch {
    bundleState = JSON.parse(await readFile(snapshotPath, "utf8"));
  }
  const standalone = bundleState.manifest.samples.filter(
    (sample) =>
      sample.runnability === "standalone" &&
      sample.lifecycle?.state === "active" &&
      !sample.lifecycle?.reason?.startsWith("Locally staged override"),
  );
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
  for (const sample of published) {
    if (sample.builtFrom?.commit !== SDK_PRODUCER_LOCK.revision) {
      throw new Error(`published sample ${sample.id} is not bound to locked SDK producer ${SDK_PRODUCER_LOCK.revision}`);
    }
  }

  // This repo's own browser samples: every one the public portfolio
  // publishes must have a staged app whose published bytes match its
  // manifest. A missing app fails here instead of silently shipping the
  // no-bundle panel.
  const ownApps = await loadPublishedOwnApps();

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
    for (const app of ownApps) results.push(await smokeOwnApp(browser, origin, app));
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
    samplesSourceCommit: process.env.EXPECTED_SOURCE_COMMIT ?? null,
    sourceBundleCommit: published[0]?.builtFrom?.commit ?? null,
    summary: {
      required: minimumApps,
      ownAppsRequired: ownApps.length,
      total: results.length,
      passed: results.filter((result) => result.passed && !result.unverified).length,
      unverified: results.filter((result) => result.unverified).length,
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

async function loadPublishedOwnApps() {
  const portfolio = await loadGalleryPublicPortfolio();
  const samplesDir = path.join(repoRoot, "samples");
  const apps = [];
  const missing = [];
  for (const entry of (await readdir(samplesDir, { withFileTypes: true })).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(samplesDir, entry.name, "sample.json"), "utf8"));
    } catch {
      continue;
    }
    const id = manifest.id ?? entry.name;
    if (!isOwnBrowserSample(manifest)) continue;
    if (portfolio.byIdentity.get(`${OWN_SAMPLE_SOURCE_REPO}:${id}`)?.disposition !== "public") continue;
    let app;
    try {
      app = JSON.parse(await readFile(path.join(siteRoot, id, OWN_APP_MANIFEST_NAME), "utf8"));
    } catch {
      missing.push(`${id}: no ${OWN_APP_MANIFEST_NAME} (the detail page would show the no-bundle panel)`);
      continue;
    }
    const failures = [];
    if (app.format !== OWN_APP_MANIFEST_FORMAT || app.id !== id) failures.push("app manifest format or id mismatch");
    if (expectedSourceCommit && app.builtFrom?.commit !== expectedSourceCommit) {
      failures.push(`app built from ${app.builtFrom?.commit}, expected source commit ${expectedSourceCommit}`);
    }
    failures.push(...(await verifyPublishedOwnApp(path.join(siteRoot, id, "app"), app, { readdirRecursive: listFiles })));
    if (failures.length) missing.push(`${id}: ${failures.join("; ")}`);
    else apps.push({ ...app, title: manifest.title ?? id });
  }
  if (missing.length) throw new Error(`published own browser sample(s) are not runnable:\n  - ${missing.join("\n  - ")}`);
  return apps;
}

async function listFiles(root, prefix = "") {
  const out = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(root, relative)));
    else out.push(relative);
  }
  return out;
}

// A public-live sample depends on its data origin. When that origin does not
// answer at all, the deploy still publishes (the page itself labels the
// failure), but the receipt records the app as unverified instead of passed.
async function dataOriginAnswers(dataOrigin) {
  if (!dataOrigin) return true;
  try {
    const response = await fetch(`${dataOrigin}/rest/services?f=json`, { signal: AbortSignal.timeout(15_000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function smokeOwnApp(browser, origin, app) {
  if (!(await dataOriginAnswers(app.dataOrigins?.[0]))) {
    process.stdout.write(`::warning title=own sample unverified::${app.id}: data origin ${app.dataOrigins[0]} did not answer; the embed was published but not verified\n`);
    return { id: app.id, title: app.title, source: OWN_SAMPLE_SOURCE_REPO, builtFrom: app.builtFrom, dataOrigin: app.dataOrigins[0], passed: true, unverified: "data origin unavailable", failures: [], screenshot: null };
  }
  const page = await browser.newPage({ viewport: DESKTOP_VIEWPORT });
  const failures = [];
  const degraded = [];
  const observedRequests = new Set();
  const dataOrigin = app.dataOrigins?.[0] ?? null;
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // A 4xx is reported once by the response handler below (with its
    // degraded-state classification), not again as a console line.
    if (/Failed to load resource: the server responded with a status of 4\d\d/u.test(message.text())) return;
    failures.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => failures.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
  page.on("response", (response) => {
    const url = new URL(response.url());
    observedRequests.add(`${url.origin}${url.pathname}`);
    if (response.status() < 400 || url.pathname === "/favicon.ico") return;
    const known = documentedDegradedResponse({ url: response.url(), status: response.status(), dataOrigin });
    if (known) degraded.push({ state: known.state, note: known.note, response: `${response.status()} ${url.pathname}` });
    else failures.push(`response: ${response.status()} ${response.request().method()} ${response.url()}`);
  });

  let title = "";
  let screenshot = null;
  let proof = null;
  try {
    const response = await page.goto(`${origin}/${app.id}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!response || response.status() !== 200) failures.push(`navigation status: ${response?.status() ?? "none"}`);
    title = await page.title();
    const iframe = page.locator("iframe[title$='-- running sample']");
    if ((await iframe.count()) !== 1) {
      failures.push("detail page does not contain exactly one running-sample iframe");
    } else {
      const expectedSrc = app.entrypoint === "index.html" ? "app/" : `app/${app.entrypoint}`;
      if ((await iframe.getAttribute("src")) !== expectedSrc) failures.push(`iframe src is not the staged app ${expectedSrc}`);
      const provenance = await page.locator(".embed-panel .provenance").innerText();
      if (!provenance.includes(`honua-samples @${app.builtFrom.commit.slice(0, 12)}`)) failures.push(`provenance does not name the staged commit: ${JSON.stringify(provenance)}`);
      if (dataOrigin && !provenance.includes(new URL(dataOrigin).host)) failures.push(`provenance does not name the data origin ${dataOrigin}`);
      await iframe.waitFor({ state: "visible", timeout: 30_000 });
      const desktopFailure = viewportFailure("desktop", visibleViewportRatio(await iframe.boundingBox(), DESKTOP_VIEWPORT), 0.55);
      if (desktopFailure) failures.push(desktopFailure);
      await page.setViewportSize(MOBILE_VIEWPORT);
      const mobileFailure = viewportFailure("mobile", visibleViewportRatio(await iframe.boundingBox(), MOBILE_VIEWPORT), 0.4);
      if (mobileFailure) failures.push(mobileFailure);
      await page.setViewportSize(DESKTOP_VIEWPORT);

      const frame = await (await iframe.elementHandle())?.contentFrame();
      if (!frame) {
        failures.push("running-sample iframe did not mount a frame");
      } else {
        // Every own browser sample reports body[data-sample-status] =
        // pass|fail and data-rendered-features (see samples/*/src/index.html).
        await frame.waitForFunction(() => document.body?.dataset.sampleStatus && document.body.dataset.sampleStatus !== "loading", null, { timeout: 45_000 }).catch(() => {});
        proof = await frame.evaluate(() => ({
          status: document.body.dataset.sampleStatus ?? null,
          error: document.body.dataset.sampleError ?? null,
          renderedFeatures: Number(document.body.dataset.renderedFeatures ?? 0),
          featureCount: document.body.dataset.featureCount ? Number(document.body.dataset.featureCount) : null,
          elapsedMs: document.body.dataset.sampleElapsedMs ? Number(document.body.dataset.sampleElapsedMs) : null,
          canvases: document.querySelectorAll("#map canvas").length,
          vectorPaths: document.querySelectorAll("#map svg path").length,
          statusText: document.querySelector("#status")?.textContent?.trim() ?? "",
        }));
        if (proof.status !== "pass") failures.push(`sample status ${JSON.stringify(proof.status)}${proof.error ? `: ${proof.error}` : ""}`);
        if (!(proof.renderedFeatures > 0)) failures.push("sample rendered no features in view");
        if (proof.canvases + proof.vectorPaths === 0) failures.push("sample map has no canvas or drawn vector paths");
      }
    }
    await page.waitForTimeout(500);
  } catch (error) {
    failures.push(`navigation: ${error instanceof Error ? error.message : String(error)}`);
  }

  const uniqueFailures = [...new Set(failures)];
  screenshot = `own-${app.id}.png`;
  await page.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: false });
  await page.close();
  return {
    id: app.id,
    title,
    source: OWN_SAMPLE_SOURCE_REPO,
    builtFrom: app.builtFrom,
    dataOrigin,
    passed: uniqueFailures.length === 0,
    requestCount: observedRequests.size,
    proof,
    degraded,
    failures: uniqueFailures,
    screenshot,
  };
}

async function smokeSample(browser, origin, sample) {
  const page = await browser.newPage({ viewport: DESKTOP_VIEWPORT });
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
    const framePath = (() => {
      try {
        return new URL(response.request().frame().url()).pathname;
      } catch {
        return "";
      }
    })();
    if (framePath.startsWith(`/sdk/${sample.id}/app/`) && url.pathname.startsWith("/assets/")) {
      failures.push(`root-relative app asset: ${response.request().method()} ${response.url()}`);
    }
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
    if ((await iframe.count()) === 1) {
      await iframe.waitFor({ state: "visible", timeout: resultTimeoutMs(sample) });
      const desktopRatio = visibleViewportRatio(await iframe.boundingBox(), DESKTOP_VIEWPORT);
      const desktopFailure = viewportFailure("desktop", desktopRatio, 0.55);
      if (desktopFailure) failures.push(desktopFailure);

      const visualFrame = iframe.contentFrame();
      if (visualFrame) {
        try {
          const body = visualFrame.locator("body");
          const timeout = resultTimeoutMs(sample);
          await body.waitFor({ state: "visible", timeout });
          const deadline = Date.now() + timeout;
          let rendered = false;
          while (!rendered && Date.now() < deadline) {
            rendered = await body.evaluate((element) => {
              const hasVisual = Boolean(element.querySelector("canvas, svg, img, video, [role='img']"));
              return element.scrollWidth > 0 && element.scrollHeight > 0 && (hasVisual || Boolean(element.innerText.trim()));
            });
            if (!rendered) await page.waitForTimeout(100);
          }
          if (!rendered) throw new Error("render timeout");
        } catch {
          failures.push(`nonzero result did not appear within ${resultTimeoutMs(sample)}ms`);
        }
      }

      await page.setViewportSize(MOBILE_VIEWPORT);
      const mobileRatio = visibleViewportRatio(await iframe.boundingBox(), MOBILE_VIEWPORT);
      const mobileFailure = viewportFailure("mobile", mobileRatio, 0.4);
      if (mobileFailure) failures.push(mobileFailure);
      await page.setViewportSize(DESKTOP_VIEWPORT);
    }
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
    if (sample.id === "maplibre-quickstart") {
      const appFrame = page.frames().find((candidate) => {
        try {
          return new URL(candidate.url()).pathname === `/sdk/${sample.id}/app/`;
        } catch {
          return false;
        }
      });
      if (!appFrame) {
        failures.push("Quickstart app frame was not mounted");
      } else {
        await appFrame.waitForFunction(
          () =>
            window.__HONUA_QUICKSTART_RUNTIME__?.journeyComplete === true ||
            Boolean(window.__HONUA_QUICKSTART_RUNTIME__?.lastError),
          null,
          { timeout: 30_000 },
        );
        const runtime = await appFrame.evaluate(() => window.__HONUA_QUICKSTART_RUNTIME__);
        if (runtime?.lastError) failures.push(`Quickstart runtime error: ${runtime.lastError}`);
        if (runtime?.mapReady !== true) failures.push("Quickstart runtime did not report mapReady");
        if (runtime?.journeyComplete !== true) failures.push("Quickstart journey did not complete");
        if ((await appFrame.locator("canvas").count()) < 1) failures.push("Quickstart did not mount a map canvas");
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
    throw new Error(`MIN_PUBLISHED_RUNNABLE_APPS must be a positive integer, received ${JSON.stringify(value)}`);
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
