import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { adminFetch } from "../lib/admin-api.mjs";
import { cleanRows } from "../state-local/clean.mjs";
import { stageSnapshot } from "../state-local/import.mjs";
import { fetchSnapshot, readSnapshot } from "../state-local/snapshot.mjs";
import { getSource } from "../state-local/sources.mjs";

const metadata = { licenseId: "CC0_10", rowsUpdatedAt: 100, viewLastModified: 90 };
const point = [-90.08, 29.95];
const row = (id) => ({ ":id": `row-${id}`, objectid: String(id), gisid: `CB-${id}`,
  the_geom: { type: "Point", coordinates: point }, owner: "EXCLUDE", description: "EXCLUDE" });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

async function directory(t) {
  const value = await mkdtemp(path.join(os.tmpdir(), "honua-state-local-"));
  t.after(() => rm(value, { recursive: true, force: true }));
  return value;
}

function sourceFetch(t, records = [row(1)]) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    requests.push(url);
    if (url.pathname.startsWith("/api/views/")) return response(metadata);
    const offset = Number(url.searchParams.get("$offset"));
    return response(records.slice(offset, offset + 1000));
  });
  return requests;
}

test("cleaning retains only allowlisted properties and rejects unusable geometry", () => {
  const invalid = [null, [], [0, 0], [-90.08, null], ["", 29.95], [-91, 30], [-90.08, 29.95, 0]];
  const records = invalid.map((coordinates, id) => ({ ...row(id), the_geom: { type: "Point", coordinates } }));
  records.push({ ...row("good"), the_geom: { type: "Point", coordinates: point.map(String) } });
  const cleaned = cleanRows(records, getSource("basins"));
  assert.equal(cleaned.rejected, invalid.length);
  assert.deepEqual(cleaned.geojson.features, [{ type: "Feature", id: "row-good",
    geometry: { type: "Point", coordinates: point }, properties: { objectid: "good", gisid: "CB-good" } }]);
});

test("geometry validation rejects open rings, wrong nesting and unsupported types", () => {
  const ring = [[-90.08, 29.95], [-90.07, 29.95], [-90.07, 29.96], [-90.08, 29.95]];
  const geometries = [{ type: "Polygon", coordinates: [ring] },
    { type: "Polygon", coordinates: [ring.slice(0, -1)] },
    { type: "Polygon", coordinates: point }, { type: "LineString", coordinates: [point] },
    { type: "GeometryCollection", geometries: [] }, { type: "toString", coordinates: point }];
  const cleaned = cleanRows(geometries.map((the_geom, id) => ({ ...row(id), the_geom })), getSource("basins"));
  assert.equal(cleaned.rejected, 5);
  assert.deepEqual(cleaned.geojson.features[0].geometry.coordinates, [ring]);
  assert.throws(() => getSource("__proto__"), /Unknown source/);
});

test("preview pagination records source IDs, hashes, revision and explicit incomplete coverage", async (t) => {
  const output = await directory(t);
  const requests = sourceFetch(t, Array.from({ length: 6000 }, (_, id) => row(id)));
  const receipt = await fetchSnapshot("basins", output);
  assert.equal(receipt.downloaded, 5000);
  assert.equal(receipt.selection.completeDataset, false);
  assert.deepEqual(requests.filter((url) => url.pathname.includes("resource")).map((url) => url.searchParams.get("$offset")),
    ["0", "1000", "2000", "3000", "4000"]);
  assert.ok(requests.every((url) => !url.searchParams.get("$select")?.includes("owner")));
  const snapshot = await readSnapshot("basins", output);
  assert.equal(snapshot.geojson.features.length, 5000);
  assert.equal(snapshot.geojson.features[4999].id, "row-4999");
});

test("snapshot validation detects changed records, metadata and receipt provenance", async (t) => {
  const output = await directory(t);
  sourceFetch(t);
  await fetchSnapshot("basins", output);
  for (const suffix of ["raw.json", "geojson", "metadata.json"]) {
    const file = path.join(output, `basins.${suffix}`);
    const original = await readFile(file, "utf8");
    await writeFile(file, `${original} `);
    await assert.rejects(readSnapshot("basins", output), /checksum mismatch/);
    await writeFile(file, original);
  }
  const file = path.join(output, "basins.receipt.json");
  const receipt = JSON.parse(await readFile(file, "utf8"));
  for (const changed of [{ outputCrs: "EPSG:3857" }, { selection: { ...receipt.selection, completeDataset: true } },
    { licenseUrl: "https://example.test/terms" }, { department: "Wrong" }]) {
    await writeFile(file, JSON.stringify({ ...receipt, ...changed }));
    await assert.rejects(readSnapshot("basins", output), /provenance mismatch/);
  }
});

test("changed licence, source revision and duplicate IDs fail closed", async (t) => {
  const output = await directory(t);
  t.mock.method(globalThis, "fetch", async () => response({ ...metadata, licenseId: "CC-BY" }));
  await assert.rejects(fetchSnapshot("basins", output), /license changed/);
  let metadataCalls = 0;
  globalThis.fetch = async (input) => new URL(input).pathname.startsWith("/api/views/")
    ? response({ ...metadata, rowsUpdatedAt: ++metadataCalls }) : response([row(1)]);
  await assert.rejects(fetchSnapshot("basins", output), /changed during pagination/);
  globalThis.fetch = async (input) => new URL(input).pathname.startsWith("/api/views/")
    ? response(metadata) : response([row(1), row(1)]);
  await assert.rejects(fetchSnapshot("basins", output), /duplicate row IDs/);
});

test("stage uses multipart import, preserves governance and creates a disabled department layer", async (t) => {
  const output = await directory(t);
  sourceFetch(t);
  const receipt = await fetchSnapshot("basins", output);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/import/upload")) {
      assert.ok(options.body instanceof FormData);
      assert.equal(JSON.parse(await options.body.get("file").text()).features.length, 1);
      return response({ featureCount: 1, physicalTableName: "managed_basins", schema: "honua_data" });
    }
    return response({ success: true, data: { layerId: 7, enabled: false } });
  };
  const result = await stageSnapshot({ baseUrl: "https://server.test", adminApiKey: "test-key" },
    { name: "basins", directory: output, connection: "managed" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers["X-API-Key"], "test-key");
  assert.equal(calls[0].options.headers["Content-Type"], undefined);
  const published = JSON.parse(calls[1].options.body);
  assert.match(published.serviceName, /^Public Works\/basins-/);
  assert.equal(published.enabled, false);
  assert.equal(published.table, "managed_basins");
  assert.equal(published.license, "CC0-1.0");
  assert.match(published.description, new RegExp(receipt.cleanSha256));
  assert.equal(result.layerId, 7);
  assert.equal(result.enabled, false);
});

test("stage rejects missing connection and unexpected upload count before publication", async (t) => {
  const output = await directory(t);
  sourceFetch(t);
  await fetchSnapshot("basins", output);
  const env = { baseUrl: "https://server.test", adminApiKey: "test-key" };
  await assert.rejects(stageSnapshot(env, { name: "basins", directory: output }), /HONUA_SAMPLE_CONNECTION/);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response({ featureCount: 2, physicalTableName: "wrong" }); };
  await assert.rejects(stageSnapshot(env, { name: "basins", directory: output, connection: "managed" }), /feature count/);
  assert.equal(calls, 1);
});

test("shared admin API rejects HTTP and application errors", async (t) => {
  const env = { baseUrl: "https://server.test", adminApiKey: "test-key" };
  t.mock.method(globalThis, "fetch", async () => response({ success: false }, 200));
  await assert.rejects(adminFetch(env, { method: "GET", apiPath: "/test" }), /HTTP 200/);
  globalThis.fetch = async () => response({ error: "unavailable" }, 503);
  await assert.rejects(adminFetch(env, { method: "GET", apiPath: "/test" }), /HTTP 503/);
});

test("stage follows completed async publication and rejects failed or enabled results", async (t) => {
  const output = await directory(t);
  sourceFetch(t);
  await fetchSnapshot("basins", output);
  const env = { baseUrl: "https://server.test", adminApiKey: "test-key" };
  const options = { name: "basins", directory: output, connection: "managed/id" };
  let status = "Completed";
  let enabled = false;
  const paths = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    paths.push(url.pathname);
    if (url.pathname.endsWith("/import/upload")) return response({ featureCount: 1, physicalTableName: "basins" });
    if (url.pathname.endsWith("/jobs/job-id")) return response({ data: { status, layerId: 19 } });
    if (url.searchParams.has("serviceName")) return response({ data: [{ layerId: 19, enabled }] });
    return response({ data: { jobId: "job-id" } }, 202);
  };
  assert.equal((await stageSnapshot(env, options)).layerId, 19);
  assert.ok(paths.includes("/api/v1/admin/connections/managed%2Fid/layers/jobs/job-id"));
  status = "Failed";
  await assert.rejects(stageSnapshot(env, options), /publication failed/);
  status = "Completed";
  enabled = true;
  await assert.rejects(stageSnapshot(env, options), /disabled layer/);
});
