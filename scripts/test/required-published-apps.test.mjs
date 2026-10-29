import assert from "node:assert/strict";
import test from "node:test";

import { loadGalleryPublicPortfolio } from "../lib/gallery-public-portfolio.mjs";
import {
  loadRequiredPublishedApps,
  missingRequiredApps,
  parseRequiredPublishedApps,
} from "../lib/required-published-apps.mjs";

const FORMAT = "honua.samples.required-published-apps.v1";

test("a required app missing from the published set is reported", () => {
  const required = parseRequiredPublishedApps({
    format: FORMAT,
    apps: [
      { sourceRepo: "honua-samples", id: "county-parcel-viewer" },
      { sourceRepo: "honua-samples", id: "maplibre-featureserver-layer" },
    ],
  });
  assert.deepEqual(missingRequiredApps(required, [{ sourceRepo: "honua-samples", id: "maplibre-featureserver-layer" }]), [
    "honua-samples:county-parcel-viewer",
  ]);
  assert.deepEqual(
    missingRequiredApps(required, [
      { sourceRepo: "honua-samples", id: "maplibre-featureserver-layer" },
      { sourceRepo: "honua-samples", id: "county-parcel-viewer" },
    ]),
    [],
  );
});

test("the same id from the other source repo does not satisfy a requirement", () => {
  const required = parseRequiredPublishedApps({ format: FORMAT, apps: [{ sourceRepo: "honua-samples", id: "pmtiles-static" }] });
  assert.deepEqual(missingRequiredApps(required, [{ sourceRepo: "honua-sdk-js", id: "pmtiles-static" }]), [
    "honua-samples:pmtiles-static",
  ]);
});

test("an empty, duplicated, or malformed list fails closed", () => {
  assert.throws(() => parseRequiredPublishedApps({ format: FORMAT, apps: [] }), /at least one app/);
  assert.throws(() => parseRequiredPublishedApps({ format: "other", apps: [{ sourceRepo: "honua-samples", id: "a" }] }), /format/);
  assert.throws(
    () => parseRequiredPublishedApps({ format: FORMAT, apps: [{ sourceRepo: "honua-samples", id: "a" }, { sourceRepo: "honua-samples", id: "a" }] }),
    /duplicate/,
  );
  assert.throws(() => parseRequiredPublishedApps({ format: FORMAT, apps: [{ sourceRepo: "elsewhere", id: "a" }] }), /sourceRepo/);
});

test("every committed required app is public in the portfolio", async () => {
  const [required, portfolio] = await Promise.all([loadRequiredPublishedApps(), loadGalleryPublicPortfolio()]);
  for (const { sourceRepo, id } of required) {
    assert.equal(portfolio.byIdentity.get(`${sourceRepo}:${id}`)?.disposition, "public", `${sourceRepo}:${id}`);
  }
});
