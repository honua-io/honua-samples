// Loads honua-io/honua-sdk-js's samples/catalog.v2.json projection -- the
// second of the gallery's two inputs per the owner decision on
// honua-io/honua-samples#3 ("samples.honua.io is the single canonical
// gallery ... render BOTH inputs"). Never vendors SDK source: entries link
// out to GitHub (sourcePath/docsPath), consumed as data only.
//
// Resolution order for the catalog itself:
//   1. SDKJS_CATALOG_URL env var, or the trunk raw file by default --
//      fetched at run time.
//   2. config/sdkjs-catalog.snapshot.json -- the committed offline fallback,
//      used whenever the live fetch fails for any reason (network, rate
//      limit, upstream outage), so a samples.honua.io deploy never breaks on
//      an sdk-js-side hiccup.
//
// When the live fetch succeeds, the snapshot file is rewritten in place with
// the fresh payload (unless refreshSnapshot: false is passed, used by
// build-gallery.mjs's --check mode to keep validation side-effect free).
// Run scripts/build-gallery.mjs locally and commit the refreshed snapshot
// occasionally so the offline fallback doesn't drift far behind trunk.
//
// capabilityKeys are materialized on most catalog.v2.json entries already
// (honua-io/honua-sdk-js#635); deriveCapabilityKeys() below is the fallback
// path for any entry (or catalog version) that doesn't carry the field yet,
// applying the same crosswalk file honua-sdk-js validates in its own CI.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const DEFAULT_CATALOG_URL =
  "https://raw.githubusercontent.com/honua-io/honua-sdk-js/trunk/samples/catalog.v2.json";
export const DEFAULT_CROSSWALK_URL =
  "https://raw.githubusercontent.com/honua-io/honua-sdk-js/trunk/config/capability-crosswalk.v1.json";
export const DEFAULT_SNAPSHOT_PATH = path.join(REPO_ROOT, "config", "sdkjs-catalog.snapshot.json");
export const SDKJS_REPO = "honua-io/honua-sdk-js";

/**
 * @returns {Promise<{ catalog: object, source: string }>}
 */
export async function loadSdkJsCatalog({
  catalogUrl = process.env.SDKJS_CATALOG_URL?.trim() || DEFAULT_CATALOG_URL,
  snapshotPath = DEFAULT_SNAPSHOT_PATH,
  refreshSnapshot = true,
} = {}) {
  try {
    const response = await fetch(catalogUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const catalog = await response.json();
    const source = `live fetch (${catalogUrl})`;
    if (refreshSnapshot) {
      await writeSnapshot(snapshotPath, catalogUrl, catalog);
    }
    return { catalog, source };
  } catch (err) {
    console.warn(
      `build-gallery: sdk-js catalog live fetch failed (${err.message}) -- ` +
        `falling back to the committed snapshot at ${path.relative(REPO_ROOT, snapshotPath)}`,
    );
    const raw = JSON.parse(await readFile(snapshotPath, "utf8"));
    return {
      catalog: raw.catalog,
      source: `committed snapshot (${path.relative(REPO_ROOT, snapshotPath)}, fetched ${raw.fetchedAt} from ${raw.sourceUrl})`,
    };
  }
}

async function writeSnapshot(snapshotPath, sourceUrl, catalog) {
  const snapshot = {
    _comment:
      "Committed fallback snapshot consumed by scripts/lib/sdkjs-catalog.mjs (via scripts/build-gallery.mjs) " +
      "when the live fetch of samples/catalog.v2.json fails, so samples.honua.io deploys never break on an " +
      "sdk-js-side hiccup. Rewritten automatically whenever the live fetch succeeds -- commit the change to " +
      "keep the offline fallback current. See honua-io/honua-samples#3.",
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    catalog,
  };
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
}

/**
 * @returns {Promise<{ crosswalk: object, source: string }>}
 */
export async function loadCapabilityCrosswalk({
  crosswalkUrl = process.env.SDKJS_CROSSWALK_URL?.trim() || DEFAULT_CROSSWALK_URL,
} = {}) {
  try {
    const response = await fetch(crosswalkUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = await response.json();
    return { crosswalk: json.crosswalk ?? {}, source: `live fetch (${crosswalkUrl})` };
  } catch (err) {
    console.warn(
      `build-gallery: sdk-js capability crosswalk live fetch failed (${err.message}) -- ` +
        `catalog entries without a materialized capabilityKeys field will show none derived`,
    );
    return { crosswalk: {}, source: "unavailable" };
  }
}

/**
 * Prefers an entry's own materialized `capabilityKeys` (present on most
 * catalog.v2.json entries as of honua-sdk-js#635). Falls back to mapping its
 * SDK-vocabulary `capabilities` tags through the crosswalk for any entry (or
 * older catalog snapshot) that predates that field, skipping tags the
 * crosswalk marks `internalOnly` (SDK-internal concepts with no canonical
 * platform capability).
 */
export function deriveCapabilityKeys(entry, crosswalk) {
  if (Array.isArray(entry.capabilityKeys)) {
    return entry.capabilityKeys;
  }
  const derived = new Set();
  for (const tag of entry.capabilities ?? []) {
    const mapping = crosswalk[tag];
    if (mapping && Array.isArray(mapping.capabilityKeys)) {
      mapping.capabilityKeys.forEach((key) => derived.add(key));
    }
  }
  return Array.from(derived).sort();
}
