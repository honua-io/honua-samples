#!/usr/bin/env node

const BASE_URL = process.env.HONUA_BASE_URL ?? "https://demo.honua.io";
const SERVICE = process.env.HONUA_SAMPLE_SERVICE ?? "maui-buildings";

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`GET ${path} failed: ${JSON.stringify(body.error ?? body)}`);
  }
  return body;
}

async function main() {
  const service = await getJson(`/rest/services/${SERVICE}/FeatureServer?f=json`);
  const layer = service.layers?.[0];
  if (!layer) throw new Error(`Service ${SERVICE} has no queryable layer`);

  const query = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    resultRecordCount: "3",
    returnGeometry: "true",
    f: "json",
  });
  const result = await getJson(
    `/rest/services/${SERVICE}/FeatureServer/${layer.id}/query?${query}`,
  );

  const features = result.features ?? [];
  if (features.length === 0 || features.some((feature) => !feature.geometry)) {
    throw new Error("Expected at least one feature with geometry");
  }

  console.log(
    `PASS: ${SERVICE}/FeatureServer/${layer.id} returned ${features.length} feature(s) with geometry`,
  );
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
