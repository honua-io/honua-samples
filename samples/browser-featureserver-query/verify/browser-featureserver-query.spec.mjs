// Playwright verification for samples/browser-featureserver-query: the page
// is served from the browser origin the composed server allows, pointed at a
// FeatureServer seeded from the committed fixture, and every assertion is
// computed from that fixture.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  BROWSER_ORIGIN_PORT,
  importedProperties,
  loadFixture,
  seedFeatureService,
  serverEnv,
} from "../../../scripts/browser-verification/harness.mjs";
import { startStaticServer } from "../../../scripts/lib/browser-lane.mjs";

const SAMPLES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test.describe.configure({ mode: "serial" });

let fixture;
let anonymousService;
let refusingService;
let staticServer;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  fixture = await loadFixture();
  anonymousService = await seedFeatureService({ prefix: "pw-browser-query", allowAnonymous: true });
  refusingService = await seedFeatureService({ prefix: "pw-browser-query-private", allowAnonymous: false });
  staticServer = await startStaticServer({ rootDir: SAMPLES_DIR, port: BROWSER_ORIGIN_PORT });
});

test.afterAll(async () => {
  await staticServer?.close();
});

function samplePage(params) {
  const url = new URL("/browser-featureserver-query/src/index.html", staticServer.url);
  url.searchParams.set("baseUrl", serverEnv().baseUrl);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
}

test("queries the fixture layer and renders its features", async ({ page }) => {
  await page.goto(samplePage({ service: anonymousService.serviceName }));

  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass");
  await expect(page.locator("#status")).toHaveText(
    `PASS: ${anonymousService.serviceName}/FeatureServer/${anonymousService.layerId} returned ${fixture.count} features.`,
  );
  await expect(page.locator("#status")).toHaveAttribute("data-state", "pass");

  const rendered = JSON.parse(await page.locator("#output").textContent());
  const byFixtureId = new Map(rendered.map((feature) => [importedProperties(feature.attributes).fixtureId, feature]));
  expect([...byFixtureId.keys()].sort()).toEqual(fixture.features.map((feature) => feature.fixtureId).sort());
  for (const expected of fixture.features) {
    const actual = byFixtureId.get(expected.fixtureId);
    expect(importedProperties(actual.attributes).name).toBe(expected.name);
    expect(actual.geometry.rings[0]).toEqual(expected.ring);
  }
});

test("reports a missing service with the server's error message", async ({ page }) => {
  await page.goto(samplePage({ service: `${anonymousService.serviceName}-missing` }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail");
  await expect(page.locator("#status")).toHaveText("FAIL: Not Found");
  await expect(page.locator("body")).toHaveAttribute("data-sample-error", "Not Found");
});

test("reports an invalid where clause with the server's error message", async ({ page }) => {
  await page.goto(samplePage({ service: anonymousService.serviceName, where: "name =" }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail");
  await expect(page.locator("#status")).toHaveText("FAIL: Bad Request");
  await expect(page.locator("#output")).toHaveText("");
});

test("reports a service that refuses anonymous reads", async ({ page }) => {
  await page.goto(samplePage({ service: refusingService.serviceName }));
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail");
  await expect(page.locator("#status")).toHaveText("FAIL: Unauthorized");
});
