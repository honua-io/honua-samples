import assert from "node:assert/strict";
import test from "node:test";
import { seedFeatureService } from "../browser-verification/harness.mjs";

for (const allowAnonymous of [true, false]) {
  test(`fixture resolves converged public index independently of storage ID; anonymous=${allowAnonymous}`, async (t) => {
    const saved = { ...process.env };
    t.after(() => { process.env = saved; });
    process.env.HONUA_BASE_URL = "https://server.test";
    process.env.HONUA_ADMIN_API_KEY = "test-key";
    process.env.HONUA_SAMPLE_CONNECTION = "test-connection";
    const metadataHeaders = [];
    t.mock.method(globalThis, "fetch", async (input, options) => {
      const url = new URL(input);
      let body = {};
      if (url.pathname.endsWith("/import/upload")) body = { featureCount: 1, physicalTableName: "fixture_table" };
      else if (url.pathname.endsWith("/connections")) body = { data: [{ name: "test-connection" }] };
      else if (url.pathname.endsWith("/layers")) body = { data: { enabled: true, storageLayerId: 73, layerId: 99, layerName: "operations-areas" } };
      else if (url.pathname.endsWith("/FeatureServer")) {
        metadataHeaders.push(options?.headers);
        body = { layers: metadataHeaders.length === 1 ? [] : [{ id: 0, name: "operations-areas" }, { id: 8, name: "other" }] };
      } else if (url.pathname.endsWith("/query")) {
        assert.match(url.pathname, /\/FeatureServer\/0\/query$/);
        body = allowAnonymous || options?.headers?.["X-API-Key"] === "test-key"
          ? { features: [{}] } : { error: { code: 401 } };
      }
      return new Response(JSON.stringify(body));
    });
    const result = await seedFeatureService({ prefix: "test-fixture", allowAnonymous,
      fixture: { geojson: { type: "FeatureCollection", features: [] }, count: 1 } });
    assert.equal(result.layerId, 0);
    assert.equal(result.layerUrl, `${result.serviceUrl}/0`);
    const headers = allowAnonymous ? undefined : { "X-API-Key": "test-key" };
    assert.deepEqual(metadataHeaders, [headers, headers]);
  });
}

const DEPARTMENT_FOLDERS = [["planning", "Planning"], ["public-works", "Public Works"],
  ["emergency-management", "Emergency Management"], ["service-requests", "311"]]
  .map(([id, title]) => ({ deleted: false, metadata: { id, title } }));

function departmentServer(published) {
  return async (input, options) => {
    const url = new URL(input);
    let body = {};
    if (url.pathname.endsWith("/import/upload")) body = { featureCount: 1, physicalTableName: "fixture_table" };
    else if (url.pathname.endsWith("/connections")) body = { data: [{ name: "test-connection" }] };
    else if (url.pathname.endsWith("/admin/folders")) return new Response(JSON.stringify({ data: DEPARTMENT_FOLDERS }), { headers: { etag: '"1"' } });
    else if (url.pathname.endsWith("/layers")) {
      published.push(JSON.parse(options.body));
      body = { data: { enabled: true, storageLayerId: 39, layerName: "operations-areas" } };
    } else if (url.pathname.endsWith("/admin/services/")) {
      body = { data: { items: [{ serviceName: published[0].serviceName, folderId: "service-requests", folderName: "service-requests", publicName: published[0].serviceName }] } };
    } else if (url.pathname.endsWith("/FeatureServer")) body = { layers: [{ id: 0, name: "operations-areas" }] };
    else if (url.pathname.endsWith("/query")) body = { features: [{}] };
    return new Response(JSON.stringify(body));
  };
}

test("department seed publishes into the recipe folder and returns its folder/service public path", async (t) => {
  const saved = { ...process.env };
  t.after(() => { process.env = saved; });
  Object.assign(process.env, { HONUA_BASE_URL: "https://server.test", HONUA_ADMIN_API_KEY: "test-key", HONUA_SAMPLE_CONNECTION: "test-connection" });
  const published = [];
  t.mock.method(globalThis, "fetch", departmentServer(published));
  const result = await seedFeatureService({ prefix: "test-folder", allowAnonymous: true, department: "311",
    fixture: { geojson: { type: "FeatureCollection", features: [] }, count: 1 } });
  assert.equal(published[0].folderId, "service-requests");
  assert.equal(result.servicePath, `service-requests/${result.serviceName}`);
  assert.equal(result.layerUrl, `https://server.test/rest/services/service-requests/${result.serviceName}/FeatureServer/0`);
  await assert.rejects(seedFeatureService({ prefix: "test-folder", allowAnonymous: true, department: "Unknown",
    fixture: { geojson: { type: "FeatureCollection", features: [] }, count: 1 } }), /unknown state-local department/);
});
