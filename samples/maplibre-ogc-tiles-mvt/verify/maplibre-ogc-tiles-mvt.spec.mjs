// Playwright verification for samples/maplibre-ogc-tiles-mvt: the page reads
// the OGC API Tiles tileset metadata of a collection seeded from the committed
// fixture, adds its vector tiles to MapLibre, and must render every fixture
// polygon; then it renders its public-live default (maui-buildings).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { BROWSER_ORIGIN_PORT, loadFixture, seedFeatureService, serverEnv } from "../../../scripts/browser-verification/harness.mjs";
import { startStaticServer } from "../../../scripts/lib/browser-lane.mjs";

const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = "/maplibre-ogc-tiles-mvt/src/index.html";
const LIVE_BUDGET_MS = Number(process.env.HONUA_SAMPLE_LIVE_BUDGET_MS ?? 5_000);
// demo.honua.io's cached tile routes answer CORS only for https://honua.io,
// https://www.honua.io and http://localhost:8123 (honua-demo-infra
// stacks/aws/cloudfront.tf, demo_cors), so the live spec serves the page there.
const LIVE_TILE_ORIGIN_PORT = Number(process.env.HONUA_SAMPLE_LIVE_TILE_ORIGIN_PORT ?? 8123);

test.describe.configure({ mode: "serial" });

let fixture;
let service;
let staticServer;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  fixture = await loadFixture();
  service = await seedFeatureService({ prefix: "pw-maplibre-mvt", allowAnonymous: true, protocols: ["OgcFeatures", "OGC-API-Tiles"] });
  staticServer = await startStaticServer({ rootDir: SAMPLES_DIR, port: BROWSER_ORIGIN_PORT });
});

test.afterAll(async () => {
  await staticServer?.close();
});

function pageUrl(origin, params) {
  const url = new URL(PAGE, origin);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
}

test("renders the fixture collection from its OGC API vector tiles", async ({ page }, testInfo) => {
  const { baseUrl } = serverEnv();
  const collection = String(service.layerId);
  await page.goto(pageUrl(staticServer.url, { baseUrl, collection, view: "extent", extrude: "false" }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass", { timeout: 30_000 });
  expect(Number(await page.locator("body").getAttribute("data-tile-requests"))).toBeGreaterThan(0);
  await expect(page.locator("#requests")).toContainText(
    `TILES ${baseUrl}/ogc/tiles/collections/${collection}/tiles/WebMercatorQuad/{z}/{y}/{x}`,
  );

  const hits = await page.evaluate(
    (points) => points.map((point) => window.sampleMap.queryRenderedFeatures(window.sampleMap.project(point), { layers: ["tiles-layer"] }).length),
    fixture.features.map((feature) => feature.interior),
  );
  expect(hits.every((count) => count > 0)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("maplibre-ogc-tiles-mvt-fixture.png") });
});

test("reports a collection without tiles", async ({ page }) => {
  await page.goto(pageUrl(staticServer.url, { baseUrl: serverEnv().baseUrl, collection: "no-such-collection", view: "extent" }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail", { timeout: 30_000 });
  await expect(page.locator("#status")).toHaveText(/^FAIL: /);
});

test("renders its default public-live tileset", async ({ page }, testInfo) => {
  const target = (process.env.HONUA_SAMPLE_TARGET_BASE_URL ?? "").replace(/\/+$/, "");
  const liveServer = await startStaticServer({ rootDir: SAMPLES_DIR, port: LIVE_TILE_ORIGIN_PORT });
  try {
    await page.goto(pageUrl(liveServer.url, target ? { baseUrl: target } : {}));
    await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass", { timeout: 30_000 });
    expect(Number(await page.locator("body").getAttribute("data-rendered-features"))).toBeGreaterThan(0);
    const elapsed = Number(await page.locator("body").getAttribute("data-sample-elapsed-ms"));
    testInfo.annotations.push({ type: "live-elapsed-ms", description: String(elapsed) });
    expect(elapsed).toBeLessThan(LIVE_BUDGET_MS);
    await page.screenshot({ path: testInfo.outputPath("maplibre-ogc-tiles-mvt-live.png") });
  } finally {
    await liveServer.close();
  }
});
