#!/usr/bin/env node

import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { loadJobPages } from "./validate-job-pages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(root, "site");
const evidenceDir = path.join(root, ".artifacts", "gallery-browser-smoke");
const jobs = await loadJobPages({ root });
const server = createStaticServer();
await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
const results = [];

try {
  const index = await context.newPage();
  await index.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  for (const job of jobs) {
    const failures = [];
    const check = (condition, message) => {
      if (!condition) failures.push(message);
    };
    check(await index.locator(`.card[data-id="${job.id}"][data-job-page="yes"]`).count() === 1, "root must contain exactly one canonical job card");

    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    try {
      const response = await page.goto(`${baseUrl}/jobs/${job.id}/`, { waitUntil: "domcontentloaded" });
      check(response?.status() === 200, `route returned ${response?.status() ?? "no response"}`);
      check((await page.locator("main > h1").innerText()).trim() === job.title, "h1 does not match the contract title");
      check((await page.locator("main > .content-kind-label").innerText()).trim().toLowerCase() === job.kind, "content-kind label does not match");
      check(await page.locator("main > .server-contract").count() === 1, "server-first contract panel is missing");
      const serverBeforeTask = await page.locator("main").evaluate((main) => {
        const serverPanel = main.querySelector(".server-contract");
        const taskPanel = main.querySelector(".job-language-section,.walkthrough-guide,.project-source-panel,.job-reference");
        return Boolean(serverPanel && taskPanel && (serverPanel.compareDocumentPosition(taskPanel) & Node.DOCUMENT_POSITION_FOLLOWING));
      });
      check(serverBeforeTask, "server contract does not lead task content");
      check(await page.locator(".server-protocol").count() === job.server.protocols.length, "protocol panel count does not match contract");
      check(await page.locator('.request-response-inspector[data-kind="request"]').count() === job.server.protocols.length, "raw request inspector count does not match protocols");
      check(await page.locator('.request-response-inspector[data-kind="response"]').count() === job.server.protocols.length, "raw response inspector count does not match protocols");
      check(await page.locator('.request-response-inspector[data-kind="request"] [data-copy-target]').count() === job.server.protocols.length, "request inspectors must all expose copy");
      check(await page.locator('.request-response-inspector[data-kind="response"] [data-download-target]').count() === job.server.protocols.length, "response inspectors must all expose download");
      const expectedOpenCount = job.server.protocols.filter((protocol) => /\bGET\b/u.test(protocol.method) && /^https?:\/\//u.test(protocol.concreteEndpoint ?? "")).length;
      check(await page.locator(".server-protocol .protocol-open").count() === expectedOpenCount, "conditional GET open actions do not match safe concrete endpoints");

      const referenceSurfaces = await page.locator(".job-reference tbody tr").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-reference-surface")));
      check(JSON.stringify(referenceSurfaces) === JSON.stringify(["http", "cli", "javascript", "python", "dotnet"]), "reference matrix surfaces are incomplete or reordered");
      check(await page.locator('.job-tabs [role="tab"]').count() === 3, "language chooser must expose exactly three tabs");
      check(await page.locator('.job-tab-panels [role="tabpanel"]').count() === 3, "language chooser must expose exactly three panels");
      for (const surface of ["javascript", "python", "dotnet"]) {
        await page.locator(`[data-job-tab="${surface}"]`).click();
        const panel = page.locator(`[role="tabpanel"][data-language="${surface}"]`);
        check(await panel.isVisible(), `${surface} panel did not become visible`);
        const ref = job.references.find((item) => item.surface === surface);
        check(ref.availability === "gap" ? await panel.locator(".language-gap").count() === 1 : await panel.locator(".job-code-view").count() === 1, `${surface} supported/gap state is not rendered truthfully`);
      }

      const copy = page.locator('.request-response-inspector[data-kind="request"] [data-copy-target]').first();
      await copy.click();
      const copyStatus = copy.locator("xpath=ancestor::section[1]//p[contains(@class,'inspector-status')]");
      await copyStatus.filter({ hasText: "Copied JSON" }).waitFor({ state: "visible" });
      check((await copyStatus.innerText()).includes("Copied JSON"), "copy affordance did not report success");
      const downloadButton = page.locator('.request-response-inspector[data-kind="response"] [data-download-target]').first();
      const [download] = await Promise.all([page.waitForEvent("download"), downloadButton.click()]);
      check(download.suggestedFilename().endsWith(".json"), "download affordance did not produce a JSON filename");

      if (job.walkthrough.length) {
        check(await page.locator(".job-walkthrough ol > li").count() === job.walkthrough.length, "ordered walkthrough count does not match contract");
        check(await page.locator(".job-walkthrough .expected-outcome").count() === 1, "walkthrough must expose one final semantic assertion");
      }
      if (job.kind === "project") {
        check(await page.locator(".project-source-panel.project-status-planned").count() === 1, "planned project source panel is missing");
        check(await page.locator(".code-view").count() === 0, "project must not present a primary code view");
      }
      check(await page.locator("iframe").count() === 0, "job contract unexpectedly embeds a runnable frame");
      const expectedImages = job.console.visual.state === "captured" ? 1 : 0;
      check(await page.locator(".job-console .console-visual img").count() === expectedImages, "console visual does not match governed capture state");
      failures.push(...runtimeErrors);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    } finally {
      await page.close();
    }
    results.push({ id: job.id, route: `/jobs/${job.id}/`, kind: job.kind, passed: failures.length === 0, failures: [...new Set(failures)] });
  }
  await index.close();
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

await mkdir(evidenceDir, { recursive: true });
const receipt = { format: "honua.samples.job-pages-browser.v1", generatedAt: new Date().toISOString(), summary: { total: results.length, passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length }, results };
await writeFile(path.join(evidenceDir, "job-pages.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.route}`);
  for (const failure of result.failures) console.log(`  ${failure}`);
}
if (receipt.summary.failed) process.exitCode = 1;

function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const relative = decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "index.html";
      let file = path.resolve(siteRoot, relative);
      if (file !== siteRoot && !file.startsWith(`${siteRoot}${path.sep}`)) return send(response, 400, "Invalid path");
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
      const body = await readFile(file);
      const type = file.endsWith(".html") ? "text/html; charset=utf-8" : file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream";
      response.writeHead(200, { "content-type": type, "content-length": body.length });
      response.end(body);
    } catch (error) {
      send(response, error?.code === "ENOENT" ? 404 : 500, error instanceof Error ? error.message : String(error));
    }
  });
}

function send(response, status, message) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}
