import assert from "node:assert/strict";
import test from "node:test";
import { applyGalleryPublicPortfolio, loadGalleryPublicPortfolio } from "../lib/gallery-public-portfolio.mjs";

test("the gallery portfolio classifies the 31 SDK and seven owned cards", async () => {
  const portfolio = await loadGalleryPublicPortfolio();
  const counts = portfolio.entries.reduce((result, entry) => {
    result[entry.disposition] = (result[entry.disposition] ?? 0) + 1;
    return result;
  }, {});
  assert.equal(portfolio.entries.length, 38);
  assert.deepEqual(counts, { "internal-qualification": 18, "rework-map-first": 11, public: 9 });
});

test("only explicitly public technically qualified cards are admitted", async () => {
  const portfolio = await loadGalleryPublicPortfolio();
  const result = applyGalleryPublicPortfolio([
    { sourceRepo: "honua-sdk-js", id: "pmtiles-static" },
    { sourceRepo: "honua-sdk-js", id: "maplibre-quickstart" },
    { sourceRepo: "honua-samples", id: "odata-query-rest" }
  ], portfolio);
  assert.deepEqual(result.publicCards.map((card) => card.id), ["pmtiles-static", "maplibre-quickstart"]);
  assert.deepEqual(result.excluded.map((entry) => [entry.id, entry.disposition]), [
    ["odata-query-rest", "internal-qualification"]
  ]);
});

test("an unclassified technically qualified card fails closed", async () => {
  const portfolio = await loadGalleryPublicPortfolio();
  assert.throws(() => applyGalleryPublicPortfolio([{ sourceRepo: "honua-sdk-js", id: "new-unreviewed-app" }], portfolio), /lack a product disposition: honua-sdk-js:new-unreviewed-app/);
});
