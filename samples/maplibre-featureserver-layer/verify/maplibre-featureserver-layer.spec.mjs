// Playwright verification for samples/maplibre-featureserver-layer: the page
// is pointed at a FeatureServer seeded from the committed fixture (every
// assertion is computed from that fixture), then at its public-live defaults.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { BROWSER_ORIGIN_PORT, loadFixture, seedFeatureService, serverEnv } from "../../../scripts/browser-verification/harness.mjs";
import { startStaticServer } from "../../../scripts/lib/browser-lane.mjs";

const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = "/maplibre-featureserver-layer/src/index.html";
// The page records navigation-to-rendered time; the live lane holds it to 5 s
// unless HONUA_SAMPLE_LIVE_BUDGET_MS widens it (e.g. on an overloaded host).
const LIVE_BUDGET_MS = Number(process.env.HONUA_SAMPLE_LIVE_BUDGET_MS ?? 5_000);

test.describe.configure({ mode: "serial" });

let fixture;
let service;
let staticServer;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  fixture = await loadFixture();
  service = await seedFeatureService({ prefix: "pw-maplibre-fs", allowAnonymous: true });
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

test("draws the fixture layer, fits it, and opens a popup on click", async ({ page }, testInfo) => {
  await page.goto(
    pageUrl({ baseUrl: serverEnv().baseUrl, service: service.serviceName, layer: String(service.layerId), labelField: "properties.name" }),
  );
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass", { timeout: 30_000 });
  await expect(page.locator("body")).toHaveAttribute("data-feature-count", String(fixture.count));
  expect(Number(await page.locator("body").getAttribute("data-rendered-features"))).toBeGreaterThan(0);
  await expect(page.locator("#requests")).toContainText(`${service.layerUrl}/query?`);

  // fitBounds put every fixture polygon in view: each interior point renders the layer.
  const hits = await page.evaluate(
    (points) => points.map((point) => window.sampleMap.queryRenderedFeatures(window.sampleMap.project(point), { layers: ["layer-fill"] }).length),
    fixture.features.map((feature) => feature.interior),
  );
  expect(hits.every((count) => count > 0)).toBe(true);

  const first = fixture.features[0];
  const [x, y] = await page.evaluate((point) => {
    const { x, y } = window.sampleMap.project(point);
    return [x, y];
  }, first.interior);
  const box = await page.locator("#map").boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
  await expect(page.locator(".maplibregl-popup .popup-title")).toHaveText(first.name);
  await page.screenshot({ path: testInfo.outputPath("maplibre-featureserver-layer-fixture.png") });
});

test("reports a missing service with the server's error message", async ({ page }) => {
  await page.goto(pageUrl({ baseUrl: serverEnv().baseUrl, service: `${service.serviceName}-missing`, layer: String(service.layerId) }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail", { timeout: 30_000 });
  await expect(page.locator("#status")).toHaveText("FAIL: Not Found");
});

// dataMode "public-live": the page's defaults (maui-place-names layer 6) must
// render on the public deployment in under five seconds.
test("renders its default public-live layer", async ({ page }, testInfo) => {
  const target = (process.env.HONUA_SAMPLE_TARGET_BASE_URL ?? "").replace(/\/+$/, "");
  await page.goto(pageUrl(target ? { baseUrl: target } : {}));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass", { timeout: 30_000 });
  expect(Number(await page.locator("body").getAttribute("data-feature-count"))).toBeGreaterThan(0);
  expect(Number(await page.locator("body").getAttribute("data-rendered-features"))).toBeGreaterThan(0);
  expect(Number(await page.locator("body").getAttribute("data-sample-elapsed-ms"))).toBeLessThan(LIVE_BUDGET_MS);
  await page.screenshot({ path: testInfo.outputPath("maplibre-featureserver-layer-live.png") });
});
