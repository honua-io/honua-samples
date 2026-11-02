// Playwright verification for samples/wms-getmap-check: the page is pointed
// at a WMS-enabled service seeded from the committed fixture and must draw a
// PNG of exactly the requested size for the fixture layer; a missing service
// must report FAIL; and the public-live default must draw on the public
// deployment within the time budget.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { BROWSER_ORIGIN_PORT, loadFixture, seedFeatureService, serverEnv } from "../../../scripts/browser-verification/harness.mjs";
import { startStaticServer } from "../../../scripts/lib/browser-lane.mjs";

const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = "/wms-getmap-check/src/index.html";
const LIVE_BUDGET_MS = Number(process.env.HONUA_SAMPLE_LIVE_BUDGET_MS ?? 5_000);
const FIXTURE_SIZE = { width: "317", height: "241" };
const CAPABILITIES_TIMEOUT_MS = 30_000;

test.describe.configure({ mode: "serial" });

let fixture;
let service;
let staticServer;

function fixtureBbox() {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of fixture.features) {
    for (const [lng, lat] of feature.ring) {
      box[0] = Math.min(box[0], lng); box[1] = Math.min(box[1], lat);
      box[2] = Math.max(box[2], lng); box[3] = Math.max(box[3], lat);
    }
  }
  const pad = 0.005;
  return [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad].map((n) => n.toFixed(4)).join(",");
}

// Publishing and protocol changes invalidate metadata asynchronously, so the
// WMS document is polled until it advertises the fixture layer.
async function waitForWmsLayer(wmsUrl, layerName) {
  const query = new URLSearchParams({ SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetCapabilities" });
  const deadline = Date.now() + CAPABILITIES_TIMEOUT_MS;
  let last = "no response";
  for (;;) {
    const response = await fetch(`${wmsUrl}?${query}`).catch((error) => ({ ok: false, status: 0, text: async () => error.message }));
    const xml = await response.text();
    if (response.ok && xml.includes(`<Name>${layerName}</Name>`)) return;
    last = `HTTP ${response.status}: ${xml.slice(0, 300)}`;
    if (Date.now() >= deadline) throw new Error(`${wmsUrl} did not advertise ${layerName} within ${CAPABILITIES_TIMEOUT_MS} ms: ${last}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  fixture = await loadFixture();
  service = await seedFeatureService({ prefix: "pw-wms-getmap", allowAnonymous: true, protocols: ["Wms"] });
  service.wmsUrl = `${serverEnv().baseUrl}/ogc/services/${service.serviceName}/wms`;
  await waitForWmsLayer(service.wmsUrl, service.layerName);
  staticServer = await startStaticServer({ rootDir: SAMPLES_DIR, port: BROWSER_ORIGIN_PORT });
});

test.afterAll(async () => {
  await staticServer?.close();
});

function pageUrl(params) {
  const url = new URL(PAGE, staticServer.url);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
}

test("draws a correctly sized GetMap PNG of the fixture layer", async ({ page }, testInfo) => {
  await page.goto(pageUrl({ baseUrl: serverEnv().baseUrl, service: service.serviceName, bbox: fixtureBbox(), ...FIXTURE_SIZE }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass", { timeout: 30_000 });
  await expect(page.locator("body")).toHaveAttribute("data-layer-name", service.layerName);
  await expect(page.locator("body")).toHaveAttribute("data-image-width", FIXTURE_SIZE.width);
  await expect(page.locator("body")).toHaveAttribute("data-image-height", FIXTURE_SIZE.height);
  expect(Number(await page.locator("body").getAttribute("data-image-bytes"))).toBeGreaterThan(100);
  await expect(page.locator("#requests")).toContainText(`GET ${service.wmsUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`);
  await expect(page.locator("#requests")).toContainText(`REQUEST=GetMap&LAYERS=${service.layerName}&`);
  await expect(page.locator("#requests")).toContainText(`WIDTH=${FIXTURE_SIZE.width}&HEIGHT=${FIXTURE_SIZE.height}&FORMAT=image%2Fpng`);
  await expect(page.locator("#detail")).toContainText(service.layerName);
  await expect(page.locator("#detail")).toContainText("EPSG:4326");
  expect(await page.evaluate(() => window.sampleMap.getLayer("getmap-image") !== undefined && window.sampleMap.isSourceLoaded("getmap"))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("wms-getmap-check-fixture.png") });
});

test("reports a missing service", async ({ page }) => {
  await page.goto(pageUrl({ baseUrl: serverEnv().baseUrl, service: `${service.serviceName}-missing` }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail", { timeout: 30_000 });
  await expect(page.locator("#status")).toHaveText(/^FAIL: /);
  expect(await page.evaluate(() => window.sampleMap.getLayer("getmap-image") === undefined)).toBe(true);
});

// dataMode "public-live": the page's defaults (maui-buildings around Kahului,
// 640x427) must draw on the public deployment in under five seconds.
test("draws its default public-live layer", async ({ page }, testInfo) => {
  const target = (process.env.HONUA_SAMPLE_TARGET_BASE_URL ?? "").replace(/\/+$/, "");
  await page.goto(pageUrl(target ? { baseUrl: target } : {}));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass", { timeout: 30_000 });
  await expect(page.locator("body")).toHaveAttribute("data-image-width", "640");
  await expect(page.locator("body")).toHaveAttribute("data-image-height", "427");
  expect(await page.locator("body").getAttribute("data-layer-name")).toBeTruthy();
  const elapsed = Number(await page.locator("body").getAttribute("data-sample-elapsed-ms"));
  testInfo.annotations.push({ type: "live-elapsed-ms", description: String(elapsed) });
  expect(elapsed).toBeLessThan(LIVE_BUDGET_MS);
  await page.screenshot({ path: testInfo.outputPath("wms-getmap-check-live.png") });
});
