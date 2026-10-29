import assert from "node:assert/strict";
import test from "node:test";
import {
  applyGalleryPublicPortfolio,
  loadGalleryPublicPortfolio,
  movedEntries,
  publicSampleIds,
} from "../lib/gallery-public-portfolio.mjs";

test("the gallery portfolio classifies the 32 SDK and 15 owned cards", async () => {
  const portfolio = await loadGalleryPublicPortfolio();
  const counts = portfolio.entries.reduce((result, entry) => {
    result[entry.disposition] = (result[entry.disposition] ?? 0) + 1;
    return result;
  }, {});
  assert.equal(portfolio.entries.length, 47);
  assert.equal(portfolio.entries.filter((entry) => entry.sourceRepo === "honua-sdk-js").length, 32);
  assert.equal(portfolio.entries.filter((entry) => entry.sourceRepo === "honua-samples").length, 15);
  assert.deepEqual(counts, { "internal-qualification": 19, "rework-map-first": 11, moved: 12, public: 5 });
  // SDK sample cards are out of the gallery; their old URLs render moved pages.
  assert.deepEqual(publicSampleIds(portfolio, "honua-sdk-js"), []);
  assert.equal(movedEntries(portfolio, "honua-sdk-js").length, 12);
  // The county parcel viewer and the four map-first browser samples are the owned public cards.
  assert.deepEqual(
    portfolio.entries
      .filter((entry) => entry.sourceRepo === "honua-samples" && entry.disposition === "public")
      .map((entry) => entry.id)
      .sort(),
    ["county-parcel-viewer", "esri-leaflet-featurelayer", "maplibre-category-style-legend", "maplibre-featureserver-layer", "maplibre-ogc-tiles-mvt"],
  );
});

test("only explicitly public technically qualified cards are admitted", async () => {
  const portfolio = await loadGalleryPublicPortfolio();
  const result = applyGalleryPublicPortfolio([
    { sourceRepo: "honua-samples", id: "maplibre-featureserver-layer" },
    { sourceRepo: "honua-sdk-js", id: "pmtiles-static" },
    { sourceRepo: "honua-samples", id: "odata-query-rest" }
  ], portfolio);
  assert.deepEqual(result.publicCards.map((card) => card.id), ["maplibre-featureserver-layer"]);
  assert.deepEqual(result.excluded.map((entry) => [entry.id, entry.disposition]), [
    ["pmtiles-static", "moved"],
    ["odata-query-rest", "internal-qualification"]
  ]);
});

test("an unclassified technically qualified card fails closed", async () => {
  const portfolio = await loadGalleryPublicPortfolio();
  assert.throws(() => applyGalleryPublicPortfolio([{ sourceRepo: "honua-sdk-js", id: "new-unreviewed-app" }], portfolio), /lack a product disposition: honua-sdk-js:new-unreviewed-app/);
});
