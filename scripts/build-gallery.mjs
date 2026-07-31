#!/usr/bin/env node
// Builds the static samples.honua.io gallery into site/ (honua-io/honua-samples#3).
//
// DECISION (owner, 2026-07-17, on #3): samples.honua.io is the single
// canonical gallery, rendering TWO inputs:
//   1. this repo's own samples/<id>/sample.json manifests (+ README.md, +
//      results/run-results.v1.json when available for an honest run badge).
//   2. honua-sdk-js's versioned site-consumer handoff
//      (samples/dist/honua-site-consumer-handoff.v1.json), the AUTHORITATIVE
//      SDK projection since honua-io/honua-samples#16: fetched live with a
//      committed byte-exact snapshot fallback and admitted through the
//      fail-closed gate in scripts/lib/sdkjs-handoff.mjs (schema/version,
//      fixture digest binding, duplicate-identity, referential-integrity,
//      and evidence-freshness checks). Tampered, stale, schema-incompatible,
//      or locally reconstructed handoffs FAIL the build -- no hand-authored
//      SDK inventory is ever substituted. catalog.v2.json (see
//      scripts/lib/sdkjs-catalog.mjs) remains consumed ONLY to enrich each
//      admitted card with materialized canonical capabilityKeys, merged by
//      stable identity with immutable-field agreement enforced. Never
//      vendored: entries link out to GitHub (sourcePath/docsPath) only.
//
// Deduplication (honua-io/honua-samples#16): exactly ONE public card per
// stable SDK sample identity (producer repository + catalog sample id).
// Multiple evidence sources (handoff evidence, qualified-journey visual
// evidence, staged bundles) enrich that one card as metadata -- duplicate
// identities inside any input, or identity-field disagreements across
// inputs, fail generation instead of cloning cards. SDK-projected cards are
// GALLERY-ONLY evidence (display + provenance + links): they are tagged
// evidenceScope "gallery-only" and are excluded from samples-coverage.v1.json
// by scripts/generate-samples-coverage.mjs, which stays reserved for samples
// this repo executes in its own run-samples workflow.
//
// Both inputs are validated against the same canonical capability key list
// samples/*/sample.json manifests are validated against
// (scripts/lib/capability-keys.mjs) -- an sdk-js entry referencing an
// unrecognized key fails --check just like an own-sample manifest would.
//
// Detail pages also embed the ACTUAL RUNNING SAMPLE wherever a
// sha256-verified static browser bundle has been staged for it
// (honua-io/honua-samples#11, consuming honua-sdk-js#642/#648's
// sample-bundles-latest release via scripts/lib/sample-bundles.mjs) --
// never a fake/broken iframe: an sdk-js entry with no staged bundle gets an
// explicit "no runnable build published yet" panel, and this repo's own
// headless/CLI samples get a labeled "headless sample" panel instead of an
// embed. See scripts/lib/sample-bundles.mjs's header for the integrity and
// degraded-fallback rules.
//
// Zero npm dependencies, matching the rest of this repo's scripts.
//
// Usage:
//   node scripts/build-gallery.mjs           # writes site/index.html, site/<id>/,
//                                             # site/sdk/<id>/, site/assets/
//   node scripts/build-gallery.mjs --check   # builds, but fails (exit 1) on any
//                                             # cross-repo/data problem found along
//                                             # the way; used by validate.yml to
//                                             # gate PRs on a broken gallery build
//
// Env vars (all optional):
//   RUN_RESULTS_PATH           default "results/run-results.v1.json" (missing is tolerated)
//   KEY_LIST_URL                see scripts/lib/capability-keys.mjs
//   SDKJS_HANDOFF_URL           see scripts/lib/sdkjs-handoff.mjs
//   SDKJS_HANDOFF_FIXTURE_URL   see scripts/lib/sdkjs-handoff.mjs
//   SDKJS_CATALOG_URL           see scripts/lib/sdkjs-catalog.mjs
//   SDKJS_CROSSWALK_URL         see scripts/lib/sdkjs-catalog.mjs
//   SAMPLE_BUNDLES_MANIFEST_URL see scripts/lib/sample-bundles.mjs
//   SAMPLE_BUNDLES_TARBALL_URL  see scripts/lib/sample-bundles.mjs

import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCapabilityKeyRecords } from "./lib/capability-keys.mjs";
import { renderMarkdown, escapeAttr, escapeHtml } from "./lib/markdown-lite.mjs";
import { loadSdkJsCatalog, loadCapabilityCrosswalk, deriveCapabilityKeys, SDKJS_REPO } from "./lib/sdkjs-catalog.mjs";
import { loadSdkJsHandoff, mergeSdkProjection } from "./lib/sdkjs-handoff.mjs";
import { ensureSampleBundlesStaged } from "./lib/sample-bundles.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SAMPLES_DIR = path.join(REPO_ROOT, "samples");
const SITE_DIR = path.join(REPO_ROOT, "site");
const ASSETS_SRC_DIR = path.join(__dirname, "gallery-assets");
const RUN_RESULTS_PATH = path.resolve(REPO_ROOT, process.env.RUN_RESULTS_PATH ?? "results/run-results.v1.json");

const GALLERY_BASE_URL = "https://samples.honua.io";
const OWN_REPO = "honua-io/honua-samples";
const CAPABILITIES_CATALOG_URL = "https://honua.io/capabilities.html";

const CHECK_MODE = process.argv.includes("--check");

async function main() {
  const problems = [];

  const { records: keyRecords } = await loadCapabilityKeyRecords();
  const keyByKey = new Map(keyRecords.map((r) => [r.key, r]));

  const ownSamples = await loadOwnSamples();
  const runResults = await loadRunResults();

  // Consumer-admission boundary (honua-io/honua-samples#16): the versioned
  // sdk-js site-consumer handoff is the authoritative SDK projection.
  // loadSdkJsHandoff throws when neither the live pair nor the committed
  // snapshot pair passes admission (tampered/stale/schema-incompatible/
  // locally reconstructed) -- that failure is deliberately fatal in BOTH
  // --check and deploy builds.
  const { handoff, source: handoffSource } = await loadSdkJsHandoff({ refreshSnapshot: !CHECK_MODE });
  const { catalog } = await loadSdkJsCatalog({ refreshSnapshot: !CHECK_MODE });
  const { crosswalk } = await loadCapabilityCrosswalk();
  const merge = mergeSdkProjection({
    handoff,
    catalogEntries: catalog.samples ?? [],
    crosswalk,
    deriveCapabilityKeys,
  });
  if (merge.errors.length > 0) {
    // Duplicate stable identities inside an input, identity-field
    // disagreements between inputs, and non-authoritative public inventory
    // entries all fail generation (REQ-004/REQ-007) -- never rendered as
    // extra or forked cards.
    throw new Error(
      `sdk projection merge failed (${merge.errors.length} error(s)):\n  - ${merge.errors.join("\n  - ")}`,
    );
  }
  console.log(`build-gallery: admitted sdk-js handoff from ${handoffSource} -- ${merge.records.length} card(s)`);

  // Local staging can degrade on a fetch problem (see
  // scripts/lib/sample-bundles.mjs). Production sets a minimum runnable-app
  // count, so either a genuine integrity mismatch or an empty/degraded result
  // is intentionally allowed to throw out of main() and fail the run.
  const bundleState = await ensureSampleBundlesStaged({ refreshSnapshot: !CHECK_MODE });
  const bundleById = new Map((bundleState.manifest?.samples ?? []).map((s) => [s.id, s]));
  const stagedBundleIds = new Set(bundleState.stagedIds);

  const ownCards = ownSamples.map((s) => toOwnCard(s, runResults, keyByKey, problems));
  const sdkCards = merge.records.map((r) => toSdkCard(r, keyByKey, problems, bundleById, stagedBundleIds));
  assertUniqueCardIdentities([...ownCards, ...sdkCards]);
  for (const bundleId of stagedBundleIds) {
    if (!sdkCards.some((c) => c.id === bundleId)) {
      console.warn(
        `build-gallery: staged bundle "${bundleId}" has no admitted sdk-js handoff card -- not embedding it (bundle release and handoff may briefly desync)`,
      );
    }
  }
  // Runnable-first: embedded browser samples lead, then own samples (live
  // run receipts), then unbundled entries — so the gallery opens on things
  // a visitor can actually run instead of "no runnable build" panels.
  const cards = [
    ...sdkCards.filter((c) => c.bundleRunnable),
    ...ownCards,
    ...sdkCards.filter((c) => !c.bundleRunnable),
  ];

  const categories = groupByCategory(cards, keyByKey);
  const generatedAt = new Date().toISOString();
  const sourceCommit = resolveSourceCommit();
  const bundleNotice = bundleState.degraded
    ? `Sample bundle fetch degraded this deploy: ${bundleState.degradedReason} -- no sdk-js samples are embedded; each shows "no runnable build published yet".`
    : null;

  if (problems.length > 0) {
    console.error(`build-gallery: ${problems.length} problem(s) found:`);
    for (const p of problems) console.error(`  - ${p}`);
    if (CHECK_MODE) {
      process.exitCode = 1;
      return;
    }
    console.warn("build-gallery: continuing build despite the above (run with --check to make these fatal).");
  }

  await rm(path.join(SITE_DIR, "assets"), { recursive: true, force: true });
  await rmGeneratedDetailDirs(ownSamples);
  await mkdir(SITE_DIR, { recursive: true });

  await copyAssets();
  const indexHtml = renderIndexPage({ categories, cards, keyByKey, generatedAt, sourceCommit, bundleNotice });
  assertNoDuplicateArticles(indexHtml);
  await writeFile(path.join(SITE_DIR, "index.html"), indexHtml, "utf8");

  for (const card of ownCards) {
    const dir = path.join(SITE_DIR, card.id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "index.html"),
      renderOwnDetailPage(card, keyByKey, generatedAt, sourceCommit, bundleNotice),
      "utf8",
    );
  }

  let embeddedCount = 0;
  for (const card of sdkCards) {
    const dir = path.join(SITE_DIR, "sdk", card.id);
    await mkdir(dir, { recursive: true });
    if (card.bundleRunnable) {
      // Copy AFTER mkdir/rm above so this never races build-gallery's own
      // site/sdk/ cleanup -- the staging root (scripts/lib/sample-bundles.mjs)
      // lives outside site/ entirely for exactly this reason.
      await cp(path.join(bundleState.stagingRoot, card.id), path.join(dir, "app"), { recursive: true });
      embeddedCount += 1;
    }
    await writeFile(
      path.join(dir, "index.html"),
      renderSdkDetailPage(card, keyByKey, generatedAt, sourceCommit, bundleNotice),
      "utf8",
    );
  }

  // Historical /sdk/<id>/ URLs for internal fixture-track catalog entries the
  // authoritative handoff deliberately keeps out of the public projection:
  // keep them resolving as explicit status pages (never substitute cards, per
  // the producer's not-public route contract), so existing deep links don't
  // 404 while the public card set stays exactly the admitted projection.
  for (const entry of merge.fixtureOnlyEntries) {
    const dir = path.join(SITE_DIR, "sdk", entry.id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "index.html"),
      renderSdkStatusStubPage(entry, generatedAt, sourceCommit, bundleNotice),
      "utf8",
    );
  }

  const pageCount = 1 + ownCards.length + sdkCards.length + merge.fixtureOnlyEntries.length;
  console.log(
    `build-gallery: wrote ${pageCount} page(s) to site/ -- ${ownCards.length} from ${OWN_REPO}, ${sdkCards.length} from ${SDKJS_REPO}` +
      ` (${embeddedCount} sdk-js sample(s) embedded with a verified running bundle` +
      `${merge.fixtureOnlyEntries.length ? `, ${merge.fixtureOnlyEntries.length} internal-fixture status stub(s)` : ""})` +
      (problems.length ? ` (${problems.length} problem(s) warned, see above)` : ""),
  );
}

// ---- loading: this repo's own samples --------------------------------

async function loadOwnSamples() {
  let entries;
  try {
    entries = await readdir(SAMPLES_DIR, { withFileTypes: true });
  } catch (err) {
    throw new Error(`cannot read samples directory ${SAMPLES_DIR}: ${err.message}`);
  }
  const dirNames = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  const samples = [];
  for (const dirName of dirNames) {
    const manifestPath = path.join(SAMPLES_DIR, dirName, "sample.json");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (err) {
      console.warn(`build-gallery: skipping samples/${dirName}/ -- could not read/parse sample.json: ${err.message}`);
      continue;
    }
    let readme = null;
    try {
      readme = await readFile(path.join(SAMPLES_DIR, dirName, "README.md"), "utf8");
    } catch {
      // No README.md -- the detail page renders a plain notice instead.
    }
    samples.push({ dirName, manifest, readme });
  }
  return samples;
}

async function loadRunResults() {
  let raw;
  try {
    raw = await readFile(RUN_RESULTS_PATH, "utf8");
  } catch {
    console.warn(
      `build-gallery: no run results at ${path.relative(REPO_ROOT, RUN_RESULTS_PATH)} -- run badges will reflect "not yet run" instead of an actual outcome`,
    );
    return { resultsById: new Map(), generatedAt: null };
  }
  const envelope = JSON.parse(raw);
  const resultsById = new Map();
  for (const result of envelope.results ?? []) {
    if (!result?.id) continue;
    resultsById.set(result.id, result);
  }
  return { resultsById, generatedAt: envelope.generatedAt };
}

// ---- card normalization -------------------------------------------------

function toOwnCard(sample, runResults, keyByKey, problems) {
  const { dirName, manifest, readme } = sample;
  const id = manifest.id ?? dirName;
  const capabilities = manifest.capabilities ?? [];
  for (const key of capabilities) {
    if (!keyByKey.has(key)) {
      problems.push(`samples/${dirName}/sample.json references unknown capability key "${key}"`);
    }
  }

  const result = runResults.resultsById.get(id);
  const runBadge = computeOwnRunBadge(manifest, result, runResults.generatedAt);

  return {
    kind: "own",
    id,
    title: manifest.title ?? id,
    summary: manifest.description ?? "",
    capabilities,
    sdks: manifest.sdks ?? [],
    edition: manifest.edition ?? "community",
    status: manifest.status ?? "active",
    protocols: manifest.protocols ?? [],
    sourceRepo: "honua-samples",
    detailUrl: `${GALLERY_BASE_URL}/${id}/`,
    detailPath: `/${id}/`,
    githubUrl: `https://github.com/${OWN_REPO}/tree/trunk/samples/${dirName}`,
    readmeHtml: readme ? renderMarkdown(readme) : null,
    runBadge,
    entrypoint: manifest.entrypoint ?? null,
  };
}

function computeOwnRunBadge(manifest, result, envelopeGeneratedAt) {
  if (manifest.status === "draft") {
    return { state: "draft", label: "Draft — validated only, not yet executed in CI" };
  }
  if (!result) {
    return { state: "none", label: "Active — no run results yet" };
  }
  const date = envelopeGeneratedAt ? envelopeGeneratedAt.slice(0, 10) : "an unknown date";
  if (result.outcome === "pass") {
    return {
      state: "pass",
      label: `Runs green — verified ${date} against server ${result.serverVersion ?? "unknown"}`,
    };
  }
  return {
    state: "fail",
    label: `Last run failed on ${date} (server ${result.serverVersion ?? "unknown"})${result.error ? `: ${result.error}` : ""}`,
  };
}

function toSdkCard(record, keyByKey, problems, bundleById, stagedBundleIds) {
  const entry = record.card;
  const id = entry.id;
  for (const key of record.capabilityKeys) {
    if (!keyByKey.has(key)) {
      problems.push(`${SDKJS_REPO} handoff card "${id}" references unknown capability key "${key}" -- crosswalk or catalog is out of sync with the canonical key list`);
    }
  }

  return {
    kind: "sdk",
    id,
    // Stable composite identity (REQ-001): producer repository + catalog
    // sample id. Deduplication and cross-source joins key on this, never on
    // title or presentation order.
    identity: record.identity,
    // Evidence boundary (honua-io/honua-samples#16): sdk-projected cards are
    // gallery-only -- display, provenance, and evidence links. They are
    // excluded from samples-coverage.v1.json by
    // scripts/generate-samples-coverage.mjs.
    evidenceScope: "gallery-only",
    title: entry.title ?? id,
    summary: entry.summary ?? "",
    capabilities: record.capabilityKeys,
    sdks: ["js"],
    edition: "community", // sdk-js samples are client-side; none declare a Honua Server edition requirement.
    track: entry.track ?? null,
    supportTier: entry.supportTier ?? "unspecified",
    lifecycle: entry.lifecycle ?? null,
    protocols: entry.protocols ?? [],
    renderers: entry.renderers ?? [],
    qualification: entry.qualification ?? null,
    evidence: entry.evidence ?? null,
    evidenceBindingId: entry.evidenceBindingId ?? null,
    canonicalPath: entry.canonicalPath,
    legacyPaths: record.legacyPaths,
    lifecycleNotice: record.lifecycleNotice,
    qualifiedJourneys: record.qualifiedJourneys,
    gaps: record.gaps,
    sourceRepo: "honua-sdk-js",
    detailUrl: `${GALLERY_BASE_URL}/sdk/${id}/`,
    detailPath: `/sdk/${id}/`,
    githubUrl: `https://github.com/${SDKJS_REPO}/tree/trunk/${entry.source.path}`,
    docsUrl: entry.source.docsPath ? `https://github.com/${SDKJS_REPO}/blob/trunk/${entry.source.docsPath}` : null,
    // Populated only when scripts/lib/sample-bundles.mjs's manifest has this
    // id AND this build actually staged sha256-verified files for it this
    // run (bundleSample can be non-null while bundleStaged is false in a
    // degraded run -- see the file header comment on scripts/lib/sample-bundles.mjs).
    bundleSample: bundleById.get(id) ?? null,
    bundleStaged: stagedBundleIds.has(id),
    bundleRunnable:
      stagedBundleIds.has(id) && bundleById.get(id)?.runnability === "standalone",
  };
}

/**
 * Static build assertion (honua-io/honua-samples#16): the final public card
 * set must contain exactly one card per stable identity. This can only trip
 * if a future refactor introduces a second projection path -- the merge
 * already fails on duplicate inputs -- but the invariant is cheap and the
 * regression it guards against (39 articles for 32 identities) shipped once
 * already.
 */
function assertUniqueCardIdentities(cards) {
  const seen = new Set();
  const duplicates = new Set();
  for (const card of cards) {
    const key = `${card.kind}:${card.id}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  if (duplicates.size > 0) {
    throw new Error(`duplicate public card identities after merge: ${[...duplicates].sort().join(", ")}`);
  }
}

// ---- category grouping ---------------------------------------------------

const OTHER_CATEGORY = "Other (no canonical capability yet)";

// One <article> per logical sample (honua-io/honua-samples#16): each card is
// assigned to exactly ONE section -- its deterministic primary category (the
// alphabetically first category among its capability keys' categories, with
// the "Other" bucket always last). Before this rule, a card whose
// capabilities spanned N categories rendered N times, which is precisely the
// duplication the issue observed live (39 articles for 32 identities, e.g.
// cesium-route-playback three times). The card's FULL capability set stays
// on the card (data-capabilities + chips + detail page), so capability
// filters in non-primary categories still match it (REQ-003), and the
// index's filter counts now count logical samples, not DOM clones (NFR-001).
function primaryCategory(card, keyByKey) {
  const categories = new Set();
  for (const key of card.capabilities) {
    const record = keyByKey.get(key);
    categories.add(record ? record.category : OTHER_CATEGORY);
  }
  if (categories.size === 0) return OTHER_CATEGORY;
  return [...categories].sort(compareCategoryNames)[0];
}

function compareCategoryNames(a, b) {
  if (a === b) return 0;
  if (a === OTHER_CATEGORY) return 1;
  if (b === OTHER_CATEGORY) return -1;
  return a.localeCompare(b);
}

function groupByCategory(cards, keyByKey) {
  const buckets = new Map();
  for (const card of cards) {
    const category = primaryCategory(card, keyByKey);
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(card);
  }
  const categoryNames = Array.from(buckets.keys()).sort(compareCategoryNames);
  return categoryNames.map((name) => ({
    name,
    cards: buckets.get(name).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
  }));
}

// ---- rendering: shared chrome -----------------------------------------

function pageShell({ title, description, bodyHtml, depth, generatedAt, sourceCommit, bundleNotice }) {
  const assetPrefix = depth === 0 ? "assets" : "../".repeat(depth) + "assets";
  const homeHref = depth === 0 ? "./" : "../".repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(description)}" />
<link rel="stylesheet" href="${assetPrefix}/gallery.css" />
</head>
<body>
<header class="site-header">
  <a class="brand" href="${homeHref}">Honua Samples</a>
  <nav>
    <a href="${CAPABILITIES_CATALOG_URL}">Capability catalog</a>
    <a href="https://github.com/${OWN_REPO}" target="_blank" rel="noopener noreferrer">honua-samples ↗</a>
    <a href="https://github.com/${SDKJS_REPO}" target="_blank" rel="noopener noreferrer">honua-sdk-js ↗</a>
  </nav>
</header>
<main>
${bodyHtml}
</main>
<footer class="site-footer">${renderFooter(generatedAt, sourceCommit, bundleNotice)}</footer>
${depth === 0 ? `<script src="${assetPrefix}/gallery-filter.js"></script>` : ""}
</body>
</html>
`;
}

function renderFooter(generatedAt, sourceCommit, bundleNotice) {
  const commitLink =
    sourceCommit && /^[0-9a-f]{40}$/i.test(sourceCommit)
      ? `<a href="https://github.com/${OWN_REPO}/commit/${sourceCommit}" target="_blank" rel="noopener noreferrer">${sourceCommit.slice(0, 12)}</a>`
      : escapeHtml(sourceCommit ?? "unknown");
  const notice = bundleNotice ? `<span class="bundle-notice">⚠ ${escapeHtml(bundleNotice)}</span>` : "";
  return `<span>Generated ${escapeHtml(generatedAt)}</span><span>Source commit: ${commitLink}</span>${notice}`;
}

function chip(text, extraClass) {
  const cls = extraClass ? `chip ${extraClass}` : "chip";
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function capabilityChips(capabilities, keyByKey) {
  if (capabilities.length === 0) return `<span class="chips">${chip("no canonical capability yet")}</span>`;
  return `<div class="chips">${capabilities
    .map((key) => {
      const record = keyByKey.get(key);
      const label = record ? record.displayName : key;
      return chip(`${label} (${key})`);
    })
    .join("")}</div>`;
}

function runBadgeHtml(badge) {
  if (!badge) return "";
  return `<span class="badge ${badge.state}">${escapeHtml(badge.label)}</span>`;
}

// ---- rendering: bundle embed / no-bundle / headless panels ---------------
//
// Honesty rules (honua-io/honua-samples#11): a detail page NEVER shows an
// iframe unless this build actually staged sha256-verified files for it
// (card.bundleStaged); an entry with a catalog projection but no staged
// bundle always gets the explicit "no runnable build published yet" panel,
// never a broken/empty iframe; own-repo headless/CLI samples always get the
// labeled headless panel, never a fake embed.

const DATA_MODE_LABELS = {
  fixture: "fixture mode",
  hybrid: "hybrid mode",
  "public-live": "public-live mode",
  live: "live mode",
};

function renderEmbedPanel(card) {
  const { bundleSample } = card;
  const commit = bundleSample.builtFrom?.commit;
  const commitHtml =
    commit && /^[0-9a-f]{40}$/i.test(commit)
      ? `<a href="https://github.com/${SDKJS_REPO}/commit/${commit}" target="_blank" rel="noopener noreferrer">${commit.slice(0, 12)}</a>`
      : escapeHtml(commit ?? "unknown commit");
  const modeLabel = DATA_MODE_LABELS[bundleSample.dataMode] ?? escapeHtml(bundleSample.dataMode ?? "unknown data mode");
  const entrypoint = bundleSample.entrypoint ?? "index.html";
  const appHref = entrypoint === "index.html" ? "app/" : `app/${entrypoint}`;
  return `
<div class="embed-panel">
  <iframe src="${escapeAttr(appHref)}" title="${escapeAttr(card.title)} -- running sample" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  <p class="embed-toolbar">
    <a href="${escapeAttr(appHref)}" target="_blank" rel="noopener noreferrer">Open full screen ↗</a>
    <span class="provenance">Built from honua-sdk-js @${commitHtml}, ${modeLabel}${bundleSample.builtFrom?.packageVersion ? ` (v${escapeHtml(bundleSample.builtFrom.packageVersion)})` : ""}</span>
  </p>
</div>`;
}

function renderNoBundlePanel(reason) {
  return `<div class="no-bundle-panel"><p class="empty-state">No runnable build published yet.${reason ? ` ${escapeHtml(reason)}` : ""}</p></div>`;
}

function renderHeadlessPanel(card) {
  const command = card.entrypoint?.command ? `<code>${escapeHtml(card.entrypoint.command)}</code>` : "its documented entrypoint";
  const runsWorkflowUrl = `https://github.com/${OWN_REPO}/actions/workflows/run-samples.yml`;
  return `
<div class="headless-panel">
  <p><strong>Headless sample</strong> — run it locally: ${command}. See
    <a href="${runsWorkflowUrl}" target="_blank" rel="noopener noreferrer">run receipts ↗</a>
    for the latest CI execution against a real server.</p>
</div>`;
}

// ---- rendering: index ---------------------------------------------------

function renderIndexPage({ categories, cards, keyByKey, generatedAt, sourceCommit, bundleNotice }) {
  const ownCount = cards.filter((c) => c.kind === "own").length;
  const sdkCount = cards.filter((c) => c.kind === "sdk").length;

  const bodyHtml = `
<section class="intro">
  <h1>Honua Samples Gallery</h1>
  <p>Runnable evidence, one gallery. ${ownCount} sample${ownCount === 1 ? "" : "s"} from
     <a href="https://github.com/${OWN_REPO}" target="_blank" rel="noopener noreferrer">honua-samples</a>
     (executed headless in CI against a real server) and ${sdkCount} entries from
     <a href="https://github.com/${SDKJS_REPO}" target="_blank" rel="noopener noreferrer">honua-sdk-js</a>'s
     sample catalog (client-side JS samples, linked to their GitHub source -- nothing is vendored here).
     Every capability shown is a canonical key from the
     <a href="${CAPABILITIES_CATALOG_URL}">Honua capability catalog</a>; deep links of the form
     <code>?caps=key1,key2</code> interoperate with that page's filters.</p>
</section>
<div class="layout">
  <aside class="filters">
    ${renderFilterPanel(categories, cards, keyByKey)}
  </aside>
  <div class="results">
    <p id="filter-status">Showing all ${cards.length} sample(s).</p>
    <div id="empty-state" class="empty-state" hidden>No samples match the current filters.</div>
    ${categories.map((category) => renderCategorySection(category)).join("\n")}
  </div>
</div>
`;

  return pageShell({
    title: "Honua Samples Gallery",
    description: "The canonical Honua sample gallery -- runnable server samples and the honua-sdk-js catalog, capability-keyed.",
    bodyHtml,
    depth: 0,
    generatedAt,
    sourceCommit,
    bundleNotice,
  });
}

function renderFilterPanel(categories, cards, keyByKey) {
  // Capability checkboxes are grouped by the KEY's own category across ALL
  // cards -- deliberately not by card section: a card lives in exactly one
  // (primary-category) section, but every capability it carries must remain
  // filterable under that capability's own heading.
  const keysByCategory = new Map();
  for (const key of new Set(cards.flatMap((c) => c.capabilities))) {
    const record = keyByKey.get(key);
    const category = record ? record.category : OTHER_CATEGORY;
    if (!keysByCategory.has(category)) keysByCategory.set(category, []);
    keysByCategory.get(category).push(key);
  }
  const capHtml = Array.from(keysByCategory.keys())
    .sort(compareCategoryNames)
    .map((category) => {
      const keys = keysByCategory.get(category).sort();
      return (
        `<p class="subheading">${escapeHtml(category)}</p>` +
        keys
          .map((key) => {
            const record = keyByKey.get(key);
            const displayName = record ? record.displayName : key;
            return `<label><input type="checkbox" class="filter-cap" value="${escapeAttr(key)}" /> ${escapeHtml(displayName)}</label>`;
          })
          .join("")
      );
    })
    .join("");

  const sdkValues = Array.from(new Set(cards.flatMap((c) => c.sdks))).sort();
  const editionValues = Array.from(new Set(cards.map((c) => c.edition))).sort();
  const sourceValues = Array.from(new Set(cards.map((c) => c.sourceRepo))).sort();

  return `
<h2>Capability</h2>
<div class="filter-group">${capHtml}</div>
<h2>SDK</h2>
<div class="filter-group">${sdkValues.map((v) => `<label><input type="checkbox" class="filter-sdk" value="${escapeAttr(v)}" /> ${escapeHtml(v)}</label>`).join("")}</div>
<h2>Edition</h2>
<div class="filter-group">${editionValues.map((v) => `<label><input type="checkbox" class="filter-edition" value="${escapeAttr(v)}" /> ${escapeHtml(v)}</label>`).join("")}</div>
<h2>Source repo</h2>
<div class="filter-group">${sourceValues.map((v) => `<label><input type="checkbox" class="filter-source" value="${escapeAttr(v)}" /> ${escapeHtml(v)}</label>`).join("")}</div>
<div class="filter-group filter-runnable-group"><label><input type="checkbox" id="filter-runnable" /> &#9654; Runnable in browser</label></div>
<button type="button" id="filter-clear">Clear filters</button>
<div id="cap-share-row" hidden>
  <div class="share-box">
    <input type="text" id="cap-share-url" readonly aria-label="Shareable filtered link" />
    <button type="button" id="cap-share-copy">Copy link</button>
  </div>
  <p id="cap-share-status" class="empty-state"></p>
</div>
`;
}

function renderCategorySection(category) {
  return `
<section class="category">
  <h2>${escapeHtml(category.name)}</h2>
  <div class="card-grid">
    ${category.cards.map((card) => renderCard(card)).join("\n")}
  </div>
</section>`;
}

function renderCard(card) {
  const dataCaps = escapeAttr(card.capabilities.join(","));
  const dataSdks = escapeAttr(card.sdks.join(","));
  const runnable = card.kind === "sdk" && card.bundleRunnable;
  const extra =
    card.kind === "own"
      ? runBadgeHtml(card.runBadge)
      : chip(`support: ${card.supportTier}`, "support-tier");
  const runnableBadge = runnable
    ? `<span class="badge runnable" title="Runs in the browser on this page">&#9654; Runnable</span>`
    : "";
  const evidenceScope = card.kind === "sdk" ? ` data-evidence-scope="gallery-only"` : "";
  return `<article class="card${runnable ? " has-runnable" : ""}" data-id="${escapeAttr(card.id)}" data-source="${escapeAttr(card.sourceRepo)}"${evidenceScope} data-sdks="${dataSdks}" data-edition="${escapeAttr(card.edition)}" data-runnable="${runnable ? "yes" : "no"}" data-capabilities="${dataCaps}">
  ${runnableBadge}
  <h3><a href="${card.detailPath}">${escapeHtml(card.title)}</a></h3>
  <p class="summary">${escapeHtml(card.summary)}</p>
  <div class="chips">
    ${chip(card.sourceRepo, `source-${card.sourceRepo}`)}
    ${card.sdks.map((s) => chip(s)).join("")}
    ${chip(card.edition)}
  </div>
  ${extra}
</article>`;
}

// ---- rendering: own sample detail page ----------------------------------

function renderOwnDetailPage(card, keyByKey, generatedAt, sourceCommit, bundleNotice) {
  // No own-repo sample publishes a browser bundle today (this repo never
  // builds from upstream source, and hello-featureserver-rest is headless);
  // entrypoint.type "node" (or anything but "browser") always gets the
  // headless panel. A future own-repo browser sample with no staged bundle
  // gets the same honest no-bundle panel an unbundled sdk-js entry gets.
  const runnablePanel =
    card.entrypoint?.type === "browser"
      ? renderNoBundlePanel("This repo does not yet publish a staged browser bundle for it.")
      : renderHeadlessPanel(card);
  const bodyHtml = `
<a class="back-link" href="../">← All samples</a>
<h1>${escapeHtml(card.title)}</h1>
<p>${escapeHtml(card.summary)}</p>
<div class="detail-meta">
  <span>SDKs: ${card.sdks.map(escapeHtml).join(", ") || "—"}</span>
  <span>Protocols: ${card.protocols.map(escapeHtml).join(", ") || "—"}</span>
  <span>Edition: ${escapeHtml(card.edition)}</span>
  <span>Status: ${escapeHtml(card.status)}</span>
</div>
${runBadgeHtml(card.runBadge)}
${runnablePanel}
<h2>Capabilities</h2>
${capabilityChips(card.capabilities, keyByKey)}
<p><a href="${card.githubUrl}" target="_blank" rel="noopener noreferrer">View source on GitHub ↗</a></p>
${card.readmeHtml ? `<div class="readme">${card.readmeHtml}</div>` : `<p class="empty-state">No README.md found for this sample.</p>`}
`;
  return pageShell({
    title: `${card.title} — Honua Samples`,
    description: card.summary || card.title,
    bodyHtml,
    depth: 1,
    generatedAt,
    sourceCommit,
    bundleNotice,
  });
}

// ---- rendering: sdk-js entry detail page --------------------------------

function renderSdkDetailPage(card, keyByKey, generatedAt, sourceCommit, bundleNotice) {
  const lifecycleHtml = card.lifecycle
    ? `<span>Lifecycle: ${escapeHtml(card.lifecycle.state)}${card.lifecycle.reason ? ` — ${escapeHtml(card.lifecycle.reason)}` : ""}</span>`
    : "";
  const qualificationHtml = card.qualification
    ? `<span>Qualification: ${escapeHtml(card.qualification.state)}</span>`
    : "";
  const runnablePanel = card.bundleRunnable
    ? renderEmbedPanel(card)
    : renderNoBundlePanel(
        card.bundleStaged && card.bundleSample?.runnability === "requires-host-fixture-service"
          ? "This build requires host fixture routes and is not a standalone gallery app."
          : card.bundleSample
            ? "A build was published for it before, but no verified bundle is staged for this deploy."
            : "",
      );
  const bodyHtml = `
<a class="back-link" href="../../">← All samples</a>
<p class="empty-state">Projected from <a href="https://github.com/${SDKJS_REPO}" target="_blank" rel="noopener noreferrer">honua-sdk-js</a>'s versioned site-consumer handoff. Code is not vendored here -- follow the GitHub link below for the source. This card is gallery-only evidence: it is <strong>not</strong> counted in this repo's samples-coverage.v1.json, which is reserved for samples honua-samples executes in its own run-samples workflow (SDK qualification receipts flow to honua-evidence through honua-sdk-js's own coverage artifact).</p>
${renderSdkLifecycleNotice(card.lifecycleNotice)}
<h1>${escapeHtml(card.title)}</h1>
<p>${escapeHtml(card.summary)}</p>
<div class="detail-meta">
  <span>Support tier: ${escapeHtml(card.supportTier)}</span>
  ${card.track ? `<span>Track: ${escapeHtml(card.track)}</span>` : ""}
  <span>Protocols: ${card.protocols.map(escapeHtml).join(", ") || "—"}</span>
  <span>Renderers: ${card.renderers.map(escapeHtml).join(", ") || "—"}</span>
  ${lifecycleHtml}
  ${qualificationHtml}
</div>
${runnablePanel}
<h2>Capabilities</h2>
${capabilityChips(card.capabilities, keyByKey)}
${renderSdkEvidenceSection(card)}
<p>
  ${card.githubUrl ? `<a href="${card.githubUrl}" target="_blank" rel="noopener noreferrer">View source on GitHub ↗</a>` : ""}
  ${card.docsUrl ? ` · <a href="${card.docsUrl}" target="_blank" rel="noopener noreferrer">Docs ↗</a>` : ""}
</p>
`;
  return pageShell({
    title: `${card.title} — Honua Samples`,
    description: card.summary || card.title,
    bodyHtml,
    depth: 2,
    generatedAt,
    sourceCommit,
    bundleNotice,
  });
}

function renderSdkLifecycleNotice(notice) {
  if (!notice) return "";
  const replacement = notice.replacement
    ? notice.replacement.url
      ? ` Replacement: <a href="${escapeAttr(notice.replacement.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(notice.replacement.title ?? notice.replacement.id ?? "see producer notice")}</a>.`
      : ` Replacement: ${escapeHtml(notice.replacement.title ?? notice.replacement.id ?? "see producer notice")}.`
    : "";
  return `<div class="no-bundle-panel"><p><strong>Lifecycle notice (${escapeHtml(notice.state)})</strong> — ${escapeHtml(notice.reason)}${notice.targetRelease ? ` Target release: ${escapeHtml(notice.targetRelease)}.` : ""}${replacement}</p></div>`;
}

// Provenance + evidence links carried over from the admitted handoff
// (REQ-003: multiple evidence runs and routes stay card/detail METADATA,
// never cloned cards). Screenshot/evidence paths link back to the producer
// repo -- nothing is vendored or re-hosted here.
function renderSdkEvidenceSection(card) {
  const rows = [];
  for (const journey of card.qualifiedJourneys ?? []) {
    const ve = journey.visualEvidence ?? {};
    const shots = (ve.screenshots ?? [])
      .map(
        (s) =>
          `<a href="https://github.com/${SDKJS_REPO}/blob/trunk/${escapeAttr(s.sourcePath)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.variant)} ↗</a>`,
      )
      .join(" · ");
    rows.push(
      `<li>Qualified journey <code>${escapeHtml(journey.journeyId)}</code> — evidence binding <code>${escapeHtml(journey.evidenceBindingId ?? "—")}</code>, observed ${escapeHtml(ve.observedAt ?? "unknown")}, window until ${escapeHtml(ve.expiresAt ?? "unknown")}${shots ? ` — screenshots: ${shots}` : ""}</li>`,
    );
  }
  if (card.legacyPaths?.length > 0) {
    rows.push(
      `<li>Legacy producer routes redirecting to this sample: ${card.legacyPaths.map((p) => `<code>${escapeHtml(p)}</code>`).join(", ")}</li>`,
    );
  }
  if (card.gaps?.length > 0) {
    const gapItems = card.gaps
      .map((g) => `<li><code>${escapeHtml(g.targetId)}</code> (${escapeHtml(g.coverageState)}): ${escapeHtml(g.reason)}</li>`)
      .join("\n");
    rows.push(`<li><details><summary>${card.gaps.length} explicit coverage gap(s) declared by the producer</summary><ul>${gapItems}</ul></details></li>`);
  }
  if (rows.length === 0) return "";
  return `<h2>Provenance &amp; evidence</h2>\n<ul class="evidence-list">\n${rows.join("\n")}\n</ul>`;
}

// Status stub for internal fixture-track catalog entries the authoritative
// handoff keeps out of the public projection (honua-io/honua-samples#16):
// the historical /sdk/<id>/ URL keeps resolving, but as an explicit status
// page, never as a public sample card.
function renderSdkStatusStubPage(entry, generatedAt, sourceCommit, bundleNotice) {
  const bodyHtml = `
<a class="back-link" href="../../">← All samples</a>
<h1>${escapeHtml(entry.title ?? entry.id)}</h1>
<div class="no-bundle-panel"><p><strong>Internal SDK fixture — not a public sample.</strong>
The authoritative honua-sdk-js site-consumer handoff does not publish this entry as a public card
${entry.lifecycle?.reason ? `(${escapeHtml(entry.lifecycle.reason)})` : ""}, so it is not listed in the gallery.</p></div>
${entry.sourcePath ? `<p><a href="https://github.com/${SDKJS_REPO}/tree/trunk/${escapeAttr(entry.sourcePath)}" target="_blank" rel="noopener noreferrer">View source on GitHub ↗</a></p>` : ""}
`;
  return pageShell({
    title: `${entry.title ?? entry.id} — Honua Samples`,
    description: "Internal SDK fixture -- not a public sample.",
    bodyHtml,
    depth: 2,
    generatedAt,
    sourceCommit,
    bundleNotice,
  });
}

// Static build assertion on the RENDERED index (honua-io/honua-samples#16):
// the shipped duplication was a rendering bug (one <article> per category a
// card's capabilities spanned), which assertUniqueCardIdentities cannot see
// because the card LIST was already unique. Guard the actual output.
function assertNoDuplicateArticles(indexHtml) {
  const counts = new Map();
  for (const match of indexHtml.matchAll(/<article class="card[^"]*" data-id="([^"]+)"/g)) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} (x${n})`);
  if (duplicated.length > 0) {
    throw new Error(`index.html renders duplicate card article(s) for: ${duplicated.sort().join(", ")}`);
  }
}

// ---- misc ----------------------------------------------------------------

async function copyAssets() {
  const destDir = path.join(SITE_DIR, "assets");
  await mkdir(destDir, { recursive: true });
  for (const name of ["gallery.css", "gallery-filter.js"]) {
    const content = await readFile(path.join(ASSETS_SRC_DIR, name), "utf8");
    await writeFile(path.join(destDir, name), content, "utf8");
  }
}

async function rmGeneratedDetailDirs(ownSamples) {
  for (const { dirName } of ownSamples) {
    await rm(path.join(SITE_DIR, dirName), { recursive: true, force: true });
  }
  await rm(path.join(SITE_DIR, "sdk"), { recursive: true, force: true });
  // Also clear any stale detail dirs from a previous build (e.g. a sample
  // that was renamed/removed since) so nothing orphaned lingers in site/.
  let entries = [];
  try {
    entries = await readdir(SITE_DIR, { withFileTypes: true });
  } catch {
    return;
  }
  const known = new Set(["assets", "index.html", "CNAME", ".nojekyll", "sdk", ...ownSamples.map((s) => s.dirName)]);
  for (const entry of entries) {
    if (entry.isDirectory() && !known.has(entry.name)) {
      await rm(path.join(SITE_DIR, entry.name), { recursive: true, force: true });
    }
  }
}

function resolveSourceCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

main().catch((err) => {
  console.error(`build-gallery: ${err.message}`);
  process.exitCode = 1;
});
