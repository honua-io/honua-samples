import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { adminFetch } from "../lib/admin-api.mjs";
import { cleanRows } from "../state-local/clean.mjs";
import { stageSnapshot } from "../state-local/import.mjs";
import { activateDeployment, readDeployment, saveDeployment } from "../state-local/deployment.mjs";
import { fetchSnapshot, readSnapshot } from "../state-local/snapshot.mjs";
import { getSource, sources } from "../state-local/sources.mjs";

const metadata = { licenseId: "CC0_10", rowsUpdatedAt: 100, viewLastModified: 90 };
const point = [-90.08, 29.95];
const row = (id) => ({ ":id": `row-${id}`, objectid: String(id), gisid: `CB-${id}`,
  the_geom: { type: "Point", coordinates: point }, owner: "EXCLUDE", description: "EXCLUDE" });
const folders = () => response({ data: [{ metadata: { id: "works-folder", title: "Public Works" } }] });
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

async function deploymentFixture(t) {
  const output = await directory(t);
  sourceFetch(t);
  const receipt = await fetchSnapshot("basins", output);
  const env = { baseUrl: "https://server.test", adminApiKey: "test-key" };
  const staged = { source: "basins", serviceName: "basins-test", folderId: "works-folder",
    layerId: 7, enabled: false, schema: "honua_data", table: "managed_basins", cleanSha256: receipt.cleanSha256 };
  const state = { layer: { ...staged, description: `SHA-256 ${receipt.cleanSha256}` }, folderId: staged.folderId, writes: 0, policyWrites: 0, policy: { allowAnonymous: true, allowAnonymousWrite: true }, publicId: 7, publicStatus: 200, folderName: "public-works", publicName: "public-basins", serviceMissing: false };
  globalThis.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/FeatureServer")) {
      assert.equal(options, undefined, "public request must not carry admin credentials");
      return response({ layers: [{ id: 7, name: "basins" }] }, state.publicStatus);
    }
    if (url.pathname.includes("/FeatureServer/")) {
      assert.equal(options, undefined, "public request must not carry admin credentials");
      return response({ id: state.publicId }, state.publicStatus);
    }
    if (url.pathname.endsWith("/settings")) return response({ data: { accessPolicy: state.policy } });
    if (url.pathname.endsWith("/access-policy")) {
      assert.deepEqual(JSON.parse(options.body), { allowAnonymous: true, allowAnonymousWrite: false });
      state.policy = JSON.parse(options.body);
      state.policyWrites++;
      return response({ data: { accessPolicy: state.policy } });
    }
    if (url.pathname.endsWith("/enabled")) {
      assert.equal(url.pathname, "/api/v1/admin/connections/managed/layers/7/enabled");
      assert.equal(url.searchParams.get("serviceName"), staged.serviceName);
      assert.deepEqual(state.policy, { allowAnonymous: true, allowAnonymousWrite: false }, "deny anonymous writes before enabling");
      assert.equal(options.method, "PUT");
      assert.deepEqual(JSON.parse(options.body), { enabled: true });
      state.layer.enabled = true;
      state.writes++;
      return response({ data: state.layer });
    }
    if (url.pathname.endsWith("/services/")) return response({ data: { items: state.serviceMissing ? [] : [{ serviceName: staged.serviceName, folderId: state.folderId, folderName: state.folderName, publicName: state.publicName }] } });
    return response({ data: { items: [state.layer] } });
  };
  return { output, env, staged, state };
}

test("deployment activation rechecks table, snapshot, service and department before enabling, and is repeatable", async (t) => {
  const { output, env, staged, state } = await deploymentFixture(t);
  const saved = await saveDeployment(env, { staged, directory: output, connection: "managed" });
  assert.equal(saved.baseUrl, env.baseUrl);
  assert.equal(JSON.stringify(saved).includes(env.adminApiKey), false);
  const options = { name: "basins", directory: output };
  const active = await activateDeployment(env, options);
  assert.equal(active.layerUrl, "https://server.test/rest/services/public-works/public-basins/FeatureServer/7");
  assert.equal(active.serviceLayerIndex, 7);
  assert.equal(active.enabled, true);
  await activateDeployment(env, options);
  assert.equal(state.writes, 1);
  assert.equal(state.policyWrites, 1);
  assert.deepEqual(state.policy, { allowAnonymous: true, allowAnonymousWrite: false });
  await assert.rejects(saveDeployment(env, { staged, directory: output, connection: "managed" }), /remain disabled/);
});

test("deployment activation refuses drift and server changes without enabling anything", async (t) => {
  const { output, env, staged, state } = await deploymentFixture(t);
  await saveDeployment(env, { staged, directory: output, connection: "managed" });
  const options = { name: "basins", directory: output };
  await assert.rejects(readDeployment({ ...env, baseUrl: "https://other.test" }, options), /this server/);
  for (const changes of [{ table: "other_table" }, { schema: "other_schema" },
    { description: "SHA-256 changed" }, { serviceName: "other-service" }, { layerId: 8 }]) {
    const original = { ...state.layer };
    Object.assign(state.layer, changes);
    await assert.rejects(activateDeployment(env, options), /no longer matches/);
    state.layer = original;
  }
  state.folderId = "other-folder";
  await assert.rejects(activateDeployment(env, options), /department folder/);
  assert.equal(state.writes, 0);
  assert.equal(state.policyWrites, 0);
});

test("deployment rejects inaccessible public routes and missing department paths", async (t) => {
  const { output, env, staged, state } = await deploymentFixture(t);
  await saveDeployment(env, { staged, directory: output, connection: "managed" });
  const options = { name: "basins", directory: output };
  for (const field of ["folderName", "publicName", "serviceMissing"]) {
    const original = state[field];
    state[field] = field === "serviceMissing" ? true : "";
    await assert.rejects(activateDeployment(env, options), /department/);
    state[field] = original;
  }
  assert.equal(state.writes + state.policyWrites, 0);
  state.publicStatus = 403;
  await assert.rejects(activateDeployment(env, options), /Anonymous public layer/);
  state.publicStatus = 200;
  state.publicId = 8;
  await assert.rejects(activateDeployment(env, options), /Anonymous public layer/);
  const file = path.join(output, "basins.deployment.json");
  const receipt = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, JSON.stringify({ ...receipt, cleanSha256: "changed" }));
  await assert.rejects(readDeployment(env, options), /this server and snapshot/);
});

test("cleaning retains only allowlisted properties and rejects unusable geometry", () => {
  const invalid = [null, [], [[-90.08], [29.95]], [{ valueOf: () => -90.08 }, 29.95], [0, 0], [-90.08, null], ["", 29.95], [-91, 30], [-90.08, 29.95, 0]];
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
    { licenseUrl: "https://example.test/terms" }, { department: "Wrong" }, { metadataUrl: "https://example.test" },
    { requests: ["https://example.test"] }, { retrievedAt: "not a date" }]) {
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
    if (url.endsWith("/folders")) return folders();
    if (url.endsWith("/import/upload")) {
      assert.ok(options.body instanceof FormData);
      assert.equal(JSON.parse(await options.body.get("file").text()).features.length, 1);
      return response({ featureCount: 1, physicalTableName: "managed_basins", schema: "honua_data" });
    }
    return response({ success: true, data: { layerId: 7, enabled: false } });
  };
  const result = await stageSnapshot({ baseUrl: "https://server.test", adminApiKey: "test-key" },
    { name: "basins", directory: output, connection: "managed" });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].options.headers["X-API-Key"], "test-key");
  assert.equal(calls[1].options.headers["Content-Type"], undefined);
  const published = JSON.parse(calls[2].options.body);
  assert.match(published.serviceName, /^basins-/);
  assert.equal(published.enabled, false);
  assert.equal(published.folderId, "works-folder");
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
  globalThis.fetch = async (url) => { if (url.endsWith("/folders")) return folders(); calls++; return response({ featureCount: 2, physicalTableName: "wrong" }); };
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
    if (url.pathname.endsWith("/folders")) return folders();
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


test("all geometry readers minimise fields and reject invalid 311 coordinates", () => {
  const privateFields = { owner: "omit", applicant: "omit", contractors: "omit", description: "omit", comments: "omit" };
  for (const [name, coordinates] of [["permits", { location_1: { longitude: "-90.08", latitude: "29.95" } }],
    ["requests", { longitude: "-90.08", latitude: "29.95" }], ["cleanings", { x: "-90.08", y: "29.95" }]]) {
    const cleaned = cleanRows([{ ...privateFields, ...coordinates, ":id": "safe" }], getSource(name));
    assert.deepEqual(cleaned.geojson.features[0].geometry.coordinates, point);
    assert.deepEqual(cleaned.geojson.features[0].properties, {});
  }
  assert.equal(cleanRows([{ longitude: 0, latitude: 0 }], getSource("requests")).rejected, 1);
  assert.ok(Object.values(sources).every((source) => source.fields.every((field) => !/owner|applicant|contractor|description|comment/i.test(field))));
});

test("policy source stages without inventing a CC0 licence", async (t) => {
  const output = await directory(t);
  t.mock.method(globalThis, "fetch", async (input) => new URL(input).pathname.startsWith("/api/views/")
    ? response({ ...metadata, licenseId: undefined }) : response([{ ":id": "cleaning-1", x: point[0], y: point[1] }]));
  await fetchSnapshot("cleanings", output);
  globalThis.fetch = async (input, options) => {
    if (input.endsWith("/folders")) return folders();
    if (input.endsWith("/import/upload")) return response({ featureCount: 1, physicalTableName: "cleanings" });
    const body = JSON.parse(options.body);
    assert.equal(body.license, undefined);
    assert.match(body.licenseUrl, /No-AA135-Data-Policy/);
    return response({ data: { layerId: 20, enabled: false } });
  };
  await stageSnapshot({ baseUrl: "https://server.test", adminApiKey: "test-key" },
    { name: "cleanings", directory: output, connection: "managed" });
});

test("background upload polls terminal state and never guesses a physical table", async (t) => {
  const output = await directory(t);
  sourceFetch(t);
  await fetchSnapshot("basins", output);
  const env = { baseUrl: "https://server.test", adminApiKey: "test-key" };
  const options = { name: "basins", directory: output, connection: "managed" };
  for (const status of [2, 3, 4]) {
    const paths = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/folders")) return folders();
    paths.push(url.pathname);
      return url.pathname.endsWith("/upload") ? response({ jobId: "upload-job", statusUrl: "https://untrusted.test" }, 202)
        : response({ jobId: "upload-job", status, tableName: "logical-name", featuresProcessed: 1 });
    };
    await assert.rejects(stageSnapshot(env, options), status === 2 ? /physical table receipt/ : /import failed or cancelled/i);
    assert.deepEqual(paths, ["/api/v1/admin/import/upload", "/api/v1/admin/import/jobs/upload-job"]);
  }
});


test("staging requires exactly one department folder before uploading", async (t) => {
  const output = await directory(t);
  sourceFetch(t);
  await fetchSnapshot("basins", output);
  const env = { baseUrl: "https://server.test", adminApiKey: "test-key" };
  for (const data of [[], [{ metadata: { id: "other", title: "Planning" } }],
    [1, 2].map((id) => ({ metadata: { id: String(id), title: "Public Works" } }))]) {
    globalThis.fetch = async (url) => {
      assert.ok(url.endsWith("/folders"), "must stop before upload");
      return response({ data });
    };
    await assert.rejects(stageSnapshot(env, { name: "basins", directory: output, connection: "managed" }), /exactly one.*Public Works/);
  }
});
