// Playwright verification for samples/county-parcel-viewer, a built Vite app on
// @honua/sdk-js. The spec builds the committed app (npm ci, typecheck, vite
// build), serves dist/ under /county-parcel-viewer/app/ the way the gallery
// publishes it (so a non-relative asset path fails here), and drives it against
// the public-live demo server (HONUA_SAMPLE_TARGET_BASE_URL, default
// https://demo.honua.io).
//
// Live data changes when honua-demo-infra reseeds, so no zoning or flood value
// is pinned; the fixture lane with designed parcels (design R7, R9) is RT3.
// What this spec does pin:
//   - every request goes to the app's own origin or the data origin (R26);
//   - parcel outlines come from the PMTiles archive, never from REST (R24);
//   - TMK validation sends nothing for bad input (R4) and normalizes dashes;
//   - zoning and flood candidates are POSTed with the parcel polygon (R8);
//   - the D9 states: not found, flood/zoning failure and retry, overlap
//     unavailable, clipboard blocked, address search per the server's provider;
//   - click identify, pushState/popstate, the share and full-screen links.

import { cp, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { BROWSER_ORIGIN_PORT, runCommand } from "../../../scripts/browser-verification/harness.mjs";
import { startStaticServer } from "../../../scripts/lib/browser-lane.mjs";

const SAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = "/county-parcel-viewer/app/";
const DATA_BASE = (process.env.HONUA_SAMPLE_TARGET_BASE_URL || "https://demo.honua.io").replace(/\/+$/u, "");
const DATA_ORIGIN = new URL(DATA_BASE).origin;
const LIVE_BUDGET_MS = Number(process.env.HONUA_SAMPLE_LIVE_BUDGET_MS ?? 5_000);
const EXAMPLE_TMK = "234008053";
const PARCELS = `${DATA_BASE}/rest/services/maui-parcels/FeatureServer/1`;
// A downtown Wailuku parcel (200 S High St) and the island's largest parcel,
// whose 4,500-vertex outline exercises the POST candidate path.
const WAILUKU_TMK = "234008053";
const LARGE_TMK = "249002001";
// A coastal parcel in a VE flood zone, distinct from the example parcel.
const COASTAL_TMK = "215010777";

test.describe.configure({ mode: "serial" });

let siteRoot;
let server;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(600_000);
  const installed = await stat(path.join(SAMPLE_DIR, "node_modules", ".bin", "vite")).catch(() => null);
  if (!installed) await runCommand("npm", ["ci", "--no-audit", "--no-fund"], { cwd: SAMPLE_DIR, label: "npm ci" });
  await runCommand("npm", ["run", "build"], { cwd: SAMPLE_DIR, label: "npm run build" });
  siteRoot = await mkdtemp(path.join(tmpdir(), "county-parcel-viewer-"));
  await cp(path.join(SAMPLE_DIR, "dist"), path.join(siteRoot, ...APP_PATH.split("/").filter(Boolean)), { recursive: true });
  server = await startStaticServer({ rootDir: siteRoot, port: BROWSER_ORIGIN_PORT });
});

test.afterAll(async () => {
  await server?.close();
  if (siteRoot) await rm(siteRoot, { recursive: true, force: true });
});

function appUrl(params = {}) {
  const url = new URL(APP_PATH, server.url);
  if (DATA_BASE !== "https://demo.honua.io") url.searchParams.set("baseUrl", DATA_BASE);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
}

// Every request the page makes is recorded; afterEach fails the test if one
// left the app's own origin and the data origin (design R26). Navigation
// links (OpenStreetMap, FEMA, the assessor) are never followed.
let seen;
test.beforeEach(async ({ page }) => {
  seen = [];
  page.on("request", (request) => seen.push({ url: request.url(), method: request.method(), body: request.postData() }));
});

test.afterEach(async () => {
  const allowed = new Set([new URL(server.url).origin, DATA_ORIGIN]);
  const foreign = seen.map((r) => r.url).filter((url) => /^https?:/u.test(url) && !allowed.has(new URL(url).origin));
  expect(foreign, "requests outside the app origin and the data origin").toEqual([]);
});

async function settled(page, timeout = 60_000) {
  await expect(page.locator("body")).not.toHaveAttribute("data-sample-status", "loading", { timeout });
}

async function liveParcel(tmk) {
  const query = new URLSearchParams({ where: `tmk_txt='${tmk}'`, outFields: "tmk_txt,qpub_link", returnGeometry: "true", outSR: "4326", f: "json" });
  const body = await fetch(`${PARCELS}/query?${query}`).then((response) => response.json());
  return body.features?.[0];
}

async function liveParcelAt([x, y]) {
  const query = new URLSearchParams({ where: "1=1", geometry: `${x},${y}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "tmk_txt", returnGeometry: "false", f: "json" });
  const body = await fetch(`${PARCELS}/query?${query}`).then((response) => response.json());
  return body.features?.[0]?.attributes?.tmk_txt ?? null;
}

const queries = (filter) => seen.filter((r) => /\/FeatureServer\/\d+\/query/u.test(r.url) && filter(r));

test("first load shows the example parcel from PMTiles outlines within the live budget", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(appUrl());
  await settled(page);
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass");
  await expect(page.locator("#example-note")).toHaveText("Example parcel. Enter your parcel number above.");
  await expect(page.locator("#parcel-title")).toHaveText("TMK 2-3-4-008:053");
  await expect(page.locator("body")).toHaveAttribute("data-tmk", EXAMPLE_TMK);
  // The gallery smoke's rendered-result proof: outlines drawn from PMTiles.
  await expect.poll(async () => Number(await page.locator("body").getAttribute("data-rendered-features"))).toBeGreaterThan(0);
  expect(new URL(page.url()).searchParams.has("tmk"), "the example parcel leaves the URL clean (D20)").toBe(false);
  for (const section of ["zoning", "flood"]) {
    expect(["success", "empty"]).toContain(await page.locator("body").getAttribute(`data-${section}-state`));
  }
  await expect(page.locator("#zoning-body, #flood-body")).not.toContainText(["check failed"]);

  // Outlines: the PMTiles archive is read by range, the selected parcel is
  // drawn from it, and no parcel layer query ever asks for a bounding box.
  await expect(page.locator("body")).toHaveAttribute("data-map-state", "ready", { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.sampleMap.queryRenderedFeatures({ layers: ["parcel-selected-line"] }).length), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(seen.some((r) => r.url === `${DATA_BASE}/api/v1/tiles/pmtiles/maui-parcels-static`)).toBe(true);
  expect(queries((r) => r.url.startsWith(PARCELS) && /esriGeometryEnvelope/u.test(`${r.url}${r.body ?? ""}`))).toEqual([]);
  await expect(page.locator("#requests")).toContainText("maui-parcels-static  (PMTiles range bytes=");

  const elapsed = Number(await page.locator("body").getAttribute("data-first-result-ms"));
  testInfo.annotations.push({ type: "live-first-result-ms", description: String(elapsed) });
  expect(elapsed).toBeLessThan(LIVE_BUDGET_MS);
  await page.screenshot({ path: testInfo.outputPath("county-parcel-viewer-desktop.png") });
});

test("a shared ?tmk= link opens the parcel; the assessor and copy links are exact", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.url });
  const expected = await liveParcel(WAILUKU_TMK);
  test.skip(!expected, `${WAILUKU_TMK} is no longer in the live parcel layer`);
  await page.goto(appUrl({ tmk: WAILUKU_TMK }));
  await settled(page);
  await expect(page.locator("#parcel-title")).toHaveText("TMK 2-3-4-008:053");
  await expect(page.locator("#example-note")).toHaveCount(0);
  await expect(page.locator("#assessor-link")).toHaveAttribute("href", new URL(expected.attributes.qpub_link).toString());
  await expect(page.locator("#assessor-link")).toHaveAttribute("rel", /noopener/u);
  // The parcel record never labels the TMK "zone" field as zoning.
  await expect(page.locator(".limits")).toContainText("Land use");
  await expect(page.locator(".limits")).toContainText("Owner");

  await page.locator("#copy-link").click();
  await expect(page.locator(".copy-status")).toHaveText("Link copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(appUrl({ tmk: WAILUKU_TMK }));
});

test("TMK input: dashes normalize, a missing parcel says so, junk sends no request", async ({ page }) => {
  await page.goto(appUrl());
  await settled(page);

  await page.locator("#q").fill("2-1-5-010:077");
  await page.locator("#find").click();
  await settled(page);
  const lookup = queries((r) => r.url.startsWith(PARCELS) && r.url.includes("where=tmk_txt%3D%27215010077%27"));
  expect(lookup.length, "the normalized TMK reaches the where clause").toBe(1);
  const missing = (await liveParcel("215010077")) === undefined;
  if (missing) {
    await expect(page.locator("#panel-inner")).toHaveText("No parcel 215010077 in the county parcel layer");
    await expect(page.locator("#q")).toBeFocused();
    await expect(page.locator("#q")).toHaveValue("2-1-5-010:077");
  }

  const before = seen.length;
  await page.locator("#q").fill("abc'; or 1=1");
  await page.locator("#find").click();
  await expect(page.locator("#q-error")).toHaveText("Not a valid TMK (9 digits, e.g. 215010777)");
  await expect(page.locator("#q")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#q")).toHaveAttribute("aria-describedby", /q-error/u);
  await page.waitForTimeout(500);
  expect(seen.slice(before), "invalid input sends no request").toEqual([]);

  // A shared link with a bad TMK: the same message, and no parcel query.
  seen.length = 0;
  await page.goto(appUrl({ tmk: "12345" }));
  await expect(page.locator("#q-error")).toHaveText("Not a valid TMK (9 digits, e.g. 215010777)");
  await page.waitForTimeout(500);
  expect(queries(() => true)).toEqual([]);
});

test("a large parcel's zoning and flood candidates are POSTed with its polygon", async ({ page }) => {
  await page.goto(appUrl({ tmk: LARGE_TMK }));
  await settled(page, 90_000);
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass");
  for (const layer of ["maui-zoning/FeatureServer/2", "maui-flood-hazard/FeatureServer/4"]) {
    const posts = queries((r) => r.url.includes(layer) && r.method === "POST");
    expect(posts.length).toBeGreaterThan(0);
    expect(new URLSearchParams(posts[0].body).get("geometryType")).toBe("esriGeometryPolygon");
    expect(JSON.parse(new URLSearchParams(posts[0].body).get("geometry")).rings.length).toBeGreaterThan(0);
  }
  await expect(page.locator("#requests")).toContainText("maui-zoning/FeatureServer/2/query  (POST, geometry in body)");
  // Every listed share is a whole percent or "<1%" (D10), and each code is listed once (R11).
  const codes = (await page.locator("body").getAttribute("data-flood-codes")).split(" ").filter(Boolean);
  expect(new Set(codes.map((entry) => entry.split(":")[0])).size).toBe(codes.length);
  for (const entry of codes) expect(entry).toMatch(/^[A-Z]+:(<1|\d{1,3})%$/u);
});

test("a map click identifies the parcel by REST; Back returns to the previous one", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(appUrl({ tmk: WAILUKU_TMK }));
  await settled(page);
  await expect(page.locator("body")).toHaveAttribute("data-map-state", "ready", { timeout: 30_000 });
  await page.waitForFunction(() => !window.sampleMap.isMoving());

  // A point inside a neighboring lot, found on the map, then checked against REST.
  const box = await page.locator("#map").boundingBox();
  const target = { x: Math.round(box.width * 0.18), y: Math.round(box.height * 0.5) };
  const lngLat = await page.evaluate(({ x, y }) => window.sampleMap.unproject([x, y]).toArray(), target);
  const expected = await liveParcelAt(lngLat);
  test.skip(!expected || expected === WAILUKU_TMK, "no neighboring parcel at the probe point");
  await page.mouse.click(box.x + target.x, box.y + target.y);
  await expect(page.locator("body")).toHaveAttribute("data-tmk", expected, { timeout: 30_000 });
  await settled(page);
  expect(queries((r) => r.url.startsWith(PARCELS) && r.url.includes("esriGeometryPoint")).length).toBe(1);
  expect(new URL(page.url()).searchParams.get("tmk")).toBe(expected);

  await page.goBack();
  await expect(page.locator("body")).toHaveAttribute("data-tmk", WAILUKU_TMK, { timeout: 30_000 });
  await expect(page.locator("#parcel-title")).toHaveText("TMK 2-3-4-008:053");
});

test("flood and zoning failures are their own states, never the no-match text, and retry", async ({ page }) => {
  let failFlood = true;
  await page.route("**/maui-flood-hazard/FeatureServer/4/query", (route) => (failFlood ? route.fulfill({ status: 500, body: "{}" }) : route.continue()));
  await page.route("**/maui-zoning/FeatureServer/2/query", (route) => route.abort("failed"));
  await page.goto(appUrl({ tmk: WAILUKU_TMK }));
  await settled(page);
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail");
  await expect(page.locator("#flood-body")).toContainText("Flood check failed. We couldn't reach the county flood layer, so this parcel's flood zone is unknown. This is not the same as no flood zone.");
  await expect(page.locator("#flood-body")).not.toContainText("No flood zone found");
  await expect(page.locator("#zoning-body")).toContainText("Zoning check failed.");
  await expect(page.locator("#zoning-body")).not.toContainText("Not in the county zoning layer");
  await expect(page.locator("#flood-body [role=alert]")).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("county-parcel-viewer-flood-error.png") });

  failFlood = false;
  await page.getByRole("button", { name: "Retry flood check" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-flood-state", /^(success|empty)$/u, { timeout: 30_000 });
  await expect(page.locator("body")).toHaveAttribute("data-zoning-state", "error");
});

test("when the overlap math cannot load, both sections say so", async ({ page }) => {
  await page.route("**/assets/geometry-*.js", (route) => route.abort("failed"));
  await page.goto(appUrl({ tmk: WAILUKU_TMK }));
  await settled(page);
  await expect(page.locator("#zoning-body")).toHaveText("Overlap check unavailable");
  await expect(page.locator("#flood-body")).toContainText("Overlap check unavailable");
});

test("a blocked clipboard shows the link selected in a read-only box", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("blocked")) } });
  });
  await page.goto(appUrl({ tmk: WAILUKU_TMK }));
  await settled(page);
  await page.locator("#copy-link").click();
  await expect(page.locator("#share-url")).toHaveValue(appUrl({ tmk: WAILUKU_TMK }));
  await expect(page.locator("#share-url")).toHaveAttribute("readonly", "");
  await expect(page.locator("#share-url")).toBeFocused();
});

test("address search follows the server's geocoder provider", async ({ page }) => {
  const metadata = await fetch(`${DATA_BASE}/rest/services/World/GeocodeServer?f=json`).then((response) => response.json());
  const provider = String(metadata.locatorProperties?.Provider ?? "unknown");
  test.info().annotations.push({ type: "geocoder-provider", description: provider });
  await page.goto(appUrl());
  await settled(page);
  await page.locator("#q").fill("200 S High St, Wailuku, HI");
  await page.locator("#find").click();
  await settled(page);
  const candidates = seen.filter((r) => r.url.includes("/GeocodeServer/findAddressCandidates"));
  if (/nominatim|openstreetmap|\bosm\b/iu.test(provider)) {
    expect(candidates.length).toBe(1);
    await expect(page.locator("body")).toHaveAttribute("data-search-state", /^(found|picks)$/u);
  } else {
    // The page credits OpenStreetMap; it refuses any other provider before an address is sent.
    expect(candidates).toEqual([]);
    await expect(page.locator("#panel-inner [role=alert]")).toHaveText("Address search is unavailable right now. Search by TMK instead.");
  }
});

test("phone: sticky search, a 38vh map, the results sheet below it, 44px targets", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl({ tmk: WAILUKU_TMK }));
  await settled(page);
  const map = await page.locator(".map").boundingBox();
  const panel = await page.locator("#panel").boundingBox();
  expect(Math.abs(map.height - 844 * 0.38)).toBeLessThan(2);
  expect(panel.y).toBeGreaterThan(map.y + map.height - 20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const selector of ["#find", "#assessor-link", "#copy-link", ".maplibregl-ctrl-zoom-in", ".maplibregl-ctrl-zoom-out", ".tech summary"]) {
    const target = await page.locator(selector).boundingBox();
    expect(target.height, `${selector} height`).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: testInfo.outputPath("county-parcel-viewer-phone.png"), fullPage: true });
});

test("keyboard search moves focus to the parcel heading", async ({ page }) => {
  await page.goto(appUrl());
  await settled(page);
  await page.locator("#q").focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(COASTAL_TMK);
  await page.keyboard.press("Enter");
  await settled(page);
  await expect(page.locator("#parcel-title")).toBeFocused();
  expect(new URL(page.url()).searchParams.get("tmk")).toBe(COASTAL_TMK);
});

test("framed in the gallery, the app offers its own full-screen link to the selected parcel", async ({ page }) => {
  await page.route(`${server.url}/frame.html`, (route) =>
    route.fulfill({ contentType: "text/html", body: `<!doctype html><iframe id="app" src="${appUrl({ tmk: WAILUKU_TMK })}" style="width:1200px;height:800px"></iframe>` }),
  );
  await page.goto(`${server.url}/frame.html`);
  const app = page.frameLocator("#app");
  await expect(app.locator("body")).toHaveAttribute("data-tmk", WAILUKU_TMK, { timeout: 60_000 });
  await expect(app.locator("#fullscreen")).toBeVisible();
  await expect(app.locator("#fullscreen")).toHaveAttribute("href", appUrl({ tmk: WAILUKU_TMK }));
});
