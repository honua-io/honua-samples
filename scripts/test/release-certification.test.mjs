import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGapRegister,
  loadCertification,
  renderMatrix,
  validateCertification,
  validateDossier,
} from "../release-certification.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AS_OF = Date.parse("2026-08-08T00:00:00Z");

test("seeded release certification is structurally valid and conservatively decided", () => {
  const certification = loadCertification(ROOT);
  const result = validateCertification(certification, { root: ROOT, asOf: AS_OF });
  assert.deepEqual(result.errors, []);
  assert.equal(result.results.length, 10);
  assert.equal(result.results.filter((entry) => entry.computedDecision === "blocked").length, 7);
  assert.equal(result.results.filter((entry) => entry.computedDecision === "conditional").length, 3);
  assert.equal(result.results.find((entry) => entry.dossier.capabilityKey === "raster.multidim-coverage").computedDecision, "conditional");
});

test("a GA claim cannot pass without fresh complete evidence and signoffs", () => {
  const certification = loadCertification(ROOT);
  const base = structuredClone(certification.audits.find((entry) => entry.value.auditId === "feature-query-first-map").value);
  base.claim.gaClaim = true;
  base.decision = "pass";
  const keySet = new Set(certification.audits.map((entry) => entry.value.capabilityKey));
  const gapMap = new Map(certification.gaps.gaps.map((gap) => [gap.id, gap]));
  const result = validateDossier(base, { asOf: AS_OF, gapMap, keySet, file: "mutated-first-map.json" });
  assert.ok(result.errors.some((error) => error.includes("computed blocked")));
  assert.ok(result.errors.some((error) => error.includes("lacks fresh complete evidence")));
});

test("gap ordering and generated matrix are deterministic", () => {
  const certification = loadCertification(ROOT);
  const first = buildGapRegister(certification.audits, certification.gaps);
  const second = buildGapRegister(certification.audits, certification.gaps);
  assert.deepEqual(first, second);
  assert.equal(first.gaps[0].severity, "P0");
  assert.equal(renderMatrix(certification.audits, first), renderMatrix(certification.audits, second));
});
