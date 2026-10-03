// The verification both create-honua-app samples run (see
// samples/create-honua-app-*/verify/). A new user's first app, exactly as
// `npm create honua-app` produces it from the published package, pointed at
// the composed server:
//
//   1. the scaffold and the generated app's install come from the public npm
//      registry at the pinned versions (receipt attached to the report),
//   2. the built app connects anonymously to a FeatureServer layer seeded
//      from the committed fixture, mounts it, and draws every fixture polygon
//      where the fixture says it is (pixel oracle),
//   3. pointed at a layer that refuses anonymous callers, the app stops with
//      the template's documented "The workflow stopped: ..." message and draws
//      nothing.

import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  colourDistance,
  importedProperties,
  loadFixture,
  outsidePoint,
  prepareTemplateApp,
  projectToMapPixel,
  readPixels,
  readTemplateView,
  seedFeatureService,
  startVitePreview,
} from "./harness.mjs";

/** Max per-channel difference still counted as "the basemap background". */
const BACKGROUND_TOLERANCE = 6;
const TEMPLATE_PREP_TIMEOUT_MS = 15 * 60_000;

/**
 * @param {{
 *   sampleDir: string,
 *   templateId: "vanilla-ts" | "react-ts",
 *   viewSource: string,               // scaffolded file holding the initial view + background
 *   statusSelector: string,
 *   mountedText: string,
 *   mapSelector: string,
 *   featureCountSelector?: string,    // vanilla-ts renders the query's feature count
 *   connectStageSelector?: string,    // vanilla-ts renders per-stage state
 * }} template
 */
export function defineCreateHonuaAppSpec(template) {
  test.describe(`create-honua-app ${template.templateId}`, () => defineTests(template));
}

function defineTests(template) {
  test.describe.configure({ mode: "serial" });

  /** @type {Awaited<ReturnType<typeof loadFixture>>} */
  let fixture;
  let anonymousLayer;
  let refusingLayer;
  let app;
  let view;

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(TEMPLATE_PREP_TIMEOUT_MS);
    fixture = await loadFixture();
    anonymousLayer = await seedFeatureService({ prefix: `pw-${template.templateId}`, allowAnonymous: true });
    refusingLayer = await seedFeatureService({ prefix: `pw-${template.templateId}-private`, allowAnonymous: false });
    app = await prepareTemplateApp({
      sampleDir: template.sampleDir,
      templateId: template.templateId,
      builds: { live: anonymousLayer.layerUrl, refused: refusingLayer.layerUrl },
    });
    view = await readTemplateView(path.join(app.appDir, template.viewSource));
  });

  test("scaffolds from the published create-honua-app and installs the published SDK", async ({}, testInfo) => {
    await testInfo.attach("published-packages.json", {
      body: JSON.stringify(app.receipt, null, 2),
      contentType: "application/json",
    });
    expect(app.receipt.createHonuaApp.resolved).toMatch(/^https:\/\/registry\.npmjs\.org\/create-honua-app\/-\//);
    expect(app.receipt.sdk.resolved).toMatch(/^https:\/\/registry\.npmjs\.org\/@honua\/sdk-js\/-\//);
    expect(app.receipt.sdk.integrity).toMatch(/^sha512-/);
  });

  test("connects to the composed server and mounts the fixture layer", async ({ page }) => {
    const preview = await startVitePreview({ appDir: app.appDir, outDir: app.outDirs.live });
    try {
      const queryResponse = page.waitForResponse(
        (response) => response.url().startsWith(`${anonymousLayer.layerUrl}/query`) && response.status() === 200,
      );
      await page.goto(preview.url);

      await expect(page.locator(template.statusSelector)).toHaveText(template.mountedText, { timeout: 30_000 });
      const answer = await (await queryResponse).json();
      expect(answer.features.map((feature) => importedProperties(feature.attributes).fixtureId).sort()).toEqual(
        fixture.features.map((feature) => feature.fixtureId).sort(),
      );
      if (template.featureCountSelector) {
        await expect(page.locator(template.featureCountSelector)).toHaveText(String(fixture.count));
      }

      const map = page.locator(template.mapSelector);
      const box = await map.boundingBox();
      const size = { width: Math.round(box.width), height: Math.round(box.height) };
      const polygonPixels = fixture.features.map((feature) => projectToMapPixel(feature.interior, view, size));
      const controlPixel = projectToMapPixel(outsidePoint(fixture, view), view, size);
      for (const [x, y] of [...polygonPixels, controlPixel]) {
        expect(x >= 0 && y >= 0 && x < size.width && y < size.height, `pixel ${x},${y} is inside the map`).toBe(true);
      }

      // The layer is drawn on the next WebGL frames after mount resolves; wait
      // for the rendered pixels themselves rather than for a fixed time.
      await expect(async () => {
        const [control, ...fills] = await readPixels(page, map, [controlPixel, ...polygonPixels]);
        expect(colourDistance(control, view.background), "control pixel shows the basemap background").toBeLessThanOrEqual(
          BACKGROUND_TOLERANCE,
        );
        for (const [index, fill] of fills.entries()) {
          expect(
            colourDistance(fill, view.background),
            `${fixture.features[index].fixtureId} is drawn at ${polygonPixels[index]}`,
          ).toBeGreaterThan(BACKGROUND_TOLERANCE * 4);
          expect(colourDistance(fill, fills[0]), "every fixture polygon shares the layer's fill style").toBeLessThanOrEqual(
            BACKGROUND_TOLERANCE,
          );
        }
      }).toPass({ timeout: 15_000 });
    } finally {
      await preview.close();
    }
  });

  test("stops with the documented message when the layer refuses anonymous access", async ({ page }) => {
    const preview = await startVitePreview({ appDir: app.appDir, outDir: app.outDirs.refused });
    try {
      await page.goto(preview.url);
      await expect(page.locator(template.statusSelector)).toHaveText(/^The workflow stopped: .*Unauthorized/, {
        timeout: 30_000,
      });
      if (template.connectStageSelector) {
        await expect(page.locator(template.connectStageSelector)).toHaveAttribute("data-state", "failed");
      }

      // vanilla-ts never creates its map when connect fails, react-ts keeps
      // an empty basemap: either way the fixture polygons' pixels must look
      // exactly like a pixel outside every polygon.
      const map = page.locator(template.mapSelector);
      const box = await map.boundingBox();
      const size = { width: Math.round(box.width), height: Math.round(box.height) };
      const [control, ...pixels] = await readPixels(page, map, [
        projectToMapPixel(outsidePoint(fixture, view), view, size),
        ...fixture.features.map((feature) => projectToMapPixel(feature.interior, view, size)),
      ]);
      for (const [index, pixel] of pixels.entries()) {
        expect(colourDistance(pixel, control), `${fixture.features[index].fixtureId} is not drawn`).toBeLessThanOrEqual(
          BACKGROUND_TOLERANCE,
        );
      }
    } finally {
      await preview.close();
    }
  });
}
