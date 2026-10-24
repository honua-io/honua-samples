// Playwright verification for samples/maplibre-category-style-legend: the page
// reads OGC API Features items from a collection seeded from the committed
// fixture, styles them by a category field and builds a legend; the legend,
// the rendered polygons and the popup are checked against the fixture. Then
// the public-live default (maui-zoning by zone_dist) must render.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { BROWSER_ORIGIN_PORT, loadFixture, seedFeatureService, serverEnv } from "../../../scripts/browser-verification/harness.mjs";
import { startStaticServer } from "../../../scripts/lib/browser-lane.mjs";

const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = "/maplibre-category-style-legend/src/index.html";
const LIVE_BUDGET_MS = Number(process.env.HONUA_SAMPLE_LIVE_BUDGET_MS ?? 5_000);

test.describe.configure({ mode: "serial" });

let fixture;
let fixtureCategories;
let service;
let staticServer;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  fixture = await loadFixture();
  fixtureCategories = new Map(fixture.geojson.features.map((feature) => [feature.properties.fixtureId, feature.properties.category]));
  service = await seedFeatureService({ prefix: "pw-maplibre-category", allowAnonymous: true, protocols: ["OgcFeatures"] });
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

test("styles the fixture by category and builds the legend from its values", async ({ page }, testInfo) => {
  // A file import keeps the fixture's GeoJSON properties in one nested
  // `properties` field, so the category is addressed by a dotted path.
  await page.goto(
    pageUrl({ baseUrl: serverEnv().baseUrl, collection: String(service.layerId), field: "properties.category", bbox: "none" }),
  );
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass", { timeout: 30_000 });
  await expect(page.locator("body")).toHaveAttribute("data-feature-count", String(fixture.count));

  const expected = [...new Set(fixtureCategories.values())].sort();
  await expect(page.locator("body")).toHaveAttribute("data-category-count", String(expected.length));
  // Every fixture category occurs once, so the legend is in alphabetical order with a count of 1.
  await expect(page.locator("#legend li .label")).toHaveText(expected);
  await expect(page.locator("#legend li .count")).toHaveText(expected.map(() => "1"));

  // Each fixture polygon renders under its own category class...
  const classes = await page.evaluate(
    (points) =>
      points.map((point) => {
        const [hit] = window.sampleMap.queryRenderedFeatures(window.sampleMap.project(point), { layers: ["features-fill"] });
        return hit?.properties.category_class ?? null;
      }),
    fixture.features.map((feature) => feature.interior),
  );
  expect(classes).toEqual(fixture.features.map((feature) => fixtureCategories.get(feature.fixtureId)));
  // ...and the match expression gives each legend entry its own colour.
  const swatches = await page.locator("#legend li .swatch").evaluateAll((nodes) => nodes.map((node) => node.style.background));
  expect(new Set(swatches).size).toBe(expected.length);
  const expression = await page.evaluate(() => window.sampleMap.getPaintProperty("features-fill", "fill-color"));
  for (const category of expected) expect(expression).toContain(category);

  const first = fixture.features[0];
  const [x, y] = await page.evaluate((point) => {
    const { x, y } = window.sampleMap.project(point);
    return [x, y];
  }, first.interior);
  const box = await page.locator("#map").boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
  await expect(page.locator(".maplibregl-popup .popup-title")).toHaveText(fixtureCategories.get(first.fixtureId));
  await page.screenshot({ path: testInfo.outputPath("maplibre-category-style-legend-fixture.png") });
});

test("reports a missing collection", async ({ page }) => {
  await page.goto(pageUrl({ baseUrl: serverEnv().baseUrl, collection: "no-such-collection", bbox: "none" }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail", { timeout: 30_000 });
  await expect(page.locator("#status")).toHaveText(/^FAIL: /);
});

test("styles its default public-live collection", async ({ page }, testInfo) => {
  const target = (process.env.HONUA_SAMPLE_TARGET_BASE_URL ?? "").replace(/\/+$/, "");
  await page.goto(pageUrl(target ? { baseUrl: target } : {}));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass", { timeout: 30_000 });
  expect(Number(await page.locator("body").getAttribute("data-rendered-features"))).toBeGreaterThan(0);
  expect(await page.locator("#legend li").count()).toBeGreaterThan(1);
  expect(Number(await page.locator("body").getAttribute("data-sample-elapsed-ms"))).toBeLessThan(LIVE_BUDGET_MS);
  await page.screenshot({ path: testInfo.outputPath("maplibre-category-style-legend-live.png") });
});
