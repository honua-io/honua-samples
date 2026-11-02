// Playwright verification for samples/geocode-single-line: the page geocodes
// the county building through the composed server's GeocodeServer and must pin
// it inside Maui Nui; an address with no candidate and a candidate outside
// the region must both report FAIL; and the public-live default must resolve
// on the public deployment within the time budget.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { BROWSER_ORIGIN_PORT, serverEnv } from "../../../scripts/browser-verification/harness.mjs";
import { startStaticServer } from "../../../scripts/lib/browser-lane.mjs";

const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = "/geocode-single-line/src/index.html";
const LIVE_BUDGET_MS = Number(process.env.HONUA_SAMPLE_LIVE_BUDGET_MS ?? 5_000);
const DEFAULT_ADDRESS = "200 S High St, Wailuku, HI";
const MAUI = [-157.35, 20.45, -155.95, 21.25];
const MARKER = ".maplibregl-marker";

test.describe.configure({ mode: "serial" });

let staticServer;
let composedGeocoder;

// The composed server has no fixture to seed for geocoding: it answers through
// whatever provider it is configured with. Probe once so the positive check
// can skip with the real reason instead of failing on a missing provider.
async function probeGeocoder(baseUrl) {
  const query = new URLSearchParams({ SingleLine: DEFAULT_ADDRESS, f: "json" });
  try {
    const response = await fetch(`${baseUrl}/rest/services/GeocodeServer/findAddressCandidates?${query}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) return { ok: false, reason: `composed GeocodeServer answered ${body.error?.message ?? `HTTP ${response.status}`}` };
    if (!body.candidates?.length) return { ok: false, reason: "composed GeocodeServer returned no candidate for the county building" };
    return { ok: true, reason: `composed GeocodeServer provider ${body.candidates[0].attributes?.Provider ?? "unknown"}` };
  } catch (error) {
    return { ok: false, reason: `composed GeocodeServer unreachable: ${error.message}` };
  }
}

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  composedGeocoder = await probeGeocoder(serverEnv().baseUrl);
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

function inside([minLon, minLat, maxLon, maxLat], x, y) {
  return x >= minLon && x <= maxLon && y >= minLat && y <= maxLat;
}

async function expectMatchOnMaui(page) {
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass", { timeout: 30_000 });
  const x = Number(await page.locator("body").getAttribute("data-match-x"));
  const y = Number(await page.locator("body").getAttribute("data-match-y"));
  expect(inside(MAUI, x, y)).toBe(true);
  expect(Number.isFinite(Number(await page.locator("body").getAttribute("data-score")))).toBe(true);
  expect(Number(await page.locator("body").getAttribute("data-candidate-count"))).toBeGreaterThan(0);
  await expect(page.locator(MARKER)).toHaveCount(1);
  await expect(page.locator(".maplibregl-popup .popup-title")).toBeVisible();
  await expect(page.locator("#requests")).toContainText("/rest/services/GeocodeServer/findAddressCandidates?SingleLine=");
}

test("pins the county building inside Maui Nui through the composed server", async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: "composed-geocoder", description: composedGeocoder.reason });
  test.skip(!composedGeocoder.ok, composedGeocoder.reason);
  await page.goto(pageUrl({ baseUrl: serverEnv().baseUrl }));
  await expectMatchOnMaui(page);
  await page.screenshot({ path: testInfo.outputPath("geocode-single-line-composed.png") });
});

test("reports an address with no candidate", async ({ page }) => {
  await page.goto(pageUrl({ baseUrl: serverEnv().baseUrl, address: "zzzz zzzz zzzz 00000" }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail", { timeout: 30_000 });
  await expect(page.locator("#status")).toHaveText(/^FAIL: /);
  await expect(page.locator(MARKER)).toHaveCount(0);
});

test("rejects a confident match outside the expected region", async ({ page }) => {
  test.skip(!composedGeocoder.ok, composedGeocoder.reason);
  await page.goto(pageUrl({ baseUrl: serverEnv().baseUrl, address: "380 New York St, Redlands, CA" }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail", { timeout: 30_000 });
  await expect(page.locator("#status")).toContainText("outside the expected region");
  await expect(page.locator(MARKER)).toHaveCount(0);
});

// dataMode "public-live": the page's default address must resolve on the
// public deployment, inside Maui Nui, in under five seconds.
test("resolves its default address on the public deployment", async ({ page }, testInfo) => {
  const target = (process.env.HONUA_SAMPLE_TARGET_BASE_URL ?? "").replace(/\/+$/, "");
  await page.goto(pageUrl(target ? { baseUrl: target } : {}));
  await expectMatchOnMaui(page);
  const elapsed = Number(await page.locator("body").getAttribute("data-sample-elapsed-ms"));
  testInfo.annotations.push({ type: "live-elapsed-ms", description: String(elapsed) });
  expect(elapsed).toBeLessThan(LIVE_BUDGET_MS);
  await page.screenshot({ path: testInfo.outputPath("geocode-single-line-live.png") });
});
