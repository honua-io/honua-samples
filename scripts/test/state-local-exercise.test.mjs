import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { exerciseSources, generateExercise } from "../state-local/exercise.mjs";
import { questions } from "../state-local/mcp-journey.mjs";
import { exerciseTimeline } from "../../shared/state-local/exercise-time.mjs";
import { weeklyTrend } from "../../samples/maui-311/src/records.mjs";

const anchor = {
  geojson: { type: "FeatureCollection", features: [7, 8, 9].map((id) => ({ type: "Feature", id, geometry: { type: "Point", coordinates: [-156.5, 20.9] } })) },
  receipt: { cleanSha256: "a".repeat(64) },
};

async function exerciseRows(name) {
  const directory = await mkdtemp(path.join(tmpdir(), "state-local-exercise-"));
  try {
    await generateExercise({ name, source: exerciseSources[name], anchor, directory });
    return JSON.parse(await readFile(path.join(directory, `${name}.geojson`), "utf8")).features.map((feature) => feature.properties);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function tally(rows, key) {
  return rows.reduce((counts, row) => ({ ...counts, [key(row)]: (counts[key(row)] ?? 0) + 1 }), {});
}

test("SR-01: request category, status and district vary independently (#304)", async () => {
  const rows = await exerciseRows("maui-demo-requests");
  assert.equal(rows.length, 468);
  assert.equal(Object.keys(tally(rows, (row) => `${row.district}|${row.category}|${row.status}`)).length, 27);
  const unresolvedDrainage = rows.filter((row) => row.category === "drainage" && row.status !== "exercise_closed");
  assert.deepEqual(tally(unresolvedDrainage, (row) => row.district), {
    "Demo district 1 (fictional)": 5, "Demo district 2 (fictional)": 4, "Demo district 3 (fictional)": 2,
  });
  assert.deepEqual(tally(unresolvedDrainage.filter((row) => row.status === "exercise_open"), (row) => row.district), {
    "Demo district 1 (fictional)": 4, "Demo district 2 (fictional)": 3, "Demo district 3 (fictional)": 1,
  });
});

test("SR-03: requests open at an even weekly pace and only the recent backlog is unresolved (#305)", async () => {
  const rows = (await exerciseRows("maui-demo-requests")).map((row) => ({ ...row, ...exerciseTimeline(row) }));
  const weekly = weeklyTrend(rows.map((properties) => ({ properties })), rows[0].asOf).map((week) => week.opened);
  assert.ok(Math.max(...weekly) - Math.min(...weekly) <= 3, `weekly intake ${weekly}`);
  const unresolved = rows.filter((row) => row.closed === null);
  const overdueShare = unresolved.filter((row) => row.due < row.asOf).length / unresolved.length;
  assert.ok(overdueShare > 0.4 && overdueShare < 0.75, `overdue share ${overdueShare}`);
  assert.ok(unresolved.every((row) => row.asOf - row.created < 10 * 86_400_000));
  const closed = rows.filter((row) => row.closed !== null);
  const missedShare = closed.filter((row) => row.closed > row.due).length / closed.length;
  assert.ok(missedShare > 0.15 && missedShare < 0.4, `missed SLA share ${missedShare}`);
});

test("other exercise layers keep their recipe-4 attributes", async () => {
  for (const [name, digest] of Object.entries({
    "maui-demo-inspections": "21cd115e40d353ff8ba4ddff7adf2d356751c1be334339f9df6eac84176078ef",
    "maui-demo-work-orders": "07608e53ce4ea6b0c5eafcaf5927fe4ee3cc5cc74ba678db4b85c0a31113d9b8",
    "maui-demo-closures": "23eebf0aa3ba6adfadb33d55b4b362d9169920b9ed629dd27039807ee9adf80c",
    "maui-demo-shelters": "d314d7df603848d01f8a79acdfa706f46e296a8a40b7f53e2ad093ccceb0cef9",
  })) {
    const rows = await exerciseRows(name);
    assert.equal(createHash("sha256").update(JSON.stringify(rows)).digest("hex"), digest, name);
  }
});

test("the 311 page shows the same stock-client question the MCP setup emits (#306)", async () => {
  const page = await readFile(new URL("../../samples/maui-311/index.html", import.meta.url), "utf8");
  assert.ok(page.includes(`“${questions["311"]}”`));
});
