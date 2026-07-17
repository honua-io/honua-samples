#!/usr/bin/env node
// Builds the static samples.honua.io gallery into site/ (honua-io/honua-samples#3).
//
// DECISION (owner, 2026-07-17, on #3): samples.honua.io is the single
// canonical gallery, rendering TWO inputs:
//   1. this repo's own samples/<id>/sample.json manifests (+ README.md, +
//      results/run-results.v1.json when available for an honest run badge).
//   2. honua-sdk-js's samples/catalog.v2.json projection (32 entries as of
//      this writing), fetched live with a committed offline fallback -- see
//      scripts/lib/sdkjs-catalog.mjs. Never vendored: entries link out to
//      GitHub (sourcePath/docsPath) only.
//
// Both inputs are validated against the same canonical capability key list
// samples/*/sample.json manifests are validated against
// (scripts/lib/capability-keys.mjs) -- an sdk-js entry referencing an
// unrecognized key fails --check just like an own-sample manifest would.
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
//   RUN_RESULTS_PATH   default "results/run-results.v1.json" (missing is tolerated)
//   KEY_LIST_URL        see scripts/lib/capability-keys.mjs
//   SDKJS_CATALOG_URL   see scripts/lib/sdkjs-catalog.mjs
//   SDKJS_CROSSWALK_URL see scripts/lib/sdkjs-catalog.mjs

import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCapabilityKeyRecords } from "./lib/capability-keys.mjs";
import { renderMarkdown, escapeAttr, escapeHtml } from "./lib/markdown-lite.mjs";
import { loadSdkJsCatalog, loadCapabilityCrosswalk, deriveCapabilityKeys, SDKJS_REPO } from "./lib/sdkjs-catalog.mjs";

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
  const { catalog } = await loadSdkJsCatalog({ refreshSnapshot: !CHECK_MODE });
  const { crosswalk } = await loadCapabilityCrosswalk();
  const sdkRawEntries = catalog.samples ?? [];

  const ownCards = ownSamples.map((s) => toOwnCard(s, runResults, keyByKey, problems));
  const sdkCards = sdkRawEntries.map((e) => toSdkCard(e, crosswalk, keyByKey, problems));
  const cards = [...ownCards, ...sdkCards];

  const categories = groupByCategory(cards, keyByKey);
  const generatedAt = new Date().toISOString();
  const sourceCommit = resolveSourceCommit();

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
  await rmGeneratedDetailDirs(ownSamples, sdkRawEntries);
  await mkdir(SITE_DIR, { recursive: true });

  await copyAssets();
  await writeFile(
    path.join(SITE_DIR, "index.html"),
    renderIndexPage({ categories, cards, keyByKey, generatedAt, sourceCommit }),
    "utf8",
  );

  for (const card of ownCards) {
    const dir = path.join(SITE_DIR, card.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), renderOwnDetailPage(card, keyByKey, generatedAt, sourceCommit), "utf8");
  }

  for (const card of sdkCards) {
    const dir = path.join(SITE_DIR, "sdk", card.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), renderSdkDetailPage(card, keyByKey, generatedAt, sourceCommit), "utf8");
  }

  const pageCount = 1 + ownCards.length + sdkCards.length;
  console.log(
    `build-gallery: wrote ${pageCount} page(s) to site/ -- ${ownCards.length} from ${OWN_REPO}, ${sdkCards.length} from ${SDKJS_REPO}` +
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

function toSdkCard(entry, crosswalk, keyByKey, problems) {
  const id = entry.id;
  if (!entry.sourcePath) {
    problems.push(`${SDKJS_REPO} catalog entry "${id}" has no sourcePath -- cannot link to GitHub source`);
  }
  const capabilities = deriveCapabilityKeys(entry, crosswalk);
  for (const key of capabilities) {
    if (!keyByKey.has(key)) {
      problems.push(`${SDKJS_REPO} catalog entry "${id}" references unknown capability key "${key}" -- crosswalk or catalog is out of sync with the canonical key list`);
    }
  }

  return {
    kind: "sdk",
    id,
    title: entry.title ?? id,
    summary: entry.summary ?? "",
    capabilities,
    sdks: ["js"],
    edition: "community", // sdk-js samples are client-side; none declare a Honua Server edition requirement in catalog.v2.json.
    track: entry.track ?? null,
    supportTier: entry.supportTier ?? "unspecified",
    lifecycle: entry.lifecycle ?? null,
    protocols: entry.protocols ?? [],
    renderers: entry.renderers ?? [],
    sourceRepo: "honua-sdk-js",
    detailUrl: `${GALLERY_BASE_URL}/sdk/${id}/`,
    detailPath: `/sdk/${id}/`,
    githubUrl: entry.sourcePath ? `https://github.com/${SDKJS_REPO}/tree/trunk/${entry.sourcePath}` : null,
    docsUrl: entry.docsPath ? `https://github.com/${SDKJS_REPO}/blob/trunk/${entry.docsPath}` : null,
  };
}

// ---- category grouping ---------------------------------------------------

const OTHER_CATEGORY = "Other (no canonical capability yet)";

function groupByCategory(cards, keyByKey) {
  const buckets = new Map();
  for (const card of cards) {
    const categories = new Set();
    for (const key of card.capabilities) {
      const record = keyByKey.get(key);
      categories.add(record ? record.category : OTHER_CATEGORY);
    }
    if (categories.size === 0) categories.add(OTHER_CATEGORY);
    for (const category of categories) {
      if (!buckets.has(category)) buckets.set(category, []);
      buckets.get(category).push(card);
    }
  }
  const categoryNames = Array.from(buckets.keys()).sort((a, b) => {
    if (a === OTHER_CATEGORY) return 1;
    if (b === OTHER_CATEGORY) return -1;
    return a.localeCompare(b);
  });
  return categoryNames.map((name) => ({
    name,
    cards: buckets.get(name).sort((a, b) => a.title.localeCompare(b.title)),
  }));
}

// ---- rendering: shared chrome -----------------------------------------

function pageShell({ title, description, bodyHtml, depth, generatedAt, sourceCommit }) {
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
<footer class="site-footer">${renderFooter(generatedAt, sourceCommit)}</footer>
${depth === 0 ? `<script src="${assetPrefix}/gallery-filter.js"></script>` : ""}
</body>
</html>
`;
}

function renderFooter(generatedAt, sourceCommit) {
  const commitLink =
    sourceCommit && /^[0-9a-f]{40}$/i.test(sourceCommit)
      ? `<a href="https://github.com/${OWN_REPO}/commit/${sourceCommit}" target="_blank" rel="noopener noreferrer">${sourceCommit.slice(0, 12)}</a>`
      : escapeHtml(sourceCommit ?? "unknown");
  return `<span>Generated ${escapeHtml(generatedAt)}</span><span>Source commit: ${commitLink}</span>`;
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

// ---- rendering: index ---------------------------------------------------

function renderIndexPage({ categories, cards, keyByKey, generatedAt, sourceCommit }) {
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
  });
}

function renderFilterPanel(categories, cards, keyByKey) {
  const capHtml = categories
    .map((category) => {
      const allKeysInSection = new Set(category.cards.flatMap((c) => c.capabilities));
      const keys = Array.from(allKeysInSection)
        .filter((key) => {
          const record = keyByKey.get(key);
          const keyCategory = record ? record.category : OTHER_CATEGORY;
          return keyCategory === category.name;
        })
        .sort();
      if (keys.length === 0) return "";
      return (
        `<p class="subheading">${escapeHtml(category.name)}</p>` +
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
  const extra =
    card.kind === "own"
      ? runBadgeHtml(card.runBadge)
      : chip(`support: ${card.supportTier}`, "support-tier");
  return `<article class="card" data-id="${escapeAttr(card.id)}" data-source="${escapeAttr(card.sourceRepo)}" data-sdks="${dataSdks}" data-edition="${escapeAttr(card.edition)}" data-capabilities="${dataCaps}">
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

function renderOwnDetailPage(card, keyByKey, generatedAt, sourceCommit) {
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
  });
}

// ---- rendering: sdk-js entry detail page --------------------------------

function renderSdkDetailPage(card, keyByKey, generatedAt, sourceCommit) {
  const lifecycleHtml = card.lifecycle
    ? `<span>Lifecycle: ${escapeHtml(card.lifecycle.state)}${card.lifecycle.reason ? ` — ${escapeHtml(card.lifecycle.reason)}` : ""}</span>`
    : "";
  const bodyHtml = `
<a class="back-link" href="../../">← All samples</a>
<p class="empty-state">Projected from <a href="https://github.com/${SDKJS_REPO}" target="_blank" rel="noopener noreferrer">honua-sdk-js</a>'s sample catalog. Code is not vendored here -- follow the GitHub link below for the source.</p>
<h1>${escapeHtml(card.title)}</h1>
<p>${escapeHtml(card.summary)}</p>
<div class="detail-meta">
  <span>Support tier: ${escapeHtml(card.supportTier)}</span>
  ${card.track ? `<span>Track: ${escapeHtml(card.track)}</span>` : ""}
  <span>Protocols: ${card.protocols.map(escapeHtml).join(", ") || "—"}</span>
  <span>Renderers: ${card.renderers.map(escapeHtml).join(", ") || "—"}</span>
  ${lifecycleHtml}
</div>
<h2>Capabilities</h2>
${capabilityChips(card.capabilities, keyByKey)}
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
  });
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

async function rmGeneratedDetailDirs(ownSamples, sdkRawEntries) {
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
