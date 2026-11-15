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
