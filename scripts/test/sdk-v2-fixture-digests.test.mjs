import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateSdkFixtureReceipts } from "../lib/sdk-fixture-receipts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const receipt = JSON.parse(await readFile(path.join(root, "audits", "sdk-v2-fixture-receipts.v1.json"), "utf8"));

test("hashes immutable producer fixture bytes and independently regenerates coverage PNG", async () => {
  await validateSdkFixtureReceipts(receipt, { root });
});

test("rejects a mutated producer fixture byte", async () => {
  const target = receipt.claims["columnar-query-quickstart"].localPath;
  await assert.rejects(
    validateSdkFixtureReceipts(receipt, {
      root,
      readFileFn: async (file) => {
        const bytes = Buffer.from(await readFile(file));
        if (path.normalize(file).endsWith(path.normalize(target))) bytes[0] ^= 0xff;
        return bytes;
      },
    }),
    /SHA-256 mismatch/,
  );
});
