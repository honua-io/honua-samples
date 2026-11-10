import assert from "node:assert/strict";
import test from "node:test";
import { buildMcpJourney } from "../state-local/mcp-journey.mjs";

function deployment(source, layerId = 7) {
  return { source, layerId, enabled: true, cleanSha256: "a".repeat(64), baseUrl: "https://server.test",
    layerUrl: `https://server.test/rest/services/Public%20Works/public-source/FeatureServer/${layerId}`,
    adminApiKey: "PRIVATE-KEY", connection: "PRIVATE-CONNECTION", schema: "PRIVATE-SCHEMA", table: "PRIVATE-TABLE",
    serviceName: "PRIVATE-INTERNAL-SERVICE" };
}

test("MCP setup uses verified public department paths without serializing private receipt fields", () => {
  const result = buildMcpJourney("311", [deployment("maui-demo-requests")]);
  assert.equal(result.sources[0].reference, "geoservices-feature-service:Public Works/public-source/7");
  assert.equal(result.sources[0].license, "CC0-1.0");
  assert.ok(result.sources[0].attribution.includes("fictional"));
  assert.equal(JSON.stringify(result).includes("PRIVATE-"), false);
  const client = result.clientConfig.mcpServers.honua;
  assert.deepEqual(client.args, ["-y", "-p", "@honua/sdk-js@0.3.2", "-p", "@honua/mcp-server@0.3.0", "honua-mcp"]);
  assert.deepEqual(client.env, { HONUA_BASE_URL: "https://server.test", HONUA_TRANSPORT: "rest", HONUA_API_KEY: "" });
  assert.match(result.status, /not executed/);
});

test("every exercise question preserves provenance and requires complete paginated counts", () => {
  for (const [scenario, source] of [["311", "maui-demo-requests"], ["emergency", "maui-demo-shelters"], ["public-works", "maui-demo-work-orders"]]) {
    const result = buildMcpJourney(scenario, [deployment(source)]);
    for (const label of ["DEMO DATA", "data_origin=synthetic_demo", "is_demo=true", "exercise_only=true", "paginate completely", "read-only"]) {
      assert.ok(result.prompt.includes(label), `${scenario}: ${label}`);
    }
  }
});

test("property binds both parcels and zoning and keeps permit lookup manual", () => {
  const result = buildMcpJourney("property", [deployment("maui-parcels", 3), deployment("maui-zoning")]);
  assert.deepEqual(result.sources.map((entry) => entry.source), ["maui-parcels", "maui-zoning"]);
  assert.match(result.prompt, /MAPPS manually/);
  assert.match(result.prompt, /Do not invent permits, CPR digits/);
  assert.match(result.prompt, /spatial join.*unavailable.*report the gap/);
});

test("MCP setup refuses missing, duplicate, mismatched and cross-server sources", () => {
  assert.throws(() => buildMcpJourney("constructor", []), /Choose/);
  assert.throws(() => buildMcpJourney("property", [deployment("maui-zoning")]), /scenario sources/);
  assert.throws(() => buildMcpJourney("311", [deployment("maui-roads")]), /scenario sources/);
  assert.throws(() => buildMcpJourney("311", [deployment("maui-demo-requests"), deployment("maui-demo-requests")]), /scenario sources/);
  assert.throws(() => buildMcpJourney("property", [deployment("maui-parcels"), { ...deployment("maui-zoning"), baseUrl: "https://elsewhere.test" }]), /scenario sources/);
});

test("MCP setup rejects credential URLs, unverified activation, mismatched layers and checksums", () => {
  for (const changes of [{ layerUrl: "https://secret:password@server.test/rest/services/a/b/FeatureServer/7" },
    { baseUrl: "https://secret:password@server.test" }, { layerUrl: "https://server.test/rest/services/a/b/FeatureServer/7?key=secret" },
    { layerUrl: "https://elsewhere.test/rest/services/a/b/FeatureServer/7" }, { baseUrl: "https://server.test?key=secret" },
    { layerId: 8 }, { layerId: -1 }, { enabled: false }, { cleanSha256: "unverified" }]) {
    assert.throws(() => buildMcpJourney("311", [{ ...deployment("maui-demo-requests"), ...changes }]), /credential-free public layer/);
  }
});
