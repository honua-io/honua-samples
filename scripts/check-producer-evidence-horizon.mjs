#!/usr/bin/env node
// Fails before the pinned SDK producer's visual evidence expires.
//
// honua-io/honua-samples#57 (a recurrence of #50): the gallery admission gate
// refuses a handoff whose qualified-journey visual evidence has expired. That
// refusal is correct, but it is driven by the clock, not by a commit. validate
// only ran when a pull request or push touched its paths, so the lapse stayed
// hidden for weeks until an unrelated PR went red.
//
// This check reads the committed v2 handoff snapshot for the locked producer
// revision and reports the earliest `visualEvidence.expiresAt` across its
// qualified journeys. It fails when that instant is less than the horizon away
// (PRODUCER_EVIDENCE_HORIZON_DAYS, default 3). validate.yml runs it daily on a
// schedule, so trunk goes red days before the gallery admission would, while
// there is still time to re-pin scripts/lib/sdk-producer-lock.mjs.
//
// It does not change admission. It never extends a window or skips a journey.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SDK_PRODUCER_LOCK } from "./lib/sdk-producer-lock.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = path.join(REPO_ROOT, "config", "sdkjs-handoff.v2.snapshot.json");
const SNAPSHOT_META_PATH = path.join(REPO_ROOT, "config", "sdkjs-handoff.v2.snapshot.meta.json");
const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_HORIZON_DAYS = 3;

/** Earliest evidence expiry across qualified journeys, or an error string. */
export function earliestEvidenceExpiry(handoff) {
  const journeys = Array.isArray(handoff?.qualifiedJourneys) ? handoff.qualifiedJourneys : [];
  if (journeys.length === 0) return { error: "handoff declares no qualified journeys" };
  let earliest = null;
  for (const journey of journeys) {
    const expiresAt = Date.parse(journey?.visualEvidence?.expiresAt ?? "");
    if (!Number.isFinite(expiresAt)) {
      return { error: `qualified journey ${JSON.stringify(journey?.journeyId)} has no parseable visualEvidence.expiresAt` };
    }
    if (earliest === null || expiresAt < earliest.expiresAt) earliest = { journeyId: journey.journeyId, expiresAt };
  }
  return earliest;
}

/** Judge one handoff against a clock and a horizon. */
export function judgeEvidenceHorizon(handoff, { now = new Date(), horizonDays = DEFAULT_HORIZON_DAYS } = {}) {
  if (!Number.isFinite(horizonDays) || horizonDays < 0) {
    return { ok: false, message: `horizon must be a non-negative number of days; received ${horizonDays}` };
  }
  const earliest = earliestEvidenceExpiry(handoff);
  if (earliest.error) return { ok: false, message: earliest.error };
  const remainingMs = earliest.expiresAt - now.getTime();
  const remainingDays = remainingMs / DAY_MS;
  const expiresIso = new Date(earliest.expiresAt).toISOString();
  const summary =
    `earliest qualified-journey evidence ("${earliest.journeyId}") expires ${expiresIso}; ` +
    `${remainingDays.toFixed(1)} day(s) from ${now.toISOString()}; horizon ${horizonDays} day(s)`;
  if (remainingMs <= 0) return { ok: false, expired: true, remainingDays, message: `expired: ${summary}` };
  if (remainingMs < horizonDays * DAY_MS) return { ok: false, expired: false, remainingDays, message: `inside horizon: ${summary}` };
  return { ok: true, remainingDays, message: summary };
}

export async function main({ env = process.env, now = new Date() } = {}) {
  const meta = JSON.parse(await readFile(SNAPSHOT_META_PATH, "utf8"));
  if (meta.handoffSourceUrl !== SDK_PRODUCER_LOCK.urls.handoffV2) {
    console.error(
      `config/sdkjs-handoff.v2.snapshot.json was fetched from ${meta.handoffSourceUrl}, ` +
        `not the locked ${SDK_PRODUCER_LOCK.urls.handoffV2}. Refresh the snapshot with node scripts/build-gallery.mjs.`,
    );
    return 1;
  }
  const handoff = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
  const horizonDays = env.PRODUCER_EVIDENCE_HORIZON_DAYS === undefined || env.PRODUCER_EVIDENCE_HORIZON_DAYS === ""
    ? DEFAULT_HORIZON_DAYS
    : Number(env.PRODUCER_EVIDENCE_HORIZON_DAYS);
  const verdict = judgeEvidenceHorizon(handoff, { now, horizonDays });
  console.log(`producer ${SDK_PRODUCER_LOCK.repository}@${SDK_PRODUCER_LOCK.revision}: ${verdict.message}`);
  if (verdict.ok) return 0;
  console.error(
    "\nRe-pin scripts/lib/sdk-producer-lock.mjs to a honua-sdk-js revision whose handoff carries current\n" +
      "visual evidence, re-vendor the bundle assets, and refresh the committed snapshots (see #57).\n" +
      "Do not extend an evidence window or relax admission to make this pass.",
  );
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main();
}
