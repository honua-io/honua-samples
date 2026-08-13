#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { detailStructureFailures, geocodingProofFailures } from "./lib/gallery-live-contract.mjs";
import { SDK_PRODUCER_LOCK } from "./lib/sdk-producer-lock.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(repoRoot, "site");
const evidenceDir = path.join(repoRoot, ".artifacts", "gallery-live-smoke");
const evidencePath = path.join(evidenceDir, "browser-smoke.v1.json");
const configuredBaseUrl = process.env.GALLERY_BASE_URL?.trim();
const expectedSourceCommit = process.env.EXPECTED_SOURCE_COMMIT?.trim();
const navigationTimeoutMs = parsePositiveInteger(process.env.GALLERY_LIVE_TIMEOUT_MS ?? "45000", "GALLERY_LIVE_TIMEOUT_MS");

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

const semanticAssertions = new Map([
  ["nl-map-control", async (frame) => {
    await frame.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent?.includes("Map ready."), null, markerOptions());
    await frame.locator('[data-testid="propose"]').click();
    await frame.locator('[data-testid="approve"]').waitFor({ state: "visible", timeout: navigationTimeoutMs });
    await frame.waitForFunction(() => {
      const button = document.querySelector('[data-testid="approve"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, null, markerOptions());
    await frame.locator('[data-testid="approve"]').click();
    await frame.waitForFunction(() => {
      const status = document.querySelector('[data-testid="status"]')?.textContent ?? "";
      const receipt = document.querySelector('[data-testid="receipt-json"]')?.textContent?.trim() ?? "";
      return status.includes("outcome:") && receipt.length > 2 && receipt !== "—";
    }, null, markerOptions());
  }],
  ["maplibre-quickstart", async (frame) => {
    await frame.waitForFunction(() => window.__HONUA_QUICKSTART_RUNTIME__?.journeyComplete === true || Boolean(window.__HONUA_QUICKSTART_RUNTIME__?.lastError), null, markerOptions());
    const runtime = await frame.evaluate(() => window.__HONUA_QUICKSTART_RUNTIME__);
    if (runtime?.lastError) throw new Error(`Quickstart runtime error: ${runtime.lastError}`);
    if (runtime?.mapReady !== true || runtime?.journeyComplete !== true) throw new Error("Quickstart did not complete its map journey");
    if ((await frame.locator("canvas").count()) < 1) throw new Error("Quickstart did not mount a map canvas");
  }],
  ["geocoding-quickstart", async (frame) => {
    await frame.waitForFunction(() => window.__HONUA_GEOCODING_DEMO__?.ready === true, null, markerOptions());
    const proof = await frame.evaluate(() => {
      const runtime = window.__HONUA_GEOCODING_DEMO__;
      return {
        ready: runtime?.ready,
        mode: runtime?.mode,
        endpoint: runtime?.endpoint,
        resultCount: runtime?.resultCount,
        markerCount: runtime?.markerCount,
        selectedAddress: runtime?.selectedAddress,
        selectedScore: runtime?.selectedScore,
        selectedCoordinates: runtime?.selectedCoordinates ? [...runtime.selectedCoordinates] : null,
        lastError: runtime?.lastError,
      };
    });
    const failures = geocodingProofFailures(proof, await frame.locator("canvas").count());
    if (failures.length > 0) throw new Error(failures.join("; "));
  }],
  ["pmtiles-static", async (frame) => {
    await frame.waitForFunction(() => window.__HONUA_PMTILES_STATIC_DEMO__?.ready === true, null, markerOptions());
    const proof = await frame.evaluate(() => {
      const runtime = window.__HONUA_PMTILES_STATIC_DEMO__;
      return { protocolRegistered: runtime?.protocolRegistered, hasSource: runtime?.hasSource, archive: Boolean(runtime?.archive) };
    });
    if (!proof.protocolRegistered || !proof.hasSource || !proof.archive) throw new Error(`PMTiles runtime proof incomplete: ${JSON.stringify(proof)}`);
  }],
  ["temporal-playback", async (frame) => {
    await frame.waitForFunction(() => window.__temporalPlaybackState?.ready === true, null, markerOptions());
    const state = await frame.evaluate(() => window.__temporalPlaybackState);
    if (state?.error) throw new Error(`Temporal playback error: ${state.error}`);
    if ((await frame.locator("canvas").count()) < 1) throw new Error("Temporal playback did not mount a map canvas");
  }],
  ["sketch-editing", async (frame) => {
    await frame.waitForFunction(() => window.__HONUA_SKETCH_EDITING_DEMO__?.ready === true, null, markerOptions());
    const snapshot = await frame.evaluate(() => window.__HONUA_SKETCH_EDITING_DEMO__?.snapshot());
    if (!snapshot || snapshot.valid !== true) throw new Error(`Sketch workflow is not ready: ${JSON.stringify(snapshot)}`);
  }],
  ["stac-imagery-browser", async (frame) => {
    await frame.waitForFunction(() => (window.__HONUA_STAC_BROWSER__?.ready === true && (window.__HONUA_STAC_BROWSER__?.loadedCount ?? 0) > 0), null, markerOptions());
    const proof = await frame.evaluate(() => ({ loadedCount: window.__HONUA_STAC_BROWSER__?.loadedCount, projectionMessage: window.__HONUA_STAC_BROWSER__?.projectionMessage }));
    if (!proof.projectionMessage) throw new Error(`STAC projection proof missing: ${JSON.stringify(proof)}`);
  }],
  ["overture-geoparquet", async (frame) => {
    await frame.waitForFunction(() => window.__HONUA_OVERTURE__?.ready === true && !window.__HONUA_OVERTURE__?.running, null, markerOptions(60_000));
    const proof = await frame.evaluate(() => {
      const runtime = window.__HONUA_OVERTURE__;
      return { status: runtime?.status, lastCount: runtime?.lastCount, hasEvidence: Boolean(runtime?.lastEvidence), parquetRows: runtime?.parquetRuntime?.readParquetRows };
    });
    if (proof.status !== "completed" || !(proof.lastCount > 0) || !proof.hasEvidence || !(proof.parquetRows > 0)) throw new Error(`GeoParquet bounded-query proof incomplete: ${JSON.stringify(proof)}`);
  }],
  ["ai-spatial-app-builder", async (frame) => {
    await frame.waitForFunction(() => window.__HONUA_SAFE_AGENT__?.ready === true, null, markerOptions());
    await frame.evaluate(() => window.__HONUA_SAFE_AGENT__?.runHappyPath("approve"));
    const proof = await frame.evaluate(() => ({ state: window.__HONUA_SAFE_AGENT__?.state, executionCount: window.__HONUA_SAFE_AGENT__?.executionCount }));
    if (!(proof.executionCount > 0) || !/execut|receipt|complete|approved/iu.test(proof.state ?? "")) throw new Error(`Safe-agent execution proof incomplete: ${JSON.stringify(proof)}`);
  }],
  ["service-explorer", async (frame) => {
    await frame.waitForFunction(() => window.__HONUA_SERVICE_EXPLORER_RUNTIME__?.ready === true, null, markerOptions());
    const proof = await frame.evaluate(() => {
      const runtime = window.__HONUA_SERVICE_EXPLORER_RUNTIME__;
      return { state: runtime?.state, protocol: runtime?.protocol, sourceId: runtime?.sourceId };
    });
    if (!new Set(["ready", "partial"]).has(proof.state) || proof.protocol === "unresolved" || proof.sourceId === "unselected") throw new Error(`Service inspection proof incomplete: ${JSON.stringify(proof)}`);
  }],
  ["realtime-incident-dashboard", async (frame) => {
    await frame.waitForFunction(() => window.__HONUA_INCIDENT_RUNTIME__?.ready === true && window.__HONUA_INCIDENT_RUNTIME__?.mapReady === true, null, markerOptions());
    const proof = await frame.evaluate(() => {
      const runtime = window.__HONUA_INCIDENT_RUNTIME__;
      return { status: runtime?.status, visibleIncidentCount: runtime?.visibleIncidentCount, cursor: runtime?.cursor };
    });
    if (!(proof.visibleIncidentCount > 0) || /error|failed/iu.test(proof.status ?? "")) throw new Error(`Realtime incident proof incomplete: ${JSON.stringify(proof)}`);
  }],
  ["migration-workbench", async (frame) => {
    await frame.waitForFunction(() => window.__HONUA_MIGRATION_WORKBENCH__?.ready === true || Boolean(window.__HONUA_MIGRATION_WORKBENCH__?.error), null, markerOptions());
    const proof = await frame.evaluate(() => ({ ready: window.__HONUA_MIGRATION_WORKBENCH__?.ready, error: window.__HONUA_MIGRATION_WORKBENCH__?.error, hasModel: Boolean(window.__HONUA_MIGRATION_WORKBENCH__?.model) }));
    if (!proof.ready || proof.error || !proof.hasModel) throw new Error(`Migration artifact proof incomplete: ${JSON.stringify(proof)}`);
    if ((await frame.locator('#runtime-status[data-status="passed"]').count()) !== 1) throw new Error("Migration browser proof did not pass");
  }],
]);

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const localServer = configuredBaseUrl ? null : createStaticServer();
  if (localServer) await listen(localServer);
  const baseUrl = configuredBaseUrl ? normalizeBaseUrl(configuredBaseUrl) : `http://127.0.0.1:${localServer.address().port}`;
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ headless: true });
    const cards = await discoverCards(browser, baseUrl);
    if (cards.length === 0) throw new Error("gallery root contains no admitted cards");
    const identities = new Set();
    for (const card of cards) {
      if (identities.has(card.id)) throw new Error(`gallery root contains duplicate card id ${JSON.stringify(card.id)}`);
      identities.add(card.id);
      results.push(await verifyCard(browser, baseUrl, card));
    }
  } finally {
    if (browser) await browser.close();
    if (localServer?.listening) await close(localServer);
  }

  const receipt = {
    format: "honua.samples.gallery-live-smoke.v1",
    generatedAt: new Date().toISOString(),
    baseUrl,
    expectedSourceCommit: expectedSourceCommit ?? null,
    summary: {
      total: results.length,
      runnable: results.filter((result) => result.runnable).length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
    },
    results,
  };
  await writeFile(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(receipt.summary)}\n`);
  for (const result of results) {
    process.stdout.write(`${result.passed ? "PASS" : "FAIL"} ${result.id} [${result.contentKind}]${result.runnable ? " runnable" : ""}\n`);
    for (const failure of result.failures) process.stdout.write(`  ${failure}\n`);
  }
  if (receipt.summary.failed > 0) process.exitCode = 1;
}

async function discoverCards(browser, baseUrl) {
  const page = await browser.newPage();
  try {
    const attempts = expectedSourceCommit ? 18 : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const response = await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });
      if (!response || response.status() !== 200) throw new Error(`gallery root returned ${response?.status() ?? "no response"}`);
      if (!expectedSourceCommit || (await page.locator(".site-footer").innerText()).includes(expectedSourceCommit.slice(0, 12))) break;
      if (attempt === attempts) throw new Error(`deployed gallery did not reach expected source commit ${expectedSourceCommit}`);
      await page.waitForTimeout(5_000);
    }
    return await page.locator(".card[data-id]").evaluateAll((nodes) => nodes.map((node) => {
      const actions = [...node.querySelectorAll(".card-actions a")];
      const heading = node.querySelector("h3 a");
      return {
        id: node.getAttribute("data-id") ?? "",
        contentKind: node.getAttribute("data-content-kind") ?? "",
        source: node.getAttribute("data-source") ?? "",
        jobPage: node.getAttribute("data-job-page") === "yes",
        runnable: node.getAttribute("data-runnable") === "yes",
        title: heading?.textContent?.trim() ?? "",
        detailHref: heading?.getAttribute("href") ?? "",
        actions: actions.map((action) => ({ href: action.getAttribute("href") ?? "", text: action.textContent?.trim() ?? "" })),
      };
    }));
  } finally {
    await page.close();
  }
}

async function verifyCard(browser, baseUrl, card) {
  const page = await browser.newPage();
  const failures = [];
  let screenshot = null;
  const appFailures = [];
  const isAppUrl = (value) => {
    try {
      return new URL(value, `${baseUrl}/`).pathname.startsWith(`/sdk/${card.id}/app/`);
    } catch {
      return false;
    }
  };
  const isAppRequest = (request) => {
    try {
      return isAppUrl(request.frame().url());
    } catch {
      return false;
    }
  };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (isAppUrl(message.location().url)) appFailures.push(`console: ${message.text()}`);
    else if (card.jobPage) failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => (card.jobPage ? failures : appFailures).push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (isAppRequest(request) && !isAllowedAbort(card.id, request)) appFailures.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
  });
  page.on("response", (response) => {
    if (isAppRequest(response.request()) && response.status() >= 400 && new URL(response.url()).pathname !== "/favicon.ico") appFailures.push(`response: ${response.status()} ${response.request().method()} ${response.url()}`);
  });

  try {
    validateRootCardContract(card, baseUrl, failures);
    const detailUrl = new URL(card.detailHref, `${baseUrl}/`).toString();
    const response = await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: navigationTimeoutMs });
    if (!response || response.status() !== 200) failures.push(`detail navigation returned ${response?.status() ?? "no response"}`);
    const title = (await page.title()).trim();
    const heading = normalizeText(await page.locator("main > h1").innerText());
    if (!title || !title.includes(card.title)) failures.push(`detail title does not contain card title: ${JSON.stringify(title)}`);
    if (heading !== normalizeText(card.title)) failures.push(`detail h1 ${JSON.stringify(heading)} does not match card title ${JSON.stringify(card.title)}`);
    const label = normalizeText(await page.locator("main > .content-kind-label").innerText()).toLowerCase();
    if (label !== card.contentKind) failures.push(`detail content-kind label ${JSON.stringify(label)} does not match ${card.contentKind}`);
    await validateDetailContract(page, card, failures);

    if (card.runnable) {
      const assertion = semanticAssertions.get(card.id);
      if (!assertion) {
        failures.push("runnable card has no registered semantic success assertion");
      } else {
        const iframe = page.locator("iframe[title$='-- running sample']");
        if ((await iframe.count()) !== 1) {
          failures.push("detail page does not contain exactly one running-sample iframe");
        } else {
          await iframe.scrollIntoViewIfNeeded();
          const handle = await iframe.elementHandle();
          const frame = await handle?.contentFrame();
          if (!frame) {
            failures.push("running-sample iframe did not mount a frame");
          } else {
            await frame.locator("body").waitFor({ state: "visible", timeout: navigationTimeoutMs });
            const body = normalizeText(await frame.locator("body").innerText());
            if (!body) failures.push("running-sample iframe body is empty");
            for (const signal of ["Demo error:", "Unable to load /", "No runnable build published yet"]) {
              if (body.includes(signal)) failures.push(`visible iframe failure signal: ${signal}`);
            }
            try {
              await assertion(frame);
            } catch (error) {
              failures.push(`semantic assertion: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      }
      failures.push(...appFailures);
    } else if ((await page.locator("iframe[title$='-- running sample']").count()) !== 0) {
      failures.push("non-runnable card unexpectedly embeds a running sample");
    }
  } catch (error) {
    failures.push(`verification: ${error instanceof Error ? error.message : String(error)}`);
  }

  const uniqueFailures = [...new Set(failures)];
  if (uniqueFailures.length > 0) {
    screenshot = `${card.id}.png`;
    await page.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: true });
  }
  await page.close();
  return { id: card.id, title: card.title, contentKind: card.contentKind, source: card.source, runnable: card.runnable, passed: uniqueFailures.length === 0, failures: uniqueFailures, screenshot };
}

function validateRootCardContract(card, baseUrl, failures) {
  if (!card.id || !card.title) failures.push("card identity or title is empty");
  if (!new Set(["example", "walkthrough", "project"]).has(card.contentKind)) failures.push(`unsupported content kind ${JSON.stringify(card.contentKind)}`);
  if (card.actions.length !== 2) failures.push(`card must expose exactly two actions, found ${card.actions.length}`);
  const [primary, secondary] = card.actions;
  const detailUrl = new URL(card.detailHref, `${baseUrl}/`);
  if (detailUrl.origin !== new URL(baseUrl).origin) failures.push("card detail route is not gallery-local");
  if (card.jobPage) {
    if (detailUrl.pathname !== `/jobs/${card.id}/`) failures.push("job card detail route is not canonical");
    if (card.contentKind === "project") {
      if (!isJobContract(primary?.href, card.id)) failures.push("job project primary action is not its governed contract");
      if (new URL(secondary?.href ?? "", `${baseUrl}/`).pathname !== detailUrl.pathname) failures.push("job project secondary action is not its local overview");
    } else {
      if (new URL(primary?.href ?? "", `${baseUrl}/`).pathname !== detailUrl.pathname) failures.push("job primary action is not its local server-first route");
      if (!isJobContract(secondary?.href, card.id)) failures.push("job secondary action is not its governed contract");
    }
    return;
  }
  if (card.contentKind === "project") {
    if (!isSdkExampleFolder(primary?.href, card.id)) failures.push("project primary action is not its complete SDK example folder");
    if (new URL(secondary?.href ?? "", `${baseUrl}/`).pathname !== detailUrl.pathname) failures.push("project secondary action is not its local overview");
  } else {
    if (new URL(primary?.href ?? "", `${baseUrl}/`).pathname !== detailUrl.pathname) failures.push(`${card.contentKind} primary action is not its local detail/code route`);
    if (!/^https:\/\/github\.com\/honua-io\/(honua-sdk-js|honua-samples)\//u.test(secondary?.href ?? "")) failures.push(`${card.contentKind} secondary action is not GitHub source`);
  }
}

async function validateDetailContract(page, card, failures) {
  if (card.jobPage) {
    await validateJobDetailContract(page, card, failures);
    return;
  }
  const position = async (selector) => page.locator("main").evaluate((main, value) => main.innerHTML.indexOf(value), selector);
  const embedPosition = await position('class="embed-panel"');
  const sourcePosition = await position('class="project-source-panel"');
  failures.push(...detailStructureFailures({
    contentKind: card.contentKind,
    runnable: card.runnable,
    embedPosition,
    codePosition: await position('class="code-view'),
    guidePosition: await position('class="walkthrough-guide"'),
    guideStepCount: await page.locator(".walkthrough-guide ol > li").count(),
    expectedOutcomeCount: await page.locator(".walkthrough-guide .expected-outcome").count(),
    sourcePosition,
    codeViewCount: await page.locator(".code-view").count(),
  }));
  if (card.contentKind === "project") {
    const href = await page.locator(".project-source-panel a.button.primary").getAttribute("href");
    if (!isSdkExampleFolder(href, card.id)) failures.push("project detail primary action is not its complete SDK example folder");
  }
}

async function validateJobDetailContract(page, card, failures) {
  if ((await page.locator("main > .server-contract").count()) !== 1) failures.push("job detail has no direct server contract panel");
  const serverLeads = await page.locator("main").evaluate((main) => {
    const server = main.querySelector(".server-contract");
    const task = main.querySelector(".job-language-section,.walkthrough-guide,.project-source-panel,.job-reference");
    return Boolean(server && task && (server.compareDocumentPosition(task) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  if (!serverLeads) failures.push("job server contract does not lead task content");
  const protocols = await page.locator(".server-protocol").count();
  if (protocols < 1) failures.push("job detail has no raw protocol contract");
  if ((await page.locator('.request-response-inspector[data-kind="request"]').count()) !== protocols) failures.push("job raw request inspector count does not match protocols");
  if ((await page.locator('.request-response-inspector[data-kind="response"]').count()) !== protocols) failures.push("job raw response inspector count does not match protocols");
  if ((await page.locator('.request-response-inspector[data-kind="request"] [data-copy-target]').count()) !== protocols) failures.push("job raw requests do not all expose copy");
  if ((await page.locator('.request-response-inspector[data-kind="response"] [data-download-target]').count()) !== protocols) failures.push("job raw responses do not all expose download");
  const surfaces = await page.locator(".job-reference tbody tr").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-reference-surface")));
  if (JSON.stringify(surfaces) !== JSON.stringify(["http", "cli", "javascript", "python", "dotnet"])) failures.push("job reference matrix is not the exact five-surface contract");
  if ((await page.locator('.job-tabs [role="tab"]').count()) !== 3 || (await page.locator('.job-tab-panels [role="tabpanel"]').count()) !== 3) failures.push("job language tabs are not exactly JavaScript, Python, and .NET");
  if ((await page.locator("iframe").count()) !== 0) failures.push("job contract unexpectedly embeds a runnable frame");
  if ((await page.locator('.job-console[data-console-state="planned"] .console-visual img').count()) !== 0) failures.push("planned Console state fabricates a screenshot");
  if (card.contentKind === "example") {
    if ((await page.locator(".job-language-section .job-code-view").count()) < 1) failures.push("job example has no inline SDK code");
  } else if (card.contentKind === "walkthrough") {
    if ((await page.locator(".job-walkthrough ol > li").count()) < 3) failures.push("job walkthrough has fewer than three ordered steps");
    if ((await page.locator(".job-walkthrough .expected-outcome").count()) !== 1) failures.push("job walkthrough has no final semantic assertion");
  } else if (card.contentKind === "project") {
    if ((await page.locator(".project-source-panel.project-status-planned").count()) !== 1) failures.push("job project has no planned architecture/source panel");
    if ((await page.locator(".code-view").count()) !== 0) failures.push("job project incorrectly presents a primary code file");
    const href = await page.locator(".project-source-panel a.button.primary").getAttribute("href");
    if (!isJobContract(href, card.id)) failures.push("job project primary detail action is not its governed contract");
  }
}

function isAllowedAbort(sampleId, request) {
  return sampleId === "overture-geoparquet" && request.failure()?.errorText === "net::ERR_ABORTED" && /duckdb|eh\.wasm|mvp\.wasm/iu.test(request.url());
}

function isSdkExampleFolder(href, id) {
  return href === `https://github.com/honua-io/honua-sdk-js/tree/${SDK_PRODUCER_LOCK.revision}/examples/${id}`;
}

function isJobContract(href, id) {
  return href === `https://github.com/honua-io/honua-samples/blob/trunk/jobs/${id}.json`;
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function markerOptions(timeout = navigationTimeoutMs) {
  return { timeout };
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("GALLERY_BASE_URL must use http or https");
  return url.toString().replace(/\/+$/u, "");
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer, received ${JSON.stringify(value)}`);
  return parsed;
}

function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "index.html";
      let filePath = path.resolve(siteRoot, relativePath);
      if (filePath !== siteRoot && !filePath.startsWith(`${siteRoot}${path.sep}`)) return sendStatus(response, 400, "Invalid path");
      const metadata = await stat(filePath);
      if (metadata.isDirectory()) filePath = path.join(filePath, "index.html");
      await sendFile(request, response, filePath);
    } catch (error) {
      if (error?.code === "ENOENT") return sendStatus(response, 404, "Not found");
      console.error(`gallery static server error: ${error instanceof Error ? error.message : String(error)}`);
      sendStatus(response, 500, "Internal server error");
    }
  });
}

async function sendFile(request, response, filePath) {
  const metadata = await stat(filePath);
  const range = parseRange(request.headers.range, metadata.size);
  const headers = { "accept-ranges": "bytes", "cache-control": "no-store", "content-type": mediaTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream" };
  if (range) {
    const length = range.end - range.start + 1;
    response.writeHead(206, { ...headers, "content-length": length, "content-range": `bytes ${range.start}-${range.end}/${metadata.size}` });
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
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function sendStatus(response, status, message) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
