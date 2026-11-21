#!/usr/bin/env node

const BASE_URL = process.env.HONUA_BASE_URL ?? "https://demo.honua.io";

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const body = await response.json();
  if (!response.ok) throw new Error(`GET ${path} failed (HTTP ${response.status})`);
  return body;
}

async function main() {
  const root = await getJson("/stac");
  const catalog = await getJson("/stac/collections");
  const collections = catalog.collections ?? [];

  if (root.stac_version !== "1.0.0" || collections.length === 0) {
    throw new Error("Expected a STAC 1.0 catalog with public collections");
  }
  if (collections.some((collection) => !collection.links?.some((link) => link.rel === "items"))) {
    throw new Error("Every public collection should link to its items endpoint");
  }

  const search = await getJson("/stac/search?limit=1");
  const item = search.features?.[0];
  if (search.type !== "FeatureCollection" || !item?.geometry) {
    throw new Error("Expected /stac/search to return at least one item with geometry");
  }

  console.log(
    `PASS: STAC ${root.stac_version} exposes ${collections.length} collection(s): ${collections.map((collection) => collection.title).join(", ")}; search returned item ${item.id} from ${item.collection}`,
  );
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
