import assert from "node:assert/strict";
import test from "node:test";
import { assertDefaultImportGeometry } from "../state-local/import-geometry.mjs";
import { uploadSnapshotTable } from "../state-local/import.mjs";

const ring = [[-156.5, 20.8], [-156.49, 20.8], [-156.49, 20.81], [-156.5, 20.8]];
const collection = (geometry) => ({ type: "FeatureCollection", features: [{
  type: "Feature", id: "source-2826", geometry, properties: {},
}] });

test("default import budget includes closing vertices and accepts the exact vertex boundary", () => {
  const coordinates = Array.from({ length: 10_000 }, () => ring[0]);
  assert.doesNotThrow(() => assertDefaultImportGeometry(collection({ type: "Polygon", coordinates: [coordinates] })));
  coordinates.push(ring[0]);
  assert.throws(() => assertDefaultImportGeometry(collection({ type: "Polygon", coordinates: [coordinates] })),
    /Source feature source-2826.*10001 vertices \(maximum 10000\)/);
});

test("default import budget counts exterior and interior rings across all polygon parts", () => {
  const coordinates = Array.from({ length: 50 }, () => [ring, ring]);
  assert.doesNotThrow(() => assertDefaultImportGeometry(collection({ type: "MultiPolygon", coordinates })));
  coordinates.push([ring]);
  assert.throws(() => assertDefaultImportGeometry(collection({ type: "MultiPolygon", coordinates })), /101 rings/);
});

test("oversized upload fails before transmitting data or making a server mutation", async (t) => {
  t.mock.method(globalThis, "fetch", () => { assert.fail("oversized geometry must not reach the server"); });
  const geojson = collection({ type: "Polygon", coordinates: Array.from({ length: 101 }, () => ring) });
  await assert.rejects(uploadSnapshotTable({ baseUrl: "https://server.test" }, { tableName: "demo_test", geojson }),
    /default import geometry limits/);
});
