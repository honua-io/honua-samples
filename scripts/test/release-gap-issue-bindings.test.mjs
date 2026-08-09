import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const auditsUrl = new URL("../../audits/", import.meta.url);

function collectBlockers(value, blockers = []) {
  if (!value || typeof value !== "object") return blockers;
  if (typeof value.gapId === "string" && Array.isArray(value.evidenceKinds)) {
    blockers.push(value);
  }
  for (const child of Object.values(value)) collectBlockers(child, blockers);
  return blockers;
}

test("P0 and P1 blockers bind to one canonical audited GitHub issue", async () => {
  const source = JSON.parse(
    await readFile(new URL("release-gaps.v1.json", auditsUrl), "utf8"),
  );
  const gaps = new Map(source.gaps.map((gap) => [gap.id, gap]));
  const requiredGapIds = new Set(
    source.gaps
      .filter((gap) => gap.severity === "P0" || gap.severity === "P1")
      .map((gap) => gap.id),
  );

  for (const gapId of requiredGapIds) {
    const gap = gaps.get(gapId);
    assert.match(gap.existingIssue, /^https:\/\/github\.com\/honua-io\/.+\/(issues|pull)\/\d+$/);
    assert.equal(gap.issueNeeded, undefined);
  }

  const dossierNames = (await readdir(new URL("capabilities/", auditsUrl)))
    .filter((name) => name.endsWith(".json"));
  const seen = new Set();

  for (const name of dossierNames) {
    const dossier = JSON.parse(
      await readFile(new URL(`capabilities/${name}`, auditsUrl), "utf8"),
    );
    for (const blocker of collectBlockers(dossier)) {
      const gap = gaps.get(blocker.gapId);
      assert.ok(gap, `${name} references unknown gap ${blocker.gapId}`);
      assert.equal(blocker.issue, gap.existingIssue, `${name} has stale issue binding`);
      seen.add(blocker.gapId);
    }
  }

  for (const gapId of requiredGapIds) {
    assert.ok(seen.has(gapId), `P0/P1 gap ${gapId} is not bound from a dossier`);
  }
});
