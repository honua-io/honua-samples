#!/usr/bin/env node

const BASE_URL = process.env.HONUA_BASE_URL ?? "https://demo.honua.io";

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`GET ${path} failed: ${JSON.stringify(body.error ?? body)}`);
  }
  return body;
}

async function main() {
  const layerPage = await getJson("/odata/Layers?$top=1");
  const layer = layerPage.value?.[0];
  if (!layer) throw new Error("The OData service returned no layers");

  const page = await getJson(
    `/odata/Layers(${layer.Id})/Features?$top=3&$count=true`,
  );
  const features = page.value ?? [];
  if (features.length === 0 || features.some((feature) => !feature.Geometry)) {
    throw new Error("Expected at least one spatial feature");
  }

  console.log(
    `PASS: ${layer.Name} has ${page["@odata.count"]} feature(s); read ${features.length} with geometry`,
  );
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
