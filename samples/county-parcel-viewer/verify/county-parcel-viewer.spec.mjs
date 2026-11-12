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

import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { BROWSER_ORIGIN_PORT, runCommand } from "../../../scripts/browser-verification/harness.mjs";
import { startStaticServer } from "../../../scripts/lib/browser-lane.mjs";

import { buildStateLocalSite } from "../../../scripts/state-local/build-site.mjs";

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
  await buildStateLocalSite({ repoRoot: path.resolve(SAMPLE_DIR, "../.."), siteDir: siteRoot });
  await writeFile(path.join(siteRoot, "embed.html"), `<!doctype html><title>Embedded demo</title><iframe title="Maui property demo" src="/county-parcel-viewer/app/" style="width:100%;border:0" onload="this.style.height=this.contentDocument.body.scrollHeight+'px'"></iframe>`);
  await cp(path.resolve(SAMPLE_DIR, "../../scripts/gallery-assets/gallery.css"), path.join(siteRoot, "gallery.css"));
  await writeFile(path.join(siteRoot, "gallery-embed.html"), `<!doctype html><title>Gallery embed</title><link rel="stylesheet" href="/gallery.css"><div class="embed-panel" data-own-app="county-parcel-viewer"><iframe title="Maui property demo" src="/county-parcel-viewer/app/"></iframe></div>`);
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

test("SDK-08 3D renders real Overture buildings, retains the parcel and returns to 2D", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(appUrl());
  await settled(page);
  await page.getByRole("button", { name: "Show 3D buildings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show 2D map", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.sampleMap.queryRenderedFeatures({ layers: ["overture-buildings"] }).filter((feature) => feature.properties.render_height > 0).length), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.locator(".building-note")).toContainText("Not surveyed elevations");
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("Overture Maps Foundation");
  await expect(page.locator(".maplibregl-ctrl-attrib a", { hasText: "ODbL" })).toHaveAttribute("href", "https://opendatacommons.org/licenses/odbl/1-0/");
  expect(seen.some((request) => request.url === `${DATA_BASE}/api/v1/tiles/pmtiles/maui-buildings-static`)).toBe(true);
  await expect(page.locator("body")).toHaveAttribute("data-tmk", EXAMPLE_TMK);
  expect(await page.evaluate(() => window.sampleMap.getPitch())).toBeCloseTo(55, 8);
  const lightBuildings = await page.evaluate(() => window.sampleMap.getPaintProperty("overture-buildings", "fill-extrusion-color"));
  await page.screenshot({ path: testInfo.outputPath("property-3d-light.png") });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect(await page.evaluate(() => window.sampleMap.getPaintProperty("overture-buildings", "fill-extrusion-color"))).not.toEqual(lightBuildings);
  await page.screenshot({ path: testInfo.outputPath("property-3d-dark.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Show 2D map", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("property-3d-phone.png") });
  await page.getByRole("button", { name: "Show 2D map", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show 3D buildings", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => ({ pitch: window.sampleMap.getPitch(), visibility: window.sampleMap.getLayoutProperty("overture-buildings", "visibility") }))).toEqual({ pitch: 0, visibility: "none" });
});

test("SDK-08 unavailable buildings offer retry while parcel lookup remains usable", async ({ page }) => {
  const archiveUrl = `${DATA_BASE}/api/v1/tiles/pmtiles/maui-buildings-static`;
  await page.route(archiveUrl, (route) => route.fulfill({ status: 404, body: "unavailable" }));
  await page.goto(appUrl());
  await settled(page);
  await page.getByRole("button", { name: "Show 3D buildings", exact: true }).click();
  await expect(page.locator(".building-note")).toContainText("Select 3D to retry");
  await expect(page.locator("body")).toHaveAttribute("data-tmk", EXAMPLE_TMK);
  await page.unroute(archiveUrl);
  await page.getByRole("button", { name: "Show 3D buildings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show 2D map", exact: true })).toBeVisible();
});

test("SDK-08 buildingsUrl=none removes the optional 3D control and sends no building reads", async ({ page }) => {
  await page.goto(appUrl({ buildingsUrl: "none" }));
  await settled(page);
  await expect(page.locator("body")).toHaveAttribute("data-map-state", "ready");
  await expect(page.getByRole("button", { name: "Show 3D buildings", exact: true })).toHaveCount(0);
  expect(seen.filter((request) => request.url.includes("maui-buildings-static"))).toEqual([]);
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

  await expect(page.locator("#browse-status")).toContainText("25 parcels loaded");
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
  await expect(page.locator("#browse-status")).toContainText("25 parcels loaded");
  const lookupRequests = queries((request) => {
    const query = new URL(request.url).searchParams;
    return query.get("where") !== "1=1" || query.get("returnGeometry") !== "false";
  });
  expect(lookupRequests, "invalid shared TMK sends no parcel lookup; the browser still loads its page").toEqual([]);
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

test("PRM-04 County permit handoff preserves the original TMK without inventing URL prefill", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.url });
  await page.goto(appUrl({ tmk: WAILUKU_TMK }));
  await settled(page);
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass");
  await expect(page.locator("#permit-tmk")).toHaveValue(WAILUKU_TMK);
  await expect(page.locator("#county-permit-link")).toHaveAttribute("href", "https://publicweb1.co.maui.hi.us/PublicSearch/MAPPSSearch.aspx");
  await page.getByRole("button", { name: "Copy TMK", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(WAILUKU_TMK);
  await expect(page.locator(".permit-handoff")).toContainText("Automatic TMK prefill is not verified");
});

test("PRM-11 PRM-13 PRM-14 missing planning layers remain unknown; plan boundaries do not become designations", async ({ page }) => {
  await page.goto(appUrl());
  await settled(page);
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass");
  await expect(page.locator(".planning-result[data-state=unconfigured]")).toHaveCount(6);
  await expect(page.locator(".planning-stack")).toContainText("Community-plan area boundaries do not establish land-use designations");
  await expect(page.locator(".planning-stack")).toContainText("No conflict or buildability conclusion is available");
  expect(queries((request) => !/maui-parcels|maui-zoning|maui-flood-hazard/u.test(request.url))).toEqual([]);
});

test("PRM-10 property planning and County handoff remain usable at 390 pixels", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl());
  await settled(page);
  await expect(page.locator("body")).toHaveAttribute("data-sample-status", "pass");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator("#county-permit-link").scrollIntoViewIfNeeded();
  await expect(page.locator("#county-permit-link")).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("PRM-10-property-mobile.png") });
});


test("PRM-11 PRM-17 a connected planning layer uses its declared ID field and retries failed screening", async ({ page }) => {
  const layerUrl = `${DATA_BASE}/rest/services/planning-test/FeatureServer/7`;
  const parcel = await liveParcel(EXAMPLE_TMK);
  let queryFails = true;
  let paginationIncomplete = true;
  await page.route(`${layerUrl}**`, async (route) => {
    if (!new URL(route.request().url()).pathname.endsWith("/query")) {
      await route.fulfill({ json: { id: 7, name: "Planning test fixture", type: "Feature Layer", geometryType: "esriGeometryPolygon", objectIdField: "source_id", spatialReference: { wkid: 4326 }, fields: [
        { name: "source_id", type: "esriFieldTypeOID" }, { name: "ludcode", type: "esriFieldTypeString" },
      ], capabilities: "Query", advancedQueryCapabilities: { supportsPagination: true } } });
      return;
    }
    if (queryFails) await route.fulfill({ status: 503, json: { error: { code: 503, message: "Test outage" } } });
    else if (paginationIncomplete) await route.fulfill({ json: { features: [], exceededTransferLimit: true } });
    else await route.fulfill({ json: { objectIdFieldName: "source_id", geometryType: "esriGeometryPolygon", spatialReference: { wkid: 4326 }, features: [
      { attributes: { source_id: 47, ludcode: "U" }, geometry: parcel.geometry },
    ] } });
  });
  await page.goto(appUrl({ stateLandUseUrl: layerUrl }));
  const layer = page.locator('[data-planning-layer="stateLandUseUrl"]');
  await expect(layer.locator(".planning-result")).toHaveAttribute("data-state", "error");
  await expect(layer).toContainText("Applicability unknown");
  queryFails = false;
  await layer.getByRole("button", { name: "Retry layer check" }).click();
  await expect(layer.locator(".planning-result")).toHaveAttribute("data-state", "error");
  await expect(layer).toContainText("Applicability unknown");
  paginationIncomplete = false;
  await layer.getByRole("button", { name: "Retry layer check" }).click();
  await expect(layer.locator(".planning-result")).toHaveAttribute("data-state", "success");
  await expect(layer).toContainText("Urban");
  await expect(layer).toContainText("Hawaiʻi Land Use Commission");
  const citation = layer.getByRole("link", { name: "Source feature 47", exact: true });
  expect(new URL(await citation.getAttribute("href")).searchParams.get("where")).toBe("source_id=47");
  const requests = seen.filter((request) => request.url.startsWith(`${layerUrl}/query`));
  expect(requests.every((request) => request.method === "POST")).toBe(true);
  expect(new URLSearchParams(requests.at(-1).body).get("outFields").split(",")).toContain("source_id");
});


test("PRM-11 a connected layer with no features reports screening absence without a determination", async ({ page }) => {
  const layerUrl = `${DATA_BASE}/rest/services/empty-planning-test/FeatureServer/7`;
  await page.route(`${layerUrl}**`, (route) => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith("/query")
    ? { features: [], exceededTransferLimit: false }
    : { id: 7, name: "Empty planning fixture", type: "Feature Layer", geometryType: "esriGeometryPolygon", objectIdField: "id", fields: [{ name: "id", type: "esriFieldTypeOID" }, { name: "ludcode", type: "esriFieldTypeString" }], capabilities: "Query" } }));
  await page.goto(appUrl({ stateLandUseUrl: layerUrl }));
  const layer = page.locator('[data-planning-layer="stateLandUseUrl"]');
  await expect(layer.locator(".planning-result")).toHaveAttribute("data-state", "empty");
  await expect(layer).toContainText("No positive-area overlap in this source snapshot. This is not a determination.");
  await expect(layer.getByRole("link", { name: "Layer reference", exact: true })).toHaveAttribute("href", layerUrl);
  await expect(layer.getByRole("link", { name: /^Source feature/u })).toHaveCount(0);
});

test("PRM-12 an incomplete zoning polygon makes the result unknown", async ({ page }) => {
  const parcel = await liveParcel(EXAMPLE_TMK);
  await page.route("**/rest/services/maui-zoning/FeatureServer/2/query**", (route) => route.fulfill({ json: {
    features: [{ attributes: { id: 47 }, geometry: parcel.geometry }], exceededTransferLimit: false,
  } }));
  await page.goto(appUrl());
  await settled(page);
  await expect(page.locator("body")).toHaveAttribute("data-zoning-state", "error");
  await expect(page.locator("#zoning-body")).toContainText("Zoning check failed.");
  await expect(page.locator("#zoning-body")).not.toContainText("Not in the county zoning layer");
});

for (const missing of ["metadata", "value"]) {
  test(`PRM-04 missing TMK ${missing} prevents an empty County permit handoff`, async ({ page }) => {
    await page.route(`${PARCELS}**`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      if (new URL(route.request().url()).pathname.endsWith("/query")) {
        if (missing === "value") for (const feature of body.features ?? []) delete feature.attributes.tmk_txt;
      } else if (missing === "metadata") body.fields = (body.fields ?? []).filter((field) => field.name !== "tmk_txt");
      await route.fulfill({ response, json: body });
    });
    await page.goto(appUrl());
    await settled(page);
    await expect(page.locator("body")).toHaveAttribute("data-sample-status", "fail");
    await expect(page.locator("#county-permit-link")).toHaveCount(0);
    await expect(page.locator("#panel-inner [role=alert]")).toBeVisible();
  });
}


test("SHELL-01: approved landing uses safe light/dark themes at desktop and mobile", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("/state-local/", server.url).href);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("One geospatial platform for the whole county.");
  await expect(page.locator(".journey .badge")).toHaveCount(4);
  const light = await page.locator("body").evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-bg"));
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".logo-dark")).toBeVisible();
  await expect(page.locator(".logo-light")).toBeHidden();
  const dark = await page.locator("body").evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-bg"));
  expect(dark).not.toEqual(light);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".logo-light")).toBeVisible();
  expect(errors).toEqual([]);
});

test("SHELL-02: property theme persists and embedded shell keeps its height", async ({ page }) => {
  await page.goto(appUrl());
  await expect.poll(() => page.evaluate(() => window.sampleMap?.getLayer("background") !== undefined)).toBe(true);
  const lightMap = await page.evaluate(() => window.sampleMap.getPaintProperty("background", "background-color"));
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect(await page.evaluate(() => window.sampleMap.getPaintProperty("background", "background-color"))).not.toEqual(lightMap);
  const controlColors = await page.locator(".maplibregl-ctrl-group").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
  const surfaceColor = await page.evaluate(() => { const element = document.createElement("div"); element.style.background = "var(--c-surface)"; document.body.append(element); const color = getComputedStyle(element).backgroundColor; element.remove(); return color; });
  expect(controlColors.length).toBeGreaterThan(0);
  for (const color of controlColors) expect(color).toBe(surfaceColor);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".logo-dark")).toBeVisible();
  await page.goto(new URL("/embed.html", server.url).href);
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("body")).toBeVisible();
  expect(await frame.locator("body").evaluate((body) => body.getBoundingClientRect().height)).toBeGreaterThanOrEqual(920);
  expect(await page.locator("iframe").evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(920);
  await frame.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "light");
});


test("SHELL-03: gallery frame fits the property shell at desktop and mobile widths", async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(new URL("/gallery-embed.html", server.url).href);
    const frame = page.frameLocator("iframe");
    await expect(frame.locator("body")).toBeVisible();
    expect(await page.locator("iframe").evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(920);
    expect(await frame.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width > 720) {
      expect((await frame.locator(".work").boundingBox()).height).toBeLessThanOrEqual(900);
    }
    await frame.locator(".parcel-browser").scrollIntoViewIfNeeded();
    await expect(frame.locator(".parcel-browser")).toBeVisible();
  }
});


test("parcel browser links bounded pages, inspection, filter and exports", async ({ page }) => {
  await page.goto(appUrl());
  await expect(page.locator("#browse-status")).toContainText("25 parcels loaded");
  await expect(page.locator("#parcel-inspection")).toContainText(`Showing ${EXAMPLE_TMK}`);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  expect((await page.locator(".work").boundingBox()).height).toBeLessThanOrEqual(900);
  const first = page.locator('#parcel-table td[data-field="tmk_txt"]').first();
  const tmk = await first.textContent();
  await page.locator("#q").fill("12345");
  await page.locator("#find").click();
  await expect(page.locator("#q")).toHaveAttribute("aria-invalid", "true");
  const previousTmk = await page.locator("body").getAttribute("data-tmk");
  await first.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, pointerId: 17, isPrimary: true });
  await first.dispatchEvent("pointercancel", { pointerType: "touch", pointerId: 17 });
  await expect(page.locator("body")).toHaveAttribute("data-tmk", previousTmk);
  await expect(page.locator("#q")).toHaveAttribute("aria-invalid", "true");
  await first.click();
  await expect(page.locator("#q")).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#q-error")).toBeHidden();
  await expect(page.locator("body")).toHaveAttribute("data-tmk", tmk);
  await expect(page.locator("#parcel-inspection")).toContainText(`Showing ${tmk}`);
  await page.locator("#filter-tmk").fill(tmk);
  await page.getByRole("button", { name: "Apply filter", exact: true }).click();
  await expect(page.locator("#browse-status")).toContainText("1 parcels loaded");
  if (DATA_BASE === "https://demo.honua.io") {
    const csvReady = page.waitForEvent("download");
    await page.locator("#export-csv").click();
    const csv = await csvReady;
    expect(csv.suggestedFilename()).toBe("maui-parcels.csv");
    expect(await readFile(await csv.path(), "utf8")).toContain(tmk);
    await expect(page.locator("#export-status")).toContainText("Exported 1 rows");
    const geoReady = page.waitForEvent("download");
    await page.locator("#export-geojson").click();
    const geo = await geoReady;
    expect(geo.suggestedFilename()).toBe(`maui-parcel-${tmk}.geojson`);
    const collection = JSON.parse(await readFile(await geo.path(), "utf8"));
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties.tmk_txt).toBe(tmk);
    expect(collection.features[0].id).toBeDefined();
    expect(collection.features[0].geometry.coordinates.length).toBeGreaterThan(0);
    await expect(page.locator("#export-status")).toContainText("re-queried by stable source ID");
    await page.getByRole("button", { name: "Clear filter", exact: true }).click();
    await expect(page.locator("#browse-status")).toContainText("25 parcels loaded");
    const boundedExport = page.waitForEvent("download");
    await page.locator("#export-csv").click();
    const bounded = await boundedExport;
    expect((await readFile(await bounded.path(), "utf8")).trim().split(/\r?\n/u)).toHaveLength(101);
    await expect(page.locator("#export-status")).toContainText("Exported 100 rows");
  } else {
    const downloads = [];
    page.on("download", (download) => downloads.push(download));
    for (const selector of ["#export-csv", "#export-geojson"]) {
      await page.locator(selector).click();
      await expect(page.locator("#export-status")).toContainText("Only the public Maui demo parcel layer can be exported here");
    }
    expect(downloads).toHaveLength(0);
  }
  const browseQueries = queries((r) => new URL(r.url).searchParams.get("returnGeometry") === "false");
  expect(browseQueries.length).toBeGreaterThan(0);
  for (const request of browseQueries) expect(Number(new URL(request.url).searchParams.get("resultRecordCount"))).toBeLessThanOrEqual(25);
  await page.locator("#overlay-zoning").uncheck();
  await page.locator("#overlay-flood").uncheck();
  await expect(page.locator("#overlay-zoning")).not.toBeChecked();
});

test("parcel browser clears stale selection and reports empty and failed filters", async ({ page }) => {
  await page.goto(appUrl());
  await expect(page.locator("#export-geojson")).toBeEnabled();
  await page.locator("#q").fill("999999999");
  await page.locator("#find").click();
  await expect(page.locator("#export-geojson")).toBeDisabled();
  await settled(page);
  await expect(page.locator("#export-geojson")).toBeDisabled();
  await page.locator("#filter-tmk").fill("999999999");
  await page.getByRole("button", { name: "Apply filter", exact: true }).click();
  await expect(page.locator("#browse-status")).toContainText("No parcels match");
  await page.route(`${PARCELS}/query?**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("returnGeometry") === "false") await route.fulfill({ status: 503, body: "Unavailable" });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Clear filter", exact: true }).click();
  await expect(page.locator("#browse-status")).toContainText(/failed/i);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
  const count = seen.length;
  await page.getByRole("button", { name: "Clear filter", exact: true }).click();
  await page.waitForTimeout(100);
  expect(seen.length).toBe(count);
});


test("custom parcel layers explain export denial without downloading", async ({ page }) => {
  const alternate = `${DATA_BASE}/rest/services/custom-parcels/FeatureServer/1`;
  await page.route(`${alternate}**`, async (route) => {
    const response = await route.fetch({ url: route.request().url().replace(alternate, PARCELS) });
    await route.fulfill({ response });
  });
  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  await page.goto(appUrl({ parcelsUrl: alternate }));
  await expect(page.locator("#browse-status")).toContainText("25 parcels loaded");
  await expect(page.locator("#export-geojson")).toBeEnabled();
  for (const selector of ["#export-csv", "#export-geojson"]) {
    await page.locator(selector).click();
    await expect(page.locator("#export-status")).toContainText("Only the public Maui demo parcel layer can be exported here");
  }
  expect(downloads).toHaveLength(0);
});


test("touch drag does not select and first completed tap selects a parcel", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "CDP provides native touch input for this regression");
  await page.goto(appUrl());
  await expect(page.locator("#browse-status")).toContainText("25 parcels loaded");
  await settled(page);
  const first = page.locator('#parcel-table td[data-field="tmk_txt"]').first();
  await first.scrollIntoViewIfNeeded();
  const bounds = await first.boundingBox();
  const x = bounds.x + 40;
  const y = bounds.y + bounds.height / 2;
  const before = await page.locator("body").getAttribute("data-tmk");
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 60 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator("body")).toHaveAttribute("data-tmk", before);
  await page.waitForTimeout(500); // Let touch-scroll inertia and virtual rows settle.
  const tap = await page.locator("#parcel-table").evaluate((table) => {
    const rows = table.shadowRoot.querySelectorAll('td[data-field="tmk_txt"]');
    for (const row of rows) {
      const bounds = row.getBoundingClientRect();
      if (bounds.height && bounds.y >= 0 && bounds.bottom < innerHeight) {
        return { x: bounds.x, y: bounds.y, height: bounds.height, tmk: row.textContent };
      }
    }
    return null;
  });
  expect(tap).not.toBeNull();
  const tmk = tap.tmk;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: tap.x + 40, y: tap.y + tap.height / 2 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator("body")).toHaveAttribute("data-tmk", tmk);
  await session.detach();
});
