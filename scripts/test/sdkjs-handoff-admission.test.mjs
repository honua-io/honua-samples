// Admission + merge tests for the sdk-js site-consumer handoff boundary
// (honua-io/honua-samples#16). Runs with the built-in Node test runner --
// `node --test scripts/test/` -- zero npm dependencies, no network: every
// case works from the committed byte-exact snapshot pair, so the whole suite
// is deterministic for a pinned handoff fixture (NFR-002).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  admitSdkJsHandoff,
  listSdkProjectedIdentities,
  mergeSdkProjection,
  DEFAULT_FIXTURE_V4_SNAPSHOT_PATH,
  DEFAULT_HANDOFF_V2_SNAPSHOT_PATH,
  DEFAULT_FIXTURE_SNAPSHOT_PATH,
  DEFAULT_HANDOFF_SNAPSHOT_PATH,
} from "../lib/sdkjs-handoff.mjs";
import { deriveCapabilityKeys } from "../lib/sdkjs-catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Git's Windows checkout converts the protected historical JSON snapshots to
// CRLF even though the producer fixture pins their LF bytes. Tests restore the
// producer representation in memory; production admission never normalizes.
const producerText = (text) => text.replaceAll("\r\n", "\n");
const handoffText = producerText(await readFile(DEFAULT_HANDOFF_SNAPSHOT_PATH, "utf8"));
const fixtureText = producerText(await readFile(DEFAULT_FIXTURE_SNAPSHOT_PATH, "utf8"));
const nextHandoffText = producerText(await readFile(DEFAULT_HANDOFF_V2_SNAPSHOT_PATH, "utf8"));
const nextFixtureText = producerText(await readFile(DEFAULT_FIXTURE_V4_SNAPSHOT_PATH, "utf8"));
const catalogSnapshot = JSON.parse(
  await readFile(path.join(REPO_ROOT, "config", "sdkjs-catalog.snapshot.json"), "utf8"),
);

// Deterministic validation clock derived from the pinned handoff itself. A
// refreshed byte-exact snapshot can move its evidence window forward; a
// hardcoded date would then incorrectly classify valid observations as
// future evidence.
const pinnedHandoff = JSON.parse(handoffText);
const pinnedNextHandoff = JSON.parse(nextHandoffText);
function freshNowFor(handoff) {
  const newestObservation = Math.max(
    ...handoff.qualifiedJourneys.map((journey) => Date.parse(journey.visualEvidence.observedAt)),
  );
  const earliestExpiry = Math.min(
    ...handoff.qualifiedJourneys.map((journey) => Date.parse(journey.visualEvidence.expiresAt)),
  );
  const now = new Date(newestObservation + 1);
  assert.ok(now.getTime() < earliestExpiry, "pinned contract has a valid evidence window");
  return now;
}
const LEGACY_FRESH_NOW = freshNowFor(pinnedHandoff);
const NEXT_FRESH_NOW = freshNowFor(pinnedNextHandoff);

/** Re-pins the fixture's content binding onto mutated handoff text, so a test
 * can prove a rule fires AFTER the digest gate passes (only the producer can
 * do this for real -- here we impersonate the producer to build negative
 * fixtures). */
function forgeFixtureFor(mutatedHandoffText, mutateFixture = (f) => f) {
  const fixture = mutateFixture(JSON.parse(fixtureText));
  const bytes = Buffer.from(mutatedHandoffText, "utf8");
  fixture.input.bytes = bytes.length;
  fixture.input.sha256 = createHash("sha256").update(bytes).digest("hex");
  return JSON.stringify(fixture);
}

test("pinned snapshot pair is admitted deterministically", () => {
  const first = admitSdkJsHandoff({ handoffText, fixtureText, now: LEGACY_FRESH_NOW });
  const second = admitSdkJsHandoff({ handoffText, fixtureText, now: LEGACY_FRESH_NOW });
  assert.equal(first.ok, true, first.errors.join("; "));
  assert.deepEqual(first.errors, []);
  assert.equal(second.ok, true);
  assert.deepEqual(
    first.handoff.cards.map((c) => c.id),
    second.handoff.cards.map((c) => c.id),
  );
  // One card per stable identity straight from the producer.
  const ids = first.handoff.cards.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("preferred v2/v4 snapshot pair admits every legacy identity plus newly published records", () => {
  const legacy = admitSdkJsHandoff({ handoffText, fixtureText, now: LEGACY_FRESH_NOW });
  const next = admitSdkJsHandoff({ handoffText: nextHandoffText, fixtureText: nextFixtureText, now: NEXT_FRESH_NOW });
  assert.equal(legacy.ok, true, legacy.errors.join("; "));
  assert.equal(next.ok, true, next.errors.join("; "));
  assert.equal(legacy.contract.id, "v1/v3");
  assert.equal(next.contract.id, "v2/v4");
  assert.equal(next.handoff.format, undefined, "producer transport version is not exposed in the internal projection");
  const legacyIds = legacy.handoff.cards.map((card) => card.id);
  const nextIds = next.handoff.cards.map((card) => card.id);
  assert.deepEqual(nextIds.filter((id) => !legacyIds.includes(id)), ["columnar-query-quickstart", "coverages-wcs-basic"]);
  assert.deepEqual(legacyIds.filter((id) => !nextIds.includes(id)), []);
  assert.equal(next.handoff.canonicalRoutes.length, legacy.handoff.canonicalRoutes.length + 2);
  const nextCardsById = new Map(next.handoff.cards.map((card) => [card.id, card]));
  assert.deepEqual(
    legacy.handoff.cards.map((card) => [card.id, card.source.path, card.source.docsPath]),
    legacy.handoff.cards.map((card) => {
      const nextCard = nextCardsById.get(card.id);
      return [nextCard.id, nextCard.source.path, nextCard.source.docsPath];
    }),
  );
});

test("tampered handoff bytes are rejected by the fixture content binding", () => {
  const tampered = handoffText.replace("Safe Agent Workbench", "Safe Agent Workshop");
  assert.notEqual(tampered, handoffText);
  const result = admitSdkJsHandoff({ handoffText: tampered, fixtureText, now: LEGACY_FRESH_NOW });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /tampered, stale, or locally reconstructed/);
});

test("locally reconstructed (re-serialized but semantically identical) handoff is rejected", () => {
  const reconstructed = JSON.stringify(JSON.parse(handoffText), null, 1);
  const result = admitSdkJsHandoff({ handoffText: reconstructed, fixtureText, now: LEGACY_FRESH_NOW });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /tampered, stale, or locally reconstructed/);
});

test("schema-incompatible fixture accepts block is rejected", () => {
  const fixture = JSON.parse(fixtureText);
  fixture.accepts.handoffSchemaVersion = 2;
  fixture.accepts.handoffFormat = "honua.site.sdk-sample-consumer-handoff.v2";
  const result = admitSdkJsHandoff({ handoffText, fixtureText: JSON.stringify(fixture), now: LEGACY_FRESH_NOW });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /schema-incompatible/);
});

test("unknown future fixture generation is rejected instead of coerced", () => {
  const fixture = JSON.parse(nextFixtureText);
  fixture.format = "honua.site.sdk-sample-consumer-fixture.v5";
  fixture.schemaVersion = 5;
  const result = admitSdkJsHandoff({
    handoffText: nextHandoffText,
    fixtureText: JSON.stringify(fixture),
    now: NEXT_FRESH_NOW,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /schema-incompatible consumer fixture/);
});

test("handoff declaring a different format than the fixture accepts is rejected even with a matching digest", () => {
  const mutated = handoffText.replace(
    '"format": "honua.site.sdk-sample-consumer-handoff.v1"',
    '"format": "honua.site.sdk-sample-consumer-handoff.v9"',
  );
  assert.notEqual(mutated, handoffText);
  const result = admitSdkJsHandoff({ handoffText: mutated, fixtureText: forgeFixtureFor(mutated), now: LEGACY_FRESH_NOW });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /schema-incompatible handoff/);
});

test("stale handoff (expired qualified visual evidence) is rejected", () => {
  const result = admitSdkJsHandoff({ handoffText, fixtureText, now: new Date("2026-09-01T00:00:00.000Z") });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /stale handoff: qualified journey/);
});

test("duplicate stable identities inside the handoff are rejected", () => {
  const handoff = JSON.parse(handoffText);
  handoff.cards.push(structuredClone(handoff.cards[0]));
  handoff.counts.cards += 1;
  const mutated = JSON.stringify(handoff);
  const forged = forgeFixtureFor(mutated, (f) => {
    f.assertions.cardCount += 1;
    return f;
  });
  const result = admitSdkJsHandoff({ handoffText: mutated, fixtureText: forged, now: LEGACY_FRESH_NOW });
  assert.equal(result.ok, false);
  const text = result.errors.join("\n");
  assert.match(text, /duplicate stable identity: card id/);
  assert.match(text, /duplicate stable identity: canonical route/);
  assert.match(text, /duplicate stable identity: executable source/);
});

test("counts/assertion drift from the actual arrays is rejected", () => {
  const handoff = JSON.parse(handoffText);
  handoff.cards.pop();
  const mutated = JSON.stringify(handoff);
  const result = admitSdkJsHandoff({ handoffText: mutated, fixtureText: forgeFixtureFor(mutated), now: LEGACY_FRESH_NOW });
  assert.equal(result.ok, false);
  const text = result.errors.join("\n");
  assert.match(text, /counts\.cards says/);
  assert.match(text, /fixture assertion cardCount/);
});

test("qualified card without a backing qualified journey is rejected", () => {
  const handoff = JSON.parse(handoffText);
  const unqualified = handoff.cards.find((c) => c.qualification.state !== "qualified");
  unqualified.qualification = { ...unqualified.qualification, state: "qualified" };
  const mutated = JSON.stringify(handoff);
  const result = admitSdkJsHandoff({ handoffText: mutated, fixtureText: forgeFixtureFor(mutated), now: LEGACY_FRESH_NOW });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /claims qualification "qualified" but no qualified journey backs it/);
});

// ---- cross-source merge ----------------------------------------------------

const admitted = admitSdkJsHandoff({ handoffText: nextHandoffText, fixtureText: nextFixtureText, now: NEXT_FRESH_NOW });
assert.equal(admitted.ok, true);
const catalogEntries = catalogSnapshot.catalog.samples;

test("merge yields exactly one card per stable identity plus fixture-only status stubs", () => {
  const merge = mergeSdkProjection({
    handoff: admitted.handoff,
    catalogEntries,
    crosswalk: {},
    deriveCapabilityKeys,
  });
  assert.deepEqual(merge.errors, []);
  assert.equal(merge.records.length, admitted.handoff.cards.length);
  const ids = merge.records.map((r) => r.card.id);
  assert.equal(new Set(ids).size, ids.length);
  // Internal fixture-track catalog entries stay OUT of the public card set.
  assert.deepEqual(
    merge.fixtureOnlyEntries.map((e) => e.id).sort(),
    ["arcgis-source-app", "automatic-source-workflow", "offline-region-reference"],
  );
  // Identity is producer-repo qualified (REQ-001).
  assert.equal(merge.records[0].identity, `honua-io/honua-sdk-js#${ids[0]}`);
  // Capability keys come from the catalog enrichment, canonical form.
  const enriched = merge.records.find((r) => r.capabilityKeys.length > 0);
  assert.ok(enriched, "at least one merged record carries canonical capabilityKeys");
});

test("merge output is independent of input order (NFR-001)", () => {
  const baseline = mergeSdkProjection({
    handoff: admitted.handoff,
    catalogEntries,
    crosswalk: {},
    deriveCapabilityKeys,
  });
  const reorderedHandoff = structuredClone(admitted.handoff);
  reorderedHandoff.cards.reverse();
  reorderedHandoff.qualifiedJourneys.reverse();
  reorderedHandoff.legacyRoutes.reverse();
  const reordered = mergeSdkProjection({
    handoff: reorderedHandoff,
    catalogEntries: [...catalogEntries].reverse(),
    crosswalk: {},
    deriveCapabilityKeys,
  });
  assert.deepEqual(
    reordered.records.map((r) => r.identity),
    baseline.records.map((r) => r.identity),
  );
  assert.deepEqual(
    reordered.records.map((r) => r.legacyPaths),
    baseline.records.map((r) => r.legacyPaths),
  );
  assert.deepEqual(
    reordered.records.map((r) => r.qualifiedJourneys.map((j) => j.journeyId)),
    baseline.records.map((r) => r.qualifiedJourneys.map((j) => j.journeyId)),
  );
});

test("duplicate catalog identities fail the merge", () => {
  const merge = mergeSdkProjection({
    handoff: admitted.handoff,
    catalogEntries: [...catalogEntries, structuredClone(catalogEntries[0])],
    crosswalk: {},
    deriveCapabilityKeys,
  });
  assert.match(merge.errors.join("\n"), /duplicate stable identity: catalog\.v2\.json/);
});

test("identity-field disagreement between handoff and catalog fails the merge", () => {
  const forked = structuredClone(catalogEntries);
  const target = forked.find((e) => e.id === admitted.handoff.cards[0].id);
  target.sourcePath = "examples/somewhere-else-entirely";
  const merge = mergeSdkProjection({
    handoff: admitted.handoff,
    catalogEntries: forked,
    crosswalk: {},
    deriveCapabilityKeys,
  });
  assert.match(merge.errors.join("\n"), /identity disagreement for/);
});

test("public catalog-only entry (not fixture-track) fails the merge instead of reviving a second inventory", () => {
  const withExtra = [
    ...catalogEntries,
    {
      id: "hand-authored-extra",
      title: "Hand-authored extra",
      track: "solution",
      sourcePath: "examples/hand-authored-extra",
      docsPath: "examples/hand-authored-extra/README.md",
      capabilities: [],
    },
  ];
  const merge = mergeSdkProjection({
    handoff: admitted.handoff,
    catalogEntries: withExtra,
    crosswalk: {},
    deriveCapabilityKeys,
  });
  assert.match(merge.errors.join("\n"), /refusing to render a card from a non-authoritative inventory/);
});

test("multiple qualified journeys for one identity enrich one card, freshest evidence first", () => {
  const handoff = structuredClone(admitted.handoff);
  const journey = structuredClone(handoff.qualifiedJourneys[0]);
  journey.journeyId = "second-journey";
  journey.visualEvidence.observedAt = new Date(
    Date.parse(handoff.qualifiedJourneys[0].visualEvidence.observedAt) + 1,
  ).toISOString();
  handoff.qualifiedJourneys.push(journey);
  const merge = mergeSdkProjection({ handoff, catalogEntries, crosswalk: {}, deriveCapabilityKeys });
  assert.deepEqual(merge.errors, []);
  assert.equal(merge.records.length, admitted.handoff.cards.length, "no extra card was cloned");
  const record = merge.records.find((r) => r.card.id === journey.sampleId);
  assert.equal(record.qualifiedJourneys.length, 2);
  assert.equal(record.qualifiedJourneys[0].journeyId, "second-journey", "freshest observedAt leads");
});

test("listSdkProjectedIdentities returns every projected card id", () => {
  const ids = listSdkProjectedIdentities(admitted.handoff);
  assert.equal(ids.size, admitted.handoff.cards.length);
  assert.ok(ids.has("maplibre-quickstart"));
});
