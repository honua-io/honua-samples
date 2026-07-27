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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const SDKJS_REPO = "honua-io/honua-sdk-js";
export const SUPPORTED_HANDOFF_FORMAT = "honua.site.sdk-sample-consumer-handoff.v1";
export const SUPPORTED_HANDOFF_SCHEMA_VERSION = 1;
export const SUPPORTED_FIXTURE_FORMAT = "honua.site.sdk-sample-consumer-fixture.v3";
export const SUPPORTED_FIXTURE_SCHEMA_VERSION = 3;

export const DEFAULT_HANDOFF_URL =
  "https://raw.githubusercontent.com/honua-io/honua-sdk-js/trunk/samples/dist/honua-site-consumer-handoff.v1.json";
export const DEFAULT_HANDOFF_FIXTURE_URL =
  "https://raw.githubusercontent.com/honua-io/honua-sdk-js/trunk/samples/contract/v2/consumer-fixtures/honua-site-consumer.v3.json";
export const DEFAULT_HANDOFF_SNAPSHOT_PATH = path.join(REPO_ROOT, "config", "sdkjs-handoff.snapshot.json");
export const DEFAULT_FIXTURE_SNAPSHOT_PATH = path.join(REPO_ROOT, "config", "sdkjs-handoff-fixture.snapshot.json");
export const DEFAULT_SNAPSHOT_META_PATH = path.join(REPO_ROOT, "config", "sdkjs-handoff.snapshot.meta.json");

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
  const reject = (handoff = null, fixture = null) => ({ ok: false, handoff, fixture, errors });

  let fixture;
  try {
    fixture = JSON.parse(fixtureText);
  } catch (err) {
    errors.push(`consumer fixture is not valid JSON: ${err.message}`);
    return reject();
  }
  if (fixture.format !== SUPPORTED_FIXTURE_FORMAT || fixture.schemaVersion !== SUPPORTED_FIXTURE_SCHEMA_VERSION) {
    errors.push(
      `schema-incompatible consumer fixture: got format "${fixture.format}" schemaVersion ${fixture.schemaVersion}, ` +
        `this consumer supports "${SUPPORTED_FIXTURE_FORMAT}" schemaVersion ${SUPPORTED_FIXTURE_SCHEMA_VERSION}`,
    );
    return reject(null, fixture);
  }
  const accepts = fixture.accepts ?? {};
  if (
    accepts.handoffFormat !== SUPPORTED_HANDOFF_FORMAT ||
    accepts.handoffSchemaVersion !== SUPPORTED_HANDOFF_SCHEMA_VERSION
  ) {
    errors.push(
      `schema-incompatible fixture accepts block: producer emits "${accepts.handoffFormat}" ` +
        `schemaVersion ${accepts.handoffSchemaVersion}, this consumer supports "${SUPPORTED_HANDOFF_FORMAT}" ` +
        `schemaVersion ${SUPPORTED_HANDOFF_SCHEMA_VERSION} -- bump this consumer deliberately, never coerce`,
    );
    return reject(null, fixture);
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
    return reject(null, fixture);
  }

  let handoff;
  try {
    handoff = JSON.parse(handoffText);
  } catch (err) {
    errors.push(`handoff is not valid JSON: ${err.message}`);
    return reject(null, fixture);
  }
  if (handoff.format !== accepts.handoffFormat || handoff.schemaVersion !== accepts.handoffSchemaVersion) {
    errors.push(
      `schema-incompatible handoff: declares format "${handoff.format}" schemaVersion ${handoff.schemaVersion}, ` +
        `fixture accepts "${accepts.handoffFormat}" schemaVersion ${accepts.handoffSchemaVersion}`,
    );
    return reject(handoff, fixture);
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
      if (!ids.has(candidate)) {
        errors.push(`gap "${gap.targetId}" names unknown candidate sample "${candidate}"`);
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

  if (errors.length > 0) return reject(handoff, fixture);
  return { ok: true, handoff, fixture, errors: [] };
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
 * Loads and admits the handoff + fixture pair. Resolution order:
 *   1. live fetch of both files (env-overridable URLs); the pair must pass
 *      admission to be used, and on success the byte-exact snapshots are
 *      refreshed (unless refreshSnapshot: false, used by --check).
 *   2. the committed byte-exact snapshot pair, which must itself pass
 *      admission.
 * If neither source yields an admissible pair the returned promise rejects --
 * there is deliberately no third fallback and no local reconstruction.
 *
 * @returns {Promise<{ handoff: object, fixture: object, source: string }>}
 */
export async function loadSdkJsHandoff({
  handoffUrl = process.env.SDKJS_HANDOFF_URL?.trim() || DEFAULT_HANDOFF_URL,
  fixtureUrl = process.env.SDKJS_HANDOFF_FIXTURE_URL?.trim() || DEFAULT_HANDOFF_FIXTURE_URL,
  snapshotPath = DEFAULT_HANDOFF_SNAPSHOT_PATH,
  fixtureSnapshotPath = DEFAULT_FIXTURE_SNAPSHOT_PATH,
  metaPath = DEFAULT_SNAPSHOT_META_PATH,
  refreshSnapshot = true,
  now = new Date(),
} = {}) {
  let liveFailure;
  try {
    const [handoffText, fixtureText] = await Promise.all([fetchText(handoffUrl), fetchText(fixtureUrl)]);
    const admission = admitSdkJsHandoff({ handoffText, fixtureText, now });
    if (!admission.ok) {
      throw new Error(`live handoff pair rejected by admission:\n  - ${admission.errors.join("\n  - ")}`);
    }
    if (refreshSnapshot) {
      await writeFile(snapshotPath, handoffText, "utf8");
      await writeFile(fixtureSnapshotPath, fixtureText, "utf8");
      await writeSnapshotMeta(metaPath, handoffUrl, fixtureUrl);
    }
    return { handoff: admission.handoff, fixture: admission.fixture, source: `live fetch (${handoffUrl})` };
  } catch (err) {
    liveFailure = err;
    console.warn(
      `build-gallery: live sdk-js handoff unusable (${err.message}) -- ` +
        `falling back to the committed snapshot pair at ${path.relative(REPO_ROOT, snapshotPath)}`,
    );
  }

  const [handoffText, fixtureText] = await Promise.all([
    readFile(snapshotPath, "utf8"),
    readFile(fixtureSnapshotPath, "utf8"),
  ]);
  const admission = admitSdkJsHandoff({ handoffText, fixtureText, now });
  if (!admission.ok) {
    throw new Error(
      `sdk-js handoff admission failed for BOTH sources -- refusing to render SDK cards from a rejected projection.\n` +
        `live: ${liveFailure.message}\n` +
        `snapshot (${path.relative(REPO_ROOT, snapshotPath)}):\n  - ${admission.errors.join("\n  - ")}`,
    );
  }
  return {
    handoff: admission.handoff,
    fixture: admission.fixture,
    source: `committed snapshot (${path.relative(REPO_ROOT, snapshotPath)})`,
  };
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  return await response.text();
}

async function writeSnapshotMeta(metaPath, handoffSourceUrl, fixtureSourceUrl) {
  const meta = {
    _comment:
      "Provenance for the byte-exact snapshot pair config/sdkjs-handoff.snapshot.json (the honua-sdk-js " +
      "site-consumer handoff artifact) and config/sdkjs-handoff-fixture.snapshot.json (its v3 consumer fixture, " +
      "which content-binds the handoff by bytes+sha256). Both files are committed EXACTLY as fetched -- never " +
      "reformat, re-serialize, or hand-edit them: the admission gate in scripts/lib/sdkjs-handoff.mjs verifies " +
      "the handoff's bytes and sha256 against the fixture's input pin, so any local mutation (including " +
      "pretty-printing) is rejected as a tampered/locally-reconstructed projection (honua-io/honua-samples#16). " +
      "Refreshed automatically by scripts/build-gallery.mjs whenever the live fetch succeeds and the fetched " +
      "pair passes admission.",
    handoffSourceUrl,
    fixtureSourceUrl,
    fetchedAt: new Date().toISOString(),
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
}
