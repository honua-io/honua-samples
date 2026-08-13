import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bindSdkSourceToBundle } from "../lib/sdk-source-binding.mjs";
import { validateManifestShape } from "../lib/sample-bundles.mjs";

const SDK_REVISION = "2284c9b032b2c81227dc86ff1ff9a46dc61cde6c";

async function json(path) {
  return JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), "utf8"));
}

test("binds inline source and GitHub links to the bundle commit", () => {
  const binding = bindSdkSourceToBundle({
    repository: "honua-io/honua-sdk-js",
    sourcePath: "examples/columnar-query-quickstart",
    docsPath: "examples/columnar-query-quickstart/README.md",
    bundleSample: { id: "columnar-query-quickstart", builtFrom: { commit: SDK_REVISION } },
  });
  assert.equal(
    binding.rawRoot,
    `https://raw.githubusercontent.com/honua-io/honua-sdk-js/${SDK_REVISION}/examples/columnar-query-quickstart`,
  );
  assert.equal(
    binding.sourceTreeUrl,
    `https://github.com/honua-io/honua-sdk-js/tree/${SDK_REVISION}/examples/columnar-query-quickstart`,
  );
  assert.equal(
    binding.docsUrl,
    `https://github.com/honua-io/honua-sdk-js/blob/${SDK_REVISION}/examples/columnar-query-quickstart/README.md`,
  );
  assert.throws(
    () =>
      bindSdkSourceToBundle({
        repository: "honua-io/honua-sdk-js",
        sourcePath: "examples/columnar-query-quickstart",
        bundleSample: { id: "columnar-query-quickstart", builtFrom: { commit: "trunk" } },
      }),
    /full lowercase Git SHA/u,
  );
});

test("requires every release bundle to carry immutable source provenance", async () => {
  const snapshot = await json("config/sample-bundles.snapshot.json");
  assert.doesNotThrow(() => validateManifestShape(snapshot.manifest));
  assert.equal(snapshot.manifest.samples.length, 17);
  assert.deepEqual(new Set(snapshot.manifest.samples.map((sample) => sample.builtFrom.commit)), new Set([SDK_REVISION]));

  const invalid = structuredClone(snapshot.manifest);
  invalid.samples[0].builtFrom.commit = "trunk";
  assert.throws(() => validateManifestShape(invalid), /invalid builtFrom\.commit/u);
});

test("preserves governed support, fixture, and live states for admitted cloud-native recipes", async () => {
  const [handoff, portfolio] = await Promise.all([
    json("config/sdkjs-handoff.v2.snapshot.json"),
    json("config/gallery-public-portfolio.v1.json"),
  ]);
  const byId = new Map(handoff.cards.map((card) => [card.id, card]));
  assert.deepEqual(
    {
      support: byId.get("imagery-cog-quickstart").supportTier,
      fixture: byId.get("imagery-cog-quickstart").evidence.fixture.status,
      live: byId.get("imagery-cog-quickstart").evidence.live.status,
    },
    { support: "supported", fixture: "executed", live: "executed" },
  );
  assert.deepEqual(
    {
      support: byId.get("columnar-query-quickstart").supportTier,
      fixture: byId.get("columnar-query-quickstart").evidence.fixture.status,
      liveMode: byId.get("columnar-query-quickstart").evidence.live.mode,
      live: byId.get("columnar-query-quickstart").evidence.live.status,
    },
    { support: "experimental", fixture: "executed", liveMode: "unavailable", live: "not-applicable" },
  );
  assert.deepEqual(
    {
      support: byId.get("coverages-wcs-basic").supportTier,
      fixture: byId.get("coverages-wcs-basic").evidence.fixture.status,
      liveMode: byId.get("coverages-wcs-basic").evidence.live.mode,
      live: byId.get("coverages-wcs-basic").evidence.live.status,
    },
    { support: "experimental", fixture: "executed", liveMode: "public-live", live: "planned" },
  );
  const disposition = new Map(portfolio.entries.map((entry) => [`${entry.sourceRepo}:${entry.id}`, entry.disposition]));
  for (const id of ["imagery-cog-quickstart", "columnar-query-quickstart", "coverages-wcs-basic", "overture-geoparquet"]) {
    assert.equal(disposition.get(`honua-sdk-js:${id}`), "public");
  }
});

test("keeps multidimensional guidance preview-only and non-runnable", async () => {
  const job = await json("jobs/multidimensional-format-maturity.json");
  assert.equal(job.kind, "walkthrough");
  assert.equal(job.maturity.state, "source-preview");
  assert.equal(job.server.fixture.evidenceState, "unavailable");
  assert.equal(job.codeTabs.length, 0);
  assert.equal(job.console.state, "not-applicable");
  assert.deepEqual(job.semantics.expectedResult, {
    zarr: { client: "unavailable", server: "experimental", endToEnd: "unavailable" },
    netcdf4: { client: "unavailable", server: "metadata-only", endToEnd: "unavailable" },
    geospatialHdf5: { client: "unavailable", server: "metadata-only", endToEnd: "unavailable" },
  });
  assert.ok(job.references.filter((reference) => reference.availability === "gap").length >= 4);
});
