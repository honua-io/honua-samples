import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { portableSourceUrl, writeSnapshotIfChanged } from "../lib/snapshot-file.mjs";

test("a file URL inside the repository is recorded relative to it", () => {
  const root = path.resolve("/work/samples");
  const inside = pathToFileURL(path.join(root, "vendor", "pin", "manifest.json")).href;
  assert.equal(portableSourceUrl(inside, root), "vendor/pin/manifest.json");
});

test("remote URLs and files outside the repository are kept as given", () => {
  const root = path.resolve("/work/samples");
  const outside = pathToFileURL(path.resolve("/elsewhere/manifest.json")).href;
  assert.equal(portableSourceUrl("https://example.org/a.json", root), "https://example.org/a.json");
  assert.equal(portableSourceUrl(outside, root), outside);
});

test("an unchanged snapshot keeps its file and fetch time", async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "snapshot-")), "s.json");
  const committed = JSON.stringify({ sourceUrl: "a", fetchedAt: "2026-11-03T00:00:00.000Z", catalog: { n: 1 } }, null, 2) + "\n";
  await writeFile(file, committed);
  const written = await writeSnapshotIfChanged(file, { sourceUrl: "a", fetchedAt: null, catalog: { n: 1 } });
  assert.equal(written, false);
  assert.equal(await readFile(file, "utf8"), committed);
});

test("changed content is written with a new fetch time in the same key order", async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "snapshot-")), "s.json");
  await writeFile(file, JSON.stringify({ sourceUrl: "a", fetchedAt: "2026-11-03T00:00:00.000Z", catalog: { n: 1 } }));
  assert.equal(await writeSnapshotIfChanged(file, { sourceUrl: "a", fetchedAt: null, catalog: { n: 2 } }), true);
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(Object.keys(saved), ["sourceUrl", "fetchedAt", "catalog"]);
  assert.notEqual(saved.fetchedAt, "2026-11-03T00:00:00.000Z");
  assert.deepEqual(saved.catalog, { n: 2 });
});
