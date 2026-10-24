// Playwright verification for samples/esri-leaflet-featurelayer: stock
// Leaflet + esri-leaflet pointed at a FeatureServer layer seeded from the
// committed fixture must draw every fixture polygon and open a popup; an
// invalid where clause must surface as a failure; and the page's public-live
// default (maui-inspections layer 12, filtered) must draw its markers.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { BROWSER_ORIGIN_PORT, loadFixture, seedFeatureService } from "../../../scripts/browser-verification/harness.mjs";
import { startStaticServer } from "../../../scripts/lib/browser-lane.mjs";

const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = "/esri-leaflet-featurelayer/src/index.html";
const LIVE_BUDGET_MS = Number(process.env.HONUA_SAMPLE_LIVE_BUDGET_MS ?? 5_000);
const DRAWN = ".leaflet-overlay-pane path.leaflet-interactive";

test.describe.configure({ mode: "serial" });

let fixture;
let service;
let staticServer;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  fixture = await loadFixture();
  service = await seedFeatureService({ prefix: "pw-esri-leaflet", allowAnonymous: true });
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

test("draws every fixture feature and opens a popup", async ({ page }, testInfo) => {
  await page.goto(pageUrl({ url: service.layerUrl, where: "1=1" }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass", { timeout: 30_000 });
  await expect(page.locator("body")).toHaveAttribute("data-feature-count", String(fixture.count));
  await expect(page.locator(DRAWN)).toHaveCount(fixture.count);
  await expect(page.locator("#requests")).toContainText(`GET ${service.layerUrl}/query?`);

  const first = fixture.features[0];
  const point = await page.evaluate(([lng, lat]) => {
    const { x, y } = window.sampleMap.latLngToContainerPoint([lat, lng]);
    return { x, y };
  }, first.interior);
  const box = await page.locator("#map").boundingBox();
  await page.mouse.click(box.x + point.x, box.y + point.y);
  await expect(page.locator(".leaflet-popup-content")).toContainText(first.name);
  await page.screenshot({ path: testInfo.outputPath("esri-leaflet-featurelayer-fixture.png") });
});

test("reports an invalid where clause", async ({ page }) => {
  await page.goto(pageUrl({ url: service.layerUrl, where: "name =" }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail", { timeout: 30_000 });
  await expect(page.locator("#status")).toHaveText(/^FAIL: /);
  await expect(page.locator(DRAWN)).toHaveCount(0);
});

test("draws its default public-live layer", async ({ page }, testInfo) => {
  const target = (process.env.HONUA_SAMPLE_TARGET_BASE_URL ?? "").replace(/\/+$/, "");
  await page.goto(pageUrl(target ? { url: `${target}/rest/services/maui-inspections/FeatureServer/12` } : {}));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass", { timeout: 30_000 });
  const count = Number(await page.locator("body").getAttribute("data-feature-count"));
  expect(count).toBeGreaterThan(0);
  await expect(page.locator(DRAWN)).toHaveCount(count);
  expect(Number(await page.locator("body").getAttribute("data-sample-elapsed-ms"))).toBeLessThan(LIVE_BUDGET_MS);
  await page.screenshot({ path: testInfo.outputPath("esri-leaflet-featurelayer-live.png") });
});
