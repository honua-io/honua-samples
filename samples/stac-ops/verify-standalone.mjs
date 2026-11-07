import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
import { startStaticServer } from "../../scripts/lib/browser-lane.mjs";

test("standalone dashboard loads and switches its STAC source", { timeout: 60_000 }, async () => {
  const server = await startStaticServer({
    rootDir: path.resolve("artifacts/stac-ops/wwwroot"),
    port: 0,
  });
  let browser;
  let page;
  const errors = [];
  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    const requestedSources = new Set();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route("https://*.example.test/**", async (route) => {
      const url = new URL(route.request().url());
      requestedSources.add(url.origin);
      const body = url.pathname.startsWith("/healthz/")
        ? (url.pathname.endsWith("/live") ? "Healthy" : "Ready")
        : JSON.stringify(url.pathname === "/stac/collections"
          ? { collections: [], links: [] }
          : url.pathname === "/stac/search"
            ? { type: "FeatureCollection", features: [], links: [] }
            : { conformsTo: ["https://api.stacspec.org/v1.0.0/core"], links: [] });
      await route.fulfill({
        status: 200,
        contentType: url.pathname.startsWith("/healthz/") ? "text/plain" : "application/json",
        body,
      });
    });
    await page.goto(server.url);
    await expect(page.getByRole("heading", { name: "Select a STAC source" })).toBeVisible({ timeout: 30_000 });
    assert.equal(requestedSources.size, 0);
    await page.locator("#source-input").fill("https://first.example.test");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.locator(".control-meta strong")).toHaveText("https://first.example.test", { timeout: 30_000 });
    await expect(page.locator(".status-card-pass")).not.toHaveCount(0);
    await page.locator("#source-input").fill("https://second.example.test");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.locator(".control-meta strong")).toHaveText("https://second.example.test");
    assert.equal(new URL(page.url()).pathname, "/");
    await page.reload();
    await expect(page.locator(".control-meta strong")).toHaveText("https://second.example.test");
    await page.getByRole("button", { name: "Clear source", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Select a STAC source" })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/");
    assert.equal(new URL(page.url()).searchParams.get("source"), null);
    assert.deepEqual([...requestedSources].sort(), ["https://first.example.test", "https://second.example.test"]);
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error(JSON.stringify({ errors, body: await page?.locator("body").innerText() }));
    throw error;
  } finally {
    await page?.screenshot({ path: "artifacts/stac-ops-browser.png", fullPage: true });
    await browser?.close();
    await server.close();
  }
});
