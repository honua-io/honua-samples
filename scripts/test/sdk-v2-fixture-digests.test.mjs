import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const audit = JSON.parse(
  await readFile(new URL("../../audits/sdk-v2-capability-refresh.v1.json", import.meta.url), "utf8"),
);

function collectSampleReceipts(value, result = new Map()) {
  if (!value || typeof value !== "object") return result;
  if (typeof value.sampleId === "string" && typeof value.sha256 === "string") {
    result.set(value.sampleId, value);
  }
  for (const child of Object.values(value)) collectSampleReceipts(child, result);
  return result;
}

test("locks the admitted fixture artifacts to their governed SHA-256 digests", () => {
  const receipts = collectSampleReceipts(audit);
  assert.equal(
    receipts.get("imagery-cog-quickstart")?.sha256,
    "59ba6110a96c0aba2ab5f5ee27b0eed6ec436956df27bb6312b94573f35190bd",
  );
  assert.equal(
    receipts.get("columnar-query-quickstart")?.sha256,
    "c5d9c789171970b19ca9c54d5eda97f045f28adf66324f949c14813e8f90d001",
  );
  assert.equal(
    receipts.get("coverages-wcs-basic")?.sha256,
    "8c7b5b3f8bd31bca2df07c4a70254d75e70d63838c2f77e033def3c1b8d2acff",
  );
});
