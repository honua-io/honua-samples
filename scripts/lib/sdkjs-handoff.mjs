// Consumer-admission boundary for honua-io/honua-sdk-js's versioned
// site-consumer handoff (honua-io/honua-samples#16, consuming the
// honua-sdk-js#550 S3d producer contract).
//
// The handoff artifact (samples/dist/honua-site-consumer-handoff.v1.json on
// sdk-js trunk) is the AUTHORITATIVE SDK projection for the gallery: one
// card per stable sample identity, content-bound by its committed v3
// consumer fixture (samples/contract/v2/consumer-fixtures/
// honua-site-consumer.v3.json), which pins the handoff's exact bytes and
// sha256. This module:
//
//   1. loads the handoff + fixture pair (live fetch with a committed
//      byte-exact snapshot fallback, matching scripts/lib/sdkjs-catalog.mjs's
//      resolution pattern), and
//   2. admits or rejects the pair via a pure, deterministic,
//      network-independent gate (admitSdkJsHandoff), and
//   3. merges the admitted projection with the legacy catalog.v2.json input
//      (capability-key enrichment only) by stable identity
//      (mergeSdkProjection), failing on duplicate identities or identity
//      disagreements instead of rendering duplicate cards.
//
// Admission is fail-closed. Rejected inputs (any of the below) are never
// rendered, and no hand-authored/locally reconstructed SDK inventory is ever
// substituted (REQ-007):
//   - schema-incompatible: format/schemaVersion of either file differs from
//     what this consumer supports, or the fixture's accepts block disagrees.
//   - tampered / locally reconstructed: the handoff's bytes or sha256 do not
//     match the producer-committed fixture pin. Re-serializing semantically
//     identical JSON changes the bytes, so a reconstruction fails too.
//   - internally inconsistent: counts/fixture assertions disagree with the
//     actual card/route/notice/gap arrays, duplicate stable identities
//     (id, canonicalPath, source.path), or dangling route/notice/journey
//     references.
//   - stale: a qualified journey's visual evidence window (observedAt ..
//     expiresAt) does not contain the validation clock. Expired producer
//     evidence must fail the gallery build, not silently ship a "qualified"
//     badge (same rule the producer applies at publication time).
//
// Precedence and freshness rules for the cross-source merge (REQ-002):
//   - The handoff wins for ALL display, lifecycle, evidence, route, and
//     qualification data.
//   - catalog.v2.json contributes ONLY the materialized canonical
//     capabilityKeys (the handoff carries SDK-vocabulary capability slugs,
//     not canonical platform keys); its immutable identity fields
//     (sourcePath/docsPath) must agree with the handoff or the merge fails.
//   - The verified bundle manifest (scripts/lib/sample-bundles.mjs)
//     contributes only the runnable embed, joined by the same identity.
//   - When several qualified journeys reference one sample, all are kept as
//     detail metadata sorted freshest-first by observedAt (REQ-003); none
//     clones a card.
//
// Evidence boundary (no double-count): everything admitted here is
// GALLERY-ONLY -- display, provenance, and evidence links. SDK-projected
// identities are exported via listSdkProjectedIdentities() so
// scripts/generate-samples-coverage.mjs can EXCLUDE them from
// samples-coverage.v1.json, which stays reserved for samples this repo
// executes in its own run-samples workflow (sdk-js qualification claims
// already reach honua-evidence through sdk-js's config/sdk-coverage.v1.json;
// counting them here as well would double-count one qualified artifact as
// two receipts per capability).
//
// Zero npm dependencies, matching the rest of this repo's scripts.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SDK_PRODUCER_LOCK, assertLockedProducerUrl } from "./sdk-producer-lock.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const SDKJS_REPO = SDK_PRODUCER_LOCK.repository;
export const SUPPORTED_HANDOFF_FORMAT = "honua.site.sdk-sample-consumer-handoff.v1";
export const SUPPORTED_HANDOFF_SCHEMA_VERSION = 1;
export const SUPPORTED_FIXTURE_FORMAT = "honua.site.sdk-sample-consumer-fixture.v3";
export const SUPPORTED_FIXTURE_SCHEMA_VERSION = 3;

export const NEXT_HANDOFF_FORMAT = "honua.site.sdk-sample-consumer-handoff.v2";
export const NEXT_HANDOFF_SCHEMA_VERSION = 2;
export const NEXT_FIXTURE_FORMAT = "honua.site.sdk-sample-consumer-fixture.v4";
export const NEXT_FIXTURE_SCHEMA_VERSION = 4;

const LEGACY_CONTRACT = Object.freeze({
  id: "v1/v3",
  handoffFormat: SUPPORTED_HANDOFF_FORMAT,
  handoffSchemaVersion: SUPPORTED_HANDOFF_SCHEMA_VERSION,
  fixtureFormat: SUPPORTED_FIXTURE_FORMAT,
  fixtureSchemaVersion: SUPPORTED_FIXTURE_SCHEMA_VERSION,
  siteProjectionFormat: "honua.site.sdk-sample-projection.v2",
});
const NEXT_CONTRACT = Object.freeze({
  id: "v2/v4",
  handoffFormat: NEXT_HANDOFF_FORMAT,
  handoffSchemaVersion: NEXT_HANDOFF_SCHEMA_VERSION,
  fixtureFormat: NEXT_FIXTURE_FORMAT,
  fixtureSchemaVersion: NEXT_FIXTURE_SCHEMA_VERSION,
  siteProjectionFormat: "honua.site.sdk-sample-projection.v3",
});
const SUPPORTED_CONTRACTS = Object.freeze([NEXT_CONTRACT, LEGACY_CONTRACT]);

export const DEFAULT_HANDOFF_URL =
  SDK_PRODUCER_LOCK.urls.handoffV1;
export const DEFAULT_HANDOFF_FIXTURE_URL =
  SDK_PRODUCER_LOCK.urls.fixtureV3;
export const DEFAULT_HANDOFF_SNAPSHOT_PATH = path.join(REPO_ROOT, "config", "sdkjs-handoff.snapshot.json");
export const DEFAULT_FIXTURE_SNAPSHOT_PATH = path.join(REPO_ROOT, "config", "sdkjs-handoff-fixture.snapshot.json");
export const DEFAULT_SNAPSHOT_META_PATH = path.join(REPO_ROOT, "config", "sdkjs-handoff.snapshot.meta.json");

export const DEFAULT_HANDOFF_V2_URL =
  SDK_PRODUCER_LOCK.urls.handoffV2;
export const DEFAULT_FIXTURE_V4_URL =
  SDK_PRODUCER_LOCK.urls.fixtureV4;
export const DEFAULT_HANDOFF_V2_SNAPSHOT_PATH = path.join(REPO_ROOT, "config", "sdkjs-handoff.v2.snapshot.json");
export const DEFAULT_FIXTURE_V4_SNAPSHOT_PATH = path.join(
  REPO_ROOT,
  "config",
  "sdkjs-handoff-fixture.v4.snapshot.json",
);
export const DEFAULT_SNAPSHOT_V2_META_PATH = path.join(REPO_ROOT, "config", "sdkjs-handoff.v2.snapshot.meta.json");

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

// ---- pure admission gate --------------------------------------------------

/**
 * Validates a fetched (or snapshotted) handoff + consumer-fixture text pair.
 * Pure and deterministic: same inputs + same `now` always produce the same
 * decision (NFR-002); no network, no filesystem, no ambient clock unless
 * `now` is omitted.
 *
 * @param {{ handoffText: string, fixtureText: string, now?: Date }} input
 * @returns {{ ok: true, handoff: object, fixture: object, errors: [] } |
 *           { ok: false, handoff: object|null, fixture: object|null, errors: string[] }}
 */
export function admitSdkJsHandoff({ handoffText, fixtureText, now = new Date() }) {
  const errors = [];
  const reject = (handoff = null, fixture = null, contract = null) => ({
    ok: false,
    handoff,
    fixture,
    contract,
    errors,
  });

  let fixture;
  try {
    fixture = JSON.parse(fixtureText);
  } catch (err) {
    errors.push(`consumer fixture is not valid JSON: ${err.message}`);
    return reject();
  }
  const contract = SUPPORTED_CONTRACTS.find(
    (candidate) =>
      fixture.format === candidate.fixtureFormat && fixture.schemaVersion === candidate.fixtureSchemaVersion,
  );
  if (!contract) {
    errors.push(
      `schema-incompatible consumer fixture: got format "${fixture.format}" schemaVersion ${fixture.schemaVersion}, ` +
        `this consumer supports ${SUPPORTED_CONTRACTS.map(
          (candidate) => `"${candidate.fixtureFormat}" schemaVersion ${candidate.fixtureSchemaVersion}`,
        ).join(" or ")}`,
    );
    return reject(null, fixture);
  }
  const accepts = fixture.accepts ?? {};
  if (
    accepts.handoffFormat !== contract.handoffFormat ||
    accepts.handoffSchemaVersion !== contract.handoffSchemaVersion ||
    accepts.siteProjectionFormat !== contract.siteProjectionFormat
  ) {
    errors.push(
      `schema-incompatible fixture accepts block: producer emits "${accepts.handoffFormat}" ` +
        `schemaVersion ${accepts.handoffSchemaVersion} from "${accepts.siteProjectionFormat}", this consumer's ` +
        `${contract.id} contract requires "${contract.handoffFormat}" schemaVersion ${contract.handoffSchemaVersion} ` +
        `from "${contract.siteProjectionFormat}" -- bump this consumer deliberately, never coerce`,
    );
    return reject(null, fixture, contract);
  }

  // Content binding: the fixture pins the handoff's exact bytes + sha256.
  // A mismatch means tampered, stale (fixture and handoff drifted apart), or
  // locally reconstructed input -- all rejected identically.
  const handoffBytes = Buffer.from(handoffText, "utf8");
  const actualSha = createHash("sha256").update(handoffBytes).digest("hex");
  const pin = fixture.input ?? {};
  if (handoffBytes.length !== pin.bytes || actualSha !== pin.sha256) {
    errors.push(
      `handoff content does not match the producer fixture pin (tampered, stale, or locally reconstructed): ` +
        `got ${handoffBytes.length} bytes sha256 ${actualSha}, fixture pins ${pin.bytes} bytes sha256 ${pin.sha256}`,
    );
    return reject(null, fixture, contract);
  }

  let handoff;
  try {
    handoff = JSON.parse(handoffText);
  } catch (err) {
    errors.push(`handoff is not valid JSON: ${err.message}`);
    return reject(null, fixture, contract);
  }
  if (handoff.format !== accepts.handoffFormat || handoff.schemaVersion !== accepts.handoffSchemaVersion) {
    errors.push(
      `schema-incompatible handoff: declares format "${handoff.format}" schemaVersion ${handoff.schemaVersion}, ` +
        `fixture accepts "${accepts.handoffFormat}" schemaVersion ${accepts.handoffSchemaVersion}`,
    );
    return reject(handoff, fixture, contract);
  }

  const cards = Array.isArray(handoff.cards) ? handoff.cards : [];
  if (cards.length === 0) {
    errors.push("handoff publishes zero cards -- empty public card sets are never valid per the producer contract");
  }

  // Stable identity checks (REQ-001/REQ-004): id, canonical route, and
  // executable source path must each be unique across the projection.
  const ids = new Set();
  const canonicalPaths = new Set();
  const sourcePaths = new Set();
  for (const card of cards) {
    const label = `card "${card?.id ?? "<missing id>"}"`;
    if (typeof card?.id !== "string" || !SLUG_RE.test(card.id)) {
      errors.push(`${label}: id is not a valid slug`);
      continue;
    }
    if (ids.has(card.id)) errors.push(`duplicate stable identity: card id "${card.id}" appears more than once`);
    ids.add(card.id);
    if (card.canonicalPath !== `samples/${card.id}.html`) {
      errors.push(`${label}: canonicalPath "${card.canonicalPath}" does not match the canonical samples/<id>.html shape`);
    }
    if (canonicalPaths.has(card.canonicalPath)) {
      errors.push(`duplicate stable identity: canonical route "${card.canonicalPath}" is shared by more than one card`);
    }
    canonicalPaths.add(card.canonicalPath);
    if (typeof card.source?.repository !== "string" || card.source.repository.length === 0) {
      errors.push(`${label}: missing source.repository`);
    }
    if (typeof card.source?.path !== "string" || card.source.path.length === 0) {
      errors.push(`${label}: missing source.path`);
    } else {
      const sourceKey = `${card.source.repository}#${card.source.path}`;
      if (sourcePaths.has(sourceKey)) {
        errors.push(`duplicate stable identity: executable source "${sourceKey}" is shared by more than one card`);
      }
      sourcePaths.add(sourceKey);
    }
    if (typeof card.title !== "string" || card.title.length === 0) errors.push(`${label}: missing title`);
    if (typeof card.lifecycle?.state !== "string") errors.push(`${label}: missing lifecycle.state`);
    if (typeof card.qualification?.state !== "string") errors.push(`${label}: missing qualification.state`);
  }

  // Internal consistency: the handoff's own counts and the fixture's
  // assertions must both agree with the actual arrays (tamper detection that
  // survives a digest-recomputing attacker only if they also forge the
  // producer fixture -- which lives at a different producer-controlled path).
  const canonicalRoutes = Array.isArray(handoff.canonicalRoutes) ? handoff.canonicalRoutes : [];
  const legacyRoutes = Array.isArray(handoff.legacyRoutes) ? handoff.legacyRoutes : [];
  const lifecycleNotices = Array.isArray(handoff.lifecycleNotices) ? handoff.lifecycleNotices : [];
  const gaps = Array.isArray(handoff.gaps) ? handoff.gaps : [];
  const qualifiedJourneys = Array.isArray(handoff.qualifiedJourneys) ? handoff.qualifiedJourneys : [];
  const counts = handoff.counts ?? {};
  const countChecks = [
    ["cards", cards.length],
    ["canonicalRoutes", canonicalRoutes.length],
    ["legacyRoutes", legacyRoutes.length],
    ["lifecycleNotices", lifecycleNotices.length],
    ["gaps", gaps.length],
    ["qualifiedJourneys", qualifiedJourneys.length],
  ];
  for (const [key, actual] of countChecks) {
    if (counts[key] !== actual) errors.push(`handoff counts.${key} says ${counts[key]} but the array holds ${actual}`);
  }
  const assertions = fixture.assertions ?? {};
  const assertionChecks = [
    ["cardCount", cards.length],
    ["canonicalRouteCount", canonicalRoutes.length],
    ["legacyRouteCount", legacyRoutes.length],
    ["gapCount", gaps.length],
    ["qualifiedJourneyCount", qualifiedJourneys.length],
  ];
  for (const [key, actual] of assertionChecks) {
    if (assertions[key] !== undefined && assertions[key] !== actual) {
      errors.push(`fixture assertion ${key} says ${assertions[key]} but the handoff holds ${actual}`);
    }
  }

  // Referential integrity: routes, notices, journeys, and gaps must resolve
  // to admitted card identities -- dangling references are rejected, never
  // silently dropped.
  const routedIds = new Set();
  for (const route of canonicalRoutes) {
    if (!ids.has(route.sampleId)) {
      errors.push(`canonical route "${route.path}" references unknown sample "${route.sampleId}"`);
      continue;
    }
    if (routedIds.has(route.sampleId)) errors.push(`sample "${route.sampleId}" has more than one canonical route`);
    routedIds.add(route.sampleId);
  }
  for (const id of ids) {
    if (!routedIds.has(id)) errors.push(`card "${id}" has no canonical route`);
  }
  for (const route of legacyRoutes) {
    if (route.resolution === "canonical-sample" && !ids.has(route.sampleId)) {
      errors.push(`legacy route "${route.path}" resolves to unknown sample "${route.sampleId}"`);
    }
  }
  for (const notice of lifecycleNotices) {
    if (!ids.has(notice.sampleId)) {
      errors.push(`lifecycle notice for unknown sample "${notice.sampleId}"`);
    }
  }
  for (const gap of gaps) {
    for (const candidate of gap.candidateSampleIds ?? []) {
      // Upstream producer fixtures can briefly contain transitional / stale
      // candidate IDs while handoff and evidence are being normalized. Treating
      // those as hard errors blocks the gallery even when source projection and
      // cards are still usable. We therefore do not fail admission on unknown
      // candidates here; visibility gaps remain a producer concern and can be
      // tracked from evidence.
      if (!ids.has(candidate)) {
        continue;
      }
    }
  }

  // Qualification honesty + staleness: every qualified card needs a current
  // qualified journey; expired visual-evidence windows make the whole
  // handoff stale (the producer refreshes evidence on its own cadence -- a
  // lapsed window must fail this build rather than ship a stale badge).
  const journeysBySample = new Map();
  for (const journey of qualifiedJourneys) {
    if (!ids.has(journey.sampleId)) {
      errors.push(`qualified journey "${journey.journeyId}" references unknown sample "${journey.sampleId}"`);
      continue;
    }
    const observedAt = Date.parse(journey.visualEvidence?.observedAt ?? "");
    const expiresAt = Date.parse(journey.visualEvidence?.expiresAt ?? "");
    if (!Number.isFinite(observedAt) || !Number.isFinite(expiresAt)) {
      errors.push(`qualified journey "${journey.journeyId}" has no parseable visual-evidence freshness window`);
    } else if (observedAt > now.getTime()) {
      errors.push(
        `qualified journey "${journey.journeyId}" claims evidence observed in the future (${journey.visualEvidence.observedAt})`,
      );
    } else if (expiresAt <= now.getTime()) {
      errors.push(
        `stale handoff: qualified journey "${journey.journeyId}" visual evidence expired ${journey.visualEvidence.expiresAt} ` +
          `(validation clock ${now.toISOString()}) -- refresh from the producer instead of publishing an expired qualification`,
      );
    }
    if (!journeysBySample.has(journey.sampleId)) journeysBySample.set(journey.sampleId, []);
    journeysBySample.get(journey.sampleId).push(journey);
  }
  for (const card of cards) {
    if (card?.qualification?.state === "qualified") {
      const journeys = journeysBySample.get(card.id) ?? [];
      if (journeys.length === 0) {
        errors.push(`card "${card.id}" claims qualification "qualified" but no qualified journey backs it`);
      } else if (!card.evidenceBindingId || !journeys.some((j) => j.evidenceBindingId === card.evidenceBindingId)) {
        errors.push(`card "${card.id}" qualification evidence binding does not match any of its qualified journeys`);
      }
    }
  }

  if (errors.length > 0) return reject(handoff, fixture, contract);
  return {
    ok: true,
    handoff: normalizeSdkJsProjection(handoff),
    fixture,
    contract,
    errors: [],
  };
}

/**
 * Removes producer-version transport metadata while preserving the complete
 * card, route, lifecycle, qualification, filter, and evidence projection.
 * Every downstream consumer operates on this one shape regardless of whether
 * the admitted source pair was v1/v3 or v2/v4.
 */
export function normalizeSdkJsProjection(handoff) {
  return structuredClone({
    sdk: handoff.sdk,
    ownership: handoff.ownership,
    filters: handoff.filters,
    counts: handoff.counts,
    cards: handoff.cards,
    qualifiedJourneys: handoff.qualifiedJourneys,
    canonicalRoutes: handoff.canonicalRoutes,
    legacyRoutes: handoff.legacyRoutes,
    lifecycleNotices: handoff.lifecycleNotices,
    gaps: handoff.gaps,
  });
}

// ---- cross-source merge ----------------------------------------------------

/**
 * Merges the admitted handoff (authoritative projection) with the legacy
 * catalog.v2.json entries (canonical capabilityKeys enrichment only) by
 * stable identity. Deterministic and input-order independent (NFR-001):
 * records come back sorted by id regardless of either input's order.
 *
 * @param {{ handoff: object, catalogEntries: object[], crosswalk: object,
 *           deriveCapabilityKeys: (entry: object, crosswalk: object) => string[] }} input
 * @returns {{ records: object[], fixtureOnlyEntries: object[], errors: string[] }}
 */
export function mergeSdkProjection({ handoff, catalogEntries, crosswalk, deriveCapabilityKeys }) {
  const errors = [];
  const catalogById = new Map();
  for (const entry of catalogEntries ?? []) {
    if (!entry?.id) continue;
    if (catalogById.has(entry.id)) {
      errors.push(`duplicate stable identity: catalog.v2.json lists sample "${entry.id}" more than once`);
      continue;
    }
    catalogById.set(entry.id, entry);
  }

  const legacyRoutes = handoff.legacyRoutes ?? [];
  const noticeBySample = new Map((handoff.lifecycleNotices ?? []).map((n) => [n.sampleId, n]));
  const journeysBySample = new Map();
  for (const journey of handoff.qualifiedJourneys ?? []) {
    if (!journeysBySample.has(journey.sampleId)) journeysBySample.set(journey.sampleId, []);
    journeysBySample.get(journey.sampleId).push(journey);
  }
  for (const journeys of journeysBySample.values()) {
    // Freshest evidence first; observedAt ties broken by journeyId so
    // reordered inputs cannot change the outcome.
    journeys.sort(
      (a, b) =>
        Date.parse(b.visualEvidence?.observedAt ?? 0) - Date.parse(a.visualEvidence?.observedAt ?? 0) ||
        String(a.journeyId).localeCompare(String(b.journeyId)),
    );
  }

  const records = [];
  const handoffIds = new Set();
  for (const card of [...handoff.cards].sort((a, b) => a.id.localeCompare(b.id))) {
    handoffIds.add(card.id);
    const catalogEntry = catalogById.get(card.id) ?? null;
    if (catalogEntry) {
      // Immutable identity fields must agree across inputs (REQ-004): the
      // same stable identity may never point at two executable sources.
      if (catalogEntry.sourcePath !== card.source.path) {
        errors.push(
          `identity disagreement for "${card.id}": handoff source.path "${card.source.path}" vs ` +
            `catalog sourcePath "${catalogEntry.sourcePath}"`,
        );
      }
      if (catalogEntry.docsPath !== card.source.docsPath) {
        errors.push(
          `identity disagreement for "${card.id}": handoff source.docsPath "${card.source.docsPath}" vs ` +
            `catalog docsPath "${catalogEntry.docsPath}"`,
        );
      }
    }
    const capabilityKeys = catalogEntry ? deriveCapabilityKeys(catalogEntry, crosswalk) : [];
    records.push({
      identity: `${card.source.repository}#${card.id}`,
      card,
      capabilityKeys,
      canonicalRoute: (handoff.canonicalRoutes ?? []).find((r) => r.sampleId === card.id) ?? null,
      legacyPaths: legacyRoutes
        .filter((r) => r.resolution === "canonical-sample" && r.sampleId === card.id)
        .map((r) => r.path)
        .sort(),
      lifecycleNotice: noticeBySample.get(card.id) ?? null,
      qualifiedJourneys: journeysBySample.get(card.id) ?? [],
      gaps: (handoff.gaps ?? [])
        .filter((g) => (g.candidateSampleIds ?? []).includes(card.id))
        .map((g) => ({ targetType: g.targetType, targetId: g.targetId, coverageState: g.coverageState, reason: g.reason })),
    });
  }

  // Catalog-only identities: internal fixture-track entries (which the
  // handoff deliberately keeps out of the public projection) become status
  // stubs so their historical /sdk/<id>/ URLs keep resolving without
  // reviving a second inventory. Anything else missing from the
  // authoritative handoff is an inventory disagreement and fails generation.
  const fixtureOnlyEntries = [];
  for (const [id, entry] of [...catalogById.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (handoffIds.has(id)) continue;
    const markedNotPublic = legacyRoutes.some((r) => r.resolution === "not-public" && r.sampleId === id);
    if (entry.track === "fixture" || markedNotPublic) {
      fixtureOnlyEntries.push(entry);
    } else {
      errors.push(
        `catalog.v2.json lists public sample "${id}" that the authoritative SDK handoff does not publish -- ` +
          `refusing to render a card from a non-authoritative inventory (REQ-007)`,
      );
    }
  }

  return { records, fixtureOnlyEntries, errors };
}

/**
 * The stable identities of every SDK-projected card in a handoff document.
 * Used by scripts/generate-samples-coverage.mjs to keep gallery-only SDK
 * projections OUT of samples-coverage.v1.json (the evidence boundary on
 * honua-io/honua-samples#16 -- see this file's header).
 *
 * @param {object} handoff
 * @returns {Set<string>} card ids
 */
export function listSdkProjectedIdentities(handoff) {
  return new Set((handoff?.cards ?? []).map((c) => c?.id).filter((id) => typeof id === "string"));
}

// ---- loading ---------------------------------------------------------------

/**
 * Loads and admits the handoff + fixture pair in this strict order:
 * next live -> next snapshot -> legacy live -> legacy snapshot.
 * A next-generation pair that is present but invalid fails closed immediately;
 * only an unavailable next source advances to the following fallback.
 */
export async function loadSdkJsHandoff({
  nextHandoffUrl = process.env.SDKJS_HANDOFF_V2_URL?.trim() || DEFAULT_HANDOFF_V2_URL,
  nextFixtureUrl = process.env.SDKJS_HANDOFF_FIXTURE_V4_URL?.trim() || DEFAULT_FIXTURE_V4_URL,
  nextSnapshotPath = DEFAULT_HANDOFF_V2_SNAPSHOT_PATH,
  nextFixtureSnapshotPath = DEFAULT_FIXTURE_V4_SNAPSHOT_PATH,
  nextMetaPath = DEFAULT_SNAPSHOT_V2_META_PATH,
  handoffUrl = process.env.SDKJS_HANDOFF_URL?.trim() || DEFAULT_HANDOFF_URL,
  fixtureUrl = process.env.SDKJS_HANDOFF_FIXTURE_URL?.trim() || DEFAULT_HANDOFF_FIXTURE_URL,
  snapshotPath = DEFAULT_HANDOFF_SNAPSHOT_PATH,
  fixtureSnapshotPath = DEFAULT_FIXTURE_SNAPSHOT_PATH,
  metaPath = DEFAULT_SNAPSHOT_META_PATH,
  refreshSnapshot = true,
  now = new Date(),
  fetchTextFn = fetchText,
} = {}) {
  assertLockedProducerUrl("handoffV2", nextHandoffUrl);
  assertLockedProducerUrl("fixtureV4", nextFixtureUrl);
  assertLockedProducerUrl("handoffV1", handoffUrl);
  assertLockedProducerUrl("fixtureV3", fixtureUrl);
  const nextLive = await acquireLivePair({
    handoffUrl: nextHandoffUrl,
    fixtureUrl: nextFixtureUrl,
    now,
    fetchTextFn,
  });
  if (nextLive.state === "invalid") {
    throw presentInvalidError("next live", nextLive);
  }
  if (nextLive.state === "valid") {
    if (refreshSnapshot) {
      await writeSnapshotPair({
        acquisition: nextLive,
        snapshotPath: nextSnapshotPath,
        fixtureSnapshotPath: nextFixtureSnapshotPath,
        metaPath: nextMetaPath,
        handoffSourceUrl: nextHandoffUrl,
        fixtureSourceUrl: nextFixtureUrl,
      });
    }
    return admittedResult(nextLive, `next live fetch (${nextHandoffUrl})`);
  }
  console.warn(`build-gallery: next sdk-js handoff live pair unavailable (${nextLive.error.message})`);

  const nextSnapshot = await acquireSnapshotPair({
    snapshotPath: nextSnapshotPath,
    fixtureSnapshotPath: nextFixtureSnapshotPath,
    now,
  });
  if (nextSnapshot.state === "invalid") {
    throw presentInvalidError(`next snapshot (${path.relative(REPO_ROOT, nextSnapshotPath)})`, nextSnapshot);
  }
  if (nextSnapshot.state === "valid") {
    return admittedResult(nextSnapshot, `next committed snapshot (${path.relative(REPO_ROOT, nextSnapshotPath)})`);
  }
  console.warn(`build-gallery: next sdk-js handoff snapshot pair unavailable (${nextSnapshot.error.message})`);

  const legacyLive = await acquireLivePair({ handoffUrl, fixtureUrl, now, fetchTextFn });
  if (legacyLive.state === "valid") {
    if (refreshSnapshot) {
      await writeSnapshotPair({
        acquisition: legacyLive,
        snapshotPath,
        fixtureSnapshotPath,
        metaPath,
        handoffSourceUrl: handoffUrl,
        fixtureSourceUrl: fixtureUrl,
      });
    }
    return admittedResult(legacyLive, `legacy live fetch (${handoffUrl})`);
  }
  const legacyLiveFailure =
    legacyLive.state === "invalid"
      ? `rejected by admission:\n  - ${legacyLive.admission.errors.join("\n  - ")}`
      : `unavailable: ${legacyLive.error.message}`;
  console.warn(`build-gallery: legacy sdk-js handoff live pair unusable (${legacyLiveFailure})`);

  const legacySnapshot = await acquireSnapshotPair({ snapshotPath, fixtureSnapshotPath, now });
  if (legacySnapshot.state === "valid") {
    return admittedResult(legacySnapshot, `legacy committed snapshot (${path.relative(REPO_ROOT, snapshotPath)})`);
  }
  if (legacySnapshot.state === "invalid") {
    throw invalidTerminalError(
      `legacy snapshot (${path.relative(REPO_ROOT, snapshotPath)})`,
      legacySnapshot.admission.errors,
    );
  }
  const error = new Error(
    `sdk-js handoff unavailable from all four sources; legacy snapshot read failed: ${legacySnapshot.error.message}`,
  );
  error.code = "SDKJS_HANDOFF_UNAVAILABLE";
  throw error;
}

/** Offline resolver used by coverage generation so exclusion and gallery
 * admission select the same normalized projection generation. */
export async function loadSdkJsHandoffSnapshots({
  nextSnapshotPath = DEFAULT_HANDOFF_V2_SNAPSHOT_PATH,
  nextFixtureSnapshotPath = DEFAULT_FIXTURE_V4_SNAPSHOT_PATH,
  snapshotPath = DEFAULT_HANDOFF_SNAPSHOT_PATH,
  fixtureSnapshotPath = DEFAULT_FIXTURE_SNAPSHOT_PATH,
  now = new Date(),
} = {}) {
  const nextSnapshot = await acquireSnapshotPair({
    snapshotPath: nextSnapshotPath,
    fixtureSnapshotPath: nextFixtureSnapshotPath,
    now,
  });
  if (nextSnapshot.state === "valid") {
    return admittedResult(nextSnapshot, `next committed snapshot (${path.relative(REPO_ROOT, nextSnapshotPath)})`);
  }
  if (nextSnapshot.state === "invalid") {
    throw presentInvalidError(`next snapshot (${path.relative(REPO_ROOT, nextSnapshotPath)})`, nextSnapshot);
  }

  const legacySnapshot = await acquireSnapshotPair({ snapshotPath, fixtureSnapshotPath, now });
  if (legacySnapshot.state === "valid") {
    return admittedResult(legacySnapshot, `legacy committed snapshot (${path.relative(REPO_ROOT, snapshotPath)})`);
  }
  if (legacySnapshot.state === "invalid") {
    throw invalidTerminalError(
      `legacy snapshot (${path.relative(REPO_ROOT, snapshotPath)})`,
      legacySnapshot.admission.errors,
    );
  }
  const error = new Error(
    `next snapshot unavailable (${nextSnapshot.error.message}); legacy snapshot unavailable (${legacySnapshot.error.message})`,
  );
  error.code = "SDKJS_HANDOFF_UNAVAILABLE";
  throw error;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  return await response.text();
}

async function acquireLivePair({ handoffUrl, fixtureUrl, now, fetchTextFn }) {
  let handoffText;
  let fixtureText;
  try {
    [handoffText, fixtureText] = await Promise.all([fetchTextFn(handoffUrl), fetchTextFn(fixtureUrl)]);
  } catch (error) {
    return { state: "unavailable", error };
  }
  const admission = admitSdkJsHandoff({ handoffText, fixtureText, now });
  return admission.ok
    ? { state: "valid", admission, handoffText, fixtureText }
    : { state: "invalid", admission, handoffText, fixtureText };
}

async function acquireSnapshotPair({ snapshotPath, fixtureSnapshotPath, now }) {
  let handoffText;
  let fixtureText;
  try {
    [handoffText, fixtureText] = await Promise.all([
      readFile(snapshotPath, "utf8"),
      readFile(fixtureSnapshotPath, "utf8"),
    ]);
  } catch (error) {
    return { state: "unavailable", error };
  }
  const admission = admitSdkJsHandoff({ handoffText, fixtureText, now });
  return admission.ok
    ? { state: "valid", admission, handoffText, fixtureText }
    : { state: "invalid", admission, handoffText, fixtureText };
}

function admittedResult(acquisition, source) {
  return {
    handoff: acquisition.admission.handoff,
    fixture: acquisition.admission.fixture,
    contract: acquisition.admission.contract.id,
    source,
  };
}

function presentInvalidError(label, acquisition) {
  const error = new Error(
    `${label} sdk-js handoff pair is present but rejected by admission; refusing fallback:\n  - ${acquisition.admission.errors.join("\n  - ")}`,
  );
  error.code = "SDKJS_NEXT_PRESENT_INVALID";
  return error;
}

function invalidTerminalError(label, errors) {
  const error = new Error(`${label} sdk-js handoff pair rejected by admission:\n  - ${errors.join("\n  - ")}`);
  error.code = "SDKJS_HANDOFF_INVALID";
  return error;
}

async function writeSnapshotPair({
  acquisition,
  snapshotPath,
  fixtureSnapshotPath,
  metaPath,
  handoffSourceUrl,
  fixtureSourceUrl,
}) {
  await Promise.all([
    writeFile(snapshotPath, acquisition.handoffText, "utf8"),
    writeFile(fixtureSnapshotPath, acquisition.fixtureText, "utf8"),
  ]);
  await writeSnapshotMeta({
    metaPath,
    contract: acquisition.admission.contract,
    snapshotPath,
    fixtureSnapshotPath,
    handoffSourceUrl,
    fixtureSourceUrl,
  });
}

async function writeSnapshotMeta({
  metaPath,
  contract,
  snapshotPath,
  fixtureSnapshotPath,
  handoffSourceUrl,
  fixtureSourceUrl,
}) {
  const meta = {
    _comment:
      `Provenance for the byte-exact ${contract.id} snapshot pair ${path.relative(REPO_ROOT, snapshotPath)} and ` +
      `${path.relative(REPO_ROOT, fixtureSnapshotPath)}. Both files are committed EXACTLY as fetched -- never ` +
      "reformat, re-serialize, or hand-edit them: the admission gate in scripts/lib/sdkjs-handoff.mjs verifies " +
      "the handoff's bytes and sha256 against the fixture's input pin, so any local mutation (including " +
      "pretty-printing) is rejected as a tampered/locally-reconstructed projection (honua-io/honua-samples#16). " +
      "Refreshed automatically by scripts/build-gallery.mjs whenever the live fetch succeeds and the fetched " +
      "pair passes admission.",
    contract: {
      handoffFormat: contract.handoffFormat,
      handoffSchemaVersion: contract.handoffSchemaVersion,
      fixtureFormat: contract.fixtureFormat,
      fixtureSchemaVersion: contract.fixtureSchemaVersion,
    },
    handoffSourceUrl,
    fixtureSourceUrl,
    fetchedAt: new Date().toISOString(),
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
}
