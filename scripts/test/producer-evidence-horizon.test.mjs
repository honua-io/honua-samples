import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { earliestEvidenceExpiry, judgeEvidenceHorizon } from "../check-producer-evidence-horizon.mjs";

const handoff = (...expiries) => ({
  qualifiedJourneys: expiries.map((expiresAt, index) => ({ journeyId: `j${index}`, visualEvidence: { expiresAt } })),
});

test("earliest expiry is the minimum across qualified journeys", () => {
  const earliest = earliestEvidenceExpiry(handoff("2026-10-28T00:00:00Z", "2026-10-25T12:00:00Z", "2026-10-30T00:00:00Z"));
  assert.equal(earliest.journeyId, "j1");
  assert.equal(new Date(earliest.expiresAt).toISOString(), "2026-10-25T12:00:00.000Z");
});

test("a handoff with no journeys or an unparseable window fails closed", () => {
  assert.equal(judgeEvidenceHorizon({ qualifiedJourneys: [] }).ok, false);
  assert.equal(judgeEvidenceHorizon(handoff("not-a-date")).ok, false);
});

test("passes outside the horizon, fails inside it, and fails once expired", () => {
  const pair = handoff("2026-10-28T08:00:00Z");
  assert.equal(judgeEvidenceHorizon(pair, { now: new Date("2026-10-21T08:00:00Z"), horizonDays: 3 }).ok, true);
  const inside = judgeEvidenceHorizon(pair, { now: new Date("2026-10-26T08:00:00Z"), horizonDays: 3 });
  assert.equal(inside.ok, false);
  assert.equal(inside.expired, false);
  const expired = judgeEvidenceHorizon(pair, { now: new Date("2026-10-28T08:00:00Z"), horizonDays: 3 });
  assert.equal(expired.ok, false);
  assert.equal(expired.expired, true);
});

test("a negative or non-numeric horizon is rejected", () => {
  assert.equal(judgeEvidenceHorizon(handoff("2026-10-28T08:00:00Z"), { horizonDays: -1 }).ok, false);
  assert.equal(judgeEvidenceHorizon(handoff("2026-10-28T08:00:00Z"), { horizonDays: Number.NaN }).ok, false);
});

test("the committed snapshot for the locked producer has a parseable evidence window", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../../config/sdkjs-handoff.v2.snapshot.json", import.meta.url), "utf8"));
  const earliest = earliestEvidenceExpiry(snapshot);
  assert.equal(earliest.error, undefined);
  assert.ok(Number.isFinite(earliest.expiresAt));
});
