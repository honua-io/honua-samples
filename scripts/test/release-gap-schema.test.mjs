import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("../../schemas/release-gap-register.v1.schema.json", import.meta.url);

test("gap issue provenance is an exclusive schema-level choice", async () => {
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  const gapDefinition = schema.properties.gaps.items;

  assert.equal(gapDefinition.properties.oneOf, undefined);
  assert.deepEqual(gapDefinition.oneOf, [
    {
      required: ["existingIssue"],
      not: { required: ["issueNeeded"] },
    },
    {
      required: ["issueNeeded"],
      not: { required: ["existingIssue"] },
    },
  ]);
});
