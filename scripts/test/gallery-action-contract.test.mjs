import assert from "node:assert/strict";
import test from "node:test";
import { expectedCardSource, journeySourceUrl, validateActionDestination } from "../lib/gallery-action-contract.mjs";

const commit = "a".repeat(40);
const baseUrl = "https://gallery.example";
const card = { id: "county-parcel-viewer", source: "honua-samples", detailHref: "/county-parcel-viewer/" };
const validate = (kind, href) => validateActionDestination({ kind, href, card, commit, baseUrl });

test("Open it must target this card's route", () => {
  assert.doesNotThrow(() => validate("open", card.detailHref));
  assert.throws(() => validate("open", "/"), /card route/u);
  assert.throws(() => validate("open", "/another-card/"), /card route/u);
  assert.throws(() => validate("open", "https://outside.example/county-parcel-viewer/"), /card route/u);
});

test("View code must match the card, repository, and published revision", () => {
  const correct = expectedCardSource(card, commit);
  assert.doesNotThrow(() => validate("source", correct));
  assert.throws(() => validate("source", correct.replace(commit, "b".repeat(40))), /published source/u);
  assert.throws(() => validate("source", correct.replace(card.id, "maui-emergency")), /published source/u);
  assert.throws(() => validate("source", correct.replace("honua-samples", "another-repo")), /published source/u);
});

test("journeys link to the templates used to build their published pages", () => {
  for (const [slug, template] of [["property", "02-property"], ["311", "03-311"], ["public-works", "05-public-works"], ["workbench", "12-workbench"]]) {
    assert.equal(journeySourceUrl(slug, commit), `https://github.com/honua-io/honua-samples/blob/${commit}/scripts/state-local/approved/pages/${template}.html`);
  }
  assert.match(journeySourceUrl("emergency", commit), /\/samples\/maui-emergency$/u);
  assert.match(journeySourceUrl("switching", commit), /\/approved\/09-switching.html$/u);
  assert.throws(() => journeySourceUrl("unknown", commit), /Unknown gallery journey/u);
});

test("job cards use their governed contract rather than an unrelated sample", () => {
  const job = { id: "feature-query", jobPage: true, source: "honua-samples" };
  assert.equal(expectedCardSource(job, commit), `https://github.com/honua-io/honua-samples/blob/${commit}/jobs/feature-query.json`);
});
