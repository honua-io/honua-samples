import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skipped = new Set(["node_modules", "vendor", ".git"]);

async function lockfiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await lockfiles(full)));
    else if (entry.name === "package-lock.json") found.push(full);
  }
  return found;
}

test("sample installs fetch only pinned Honua packages", async () => {
  const files = await lockfiles(root);
  assert.ok(files.length >= 7);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const relative = path.relative(root, file);
    assert.equal(text.includes("sdk-esri-compat-"), false, relative);
    assert.equal(text.includes("honua-migrate-"), false, relative);
    assert.equal(text.includes("/sdk-0.2."), false, relative);
  }
});
