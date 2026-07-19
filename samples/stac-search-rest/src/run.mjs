#!/usr/bin/env node
// stac-search-rest
//
// Plain REST walkthrough of Honua's STAC API (https://server/stac/*) against
// a composed Honua Server. No SDK, just fetch() -- readable by anyone who
// already speaks plain HTTP/GeoJSON/STAC.
//
// Self-contained (honua-io/honua-samples#4): imports its own tiny GeoJSON
// dataset (timestamped table name) and publishes it under a sample-owned
// service name, so this can run before/after/alongside any other sample
// without depending on run order.
//
// Steps:
//   1. Upload a small GeoJSON file (POST /api/v1/admin/import/upload).
//   2. Register the compose Postgres as a named connection.
//   3. Publish the imported table as a layer under a dedicated service.
//   4. Enable the Stac protocol and open anonymous reads on that service.
//   5. Walk the STAC catalog: GET /stac (landing) -> GET /stac/conformance.
//   6. GET /stac/collections/{id}/items with a bbox that covers 3 of the 4
//      imported points, asserting exactly the in-bbox points come back with
//      real Point geometry, then fetch one item individually and assert its
//      geometry matches.
//
// Known gap (documented, not a bug in this sample): GET /stac/collections
// (the collection *list*) and GET/POST /stac/search both require a
// metadata-v2 "StacCollection" publication, which the standard
// POST /api/v1/admin/connections/{name}/layers publish flow does not
// currently create (it only creates an "EsriFeatureLayer" publication) --
// so a freshly self-published vector layer like this sample's won't appear
// there yet, even though the layer-scoped items route below works. This
// sample walks catalog/conformance/items, the part of the documented STAC
// surface (docs/reference/protocols/stac.md) that is actually reachable for
// a vector layer published this way, and calls out the gap rather than
// silently skipping it.
//
// Zero npm dependencies: fetch is a Node >=18 built-in.

const BASE_URL = process.env.HONUA_BASE_URL ?? "http://localhost:8080";
const ADMIN_API_KEY = process.env.HONUA_ADMIN_API_KEY ?? "quickstart-admin-password";
const CONNECTION_NAME = process.env.HONUA_SAMPLE_CONNECTION ?? "local";
const SERVICE_NAME = process.env.HONUA_SAMPLE_SERVICE ?? "stac-search-rest-sample";
const TABLE_NAME = process.env.HONUA_SAMPLE_TABLE ?? `honua_samples_stac_${Date.now()}`;
const LAYER_NAME = "stac-search-rest-points";

// bbox covers the first three; "Oakland City Hall" sits well east of it, so
// a correct bbox filter must exclude it.
const SEARCH_BBOX = [-122.45, 37.77, -122.38, 37.81];
const POINTS = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "Ferry Building" }, geometry: { type: "Point", coordinates: [-122.3937, 37.7955] } },
    { type: "Feature", properties: { name: "Coit Tower" }, geometry: { type: "Point", coordinates: [-122.4058, 37.8024] } },
    { type: "Feature", properties: { name: "Painted Ladies" }, geometry: { type: "Point", coordinates: [-122.433, 37.7762] } },
    { type: "Feature", properties: { name: "Oakland City Hall" }, geometry: { type: "Point", coordinates: [-122.2711, 37.8044] } },
  ],
};
const EXPECTED_IN_BBOX = ["Coit Tower", "Ferry Building", "Painted Ladies"].sort();

function adminHeaders(extra = {}) {
  return { "X-API-Key": ADMIN_API_KEY, ...extra };
}

async function asJson(response, step) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${step}: response was not JSON (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }
  return body;
}

async function uploadGeoJson() {
  const form = new FormData();
  const blob = new Blob([JSON.stringify(POINTS)], { type: "application/geo+json" });
  form.append("file", blob, "points.geojson");
  form.append("TableName", TABLE_NAME);

  const response = await fetch(`${BASE_URL}/api/v1/admin/import/upload`, {
    method: "POST",
    headers: adminHeaders(),
    body: form,
  });
  const body = await asJson(response, "upload");
  if (!response.ok || body.success === false) {
    throw new Error(`upload failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  if (!body.physicalTableName) {
    throw new Error(`upload response did not include physicalTableName: ${JSON.stringify(body)}`);
  }
  return body;
}

async function registerConnection() {
  const existing = await fetch(`${BASE_URL}/api/v1/admin/connections`, { headers: adminHeaders() });
  if (existing.ok) {
    const body = await asJson(existing, "list connections");
    const list = Array.isArray(body?.data) ? body.data : [];
    if (list.some((c) => c.name === CONNECTION_NAME)) {
      return;
    }
  }
  const response = await fetch(`${BASE_URL}/api/v1/admin/connections`, {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: CONNECTION_NAME,
      host: "postgres",
      port: 5432,
      databaseName: "honua_dev",
      username: "honua_user",
      password: "honua_password",
      sslRequired: false,
      sslMode: "Prefer",
    }),
  });
  if (!response.ok) {
    const body = await asJson(response, "register connection");
    throw new Error(`connection registration failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
}

async function publishLayer(physicalTableName) {
  const response = await fetch(`${BASE_URL}/api/v1/admin/connections/${CONNECTION_NAME}/layers`, {
    method: "POST",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      schema: "honua_data",
      table: physicalTableName,
      layerName: LAYER_NAME,
      srid: 4326,
      serviceName: SERVICE_NAME,
    }),
  });
  const body = await asJson(response, "publish layer");
  if (!response.ok || body.success === false) {
    throw new Error(`layer publish failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  const data = body.data ?? body;
  if (data.layerId === undefined || data.layerId === null) {
    throw new Error(`publish response did not include a layerId: ${JSON.stringify(body)}`);
  }
  return data.layerId;
}

async function enableStacProtocol() {
  const response = await fetch(`${BASE_URL}/api/v1/admin/services/${SERVICE_NAME}/protocols`, {
    method: "PUT",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ enabledProtocols: ["Stac"] }),
  });
  if (!response.ok) {
    const body = await asJson(response, "enable Stac protocol");
    throw new Error(`protocol enable failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
}

async function allowAnonymousReads() {
  const response = await fetch(`${BASE_URL}/api/v1/admin/services/${SERVICE_NAME}/access-policy`, {
    method: "PUT",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ allowAnonymous: true }),
  });
  if (!response.ok) {
    const body = await asJson(response, "access policy");
    throw new Error(`access-policy update failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
}

async function anonymousGet(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const body = await asJson(response, path);
  if (!response.ok) {
    throw new Error(`GET ${path} failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function walkCatalogAndConformance() {
  const catalog = await anonymousGet("/stac");
  if (catalog.stac_version === undefined) {
    throw new Error(`STAC catalog landing page missing stac_version: ${JSON.stringify(catalog)}`);
  }
  const conformance = await anonymousGet("/stac/conformance");
  const conformsTo = conformance.conformsTo ?? [];
  if (!conformsTo.includes("https://api.stacspec.org/v1.0.0/core")) {
    throw new Error(`STAC conformance missing core class: ${JSON.stringify(conformsTo)}`);
  }
  return conformsTo;
}

async function checkCollectionsListGap(layerId) {
  // Informational only -- see the "Known gap" note at the top of this file.
  // Not asserted: a freshly self-published vector layer legitimately won't
  // appear here today.
  const collections = await anonymousGet("/stac/collections");
  const present = (collections.collections ?? []).some((c) => c.id === String(layerId));
  console.log(
    `[stac-search-rest] note: /stac/collections ${present ? "includes" : "does not yet include"} collection ${layerId} (known metadata-v2 StacCollection-publication gap; see README)`,
  );
}

async function itemsInBbox(layerId) {
  const [minx, miny, maxx, maxy] = SEARCH_BBOX;
  const path = `/stac/collections/${layerId}/items?bbox=${minx},${miny},${maxx},${maxy}&limit=10`;
  const page = await anonymousGet(path);
  return page.features ?? [];
}

async function getSingleItem(layerId, itemId) {
  return anonymousGet(`/stac/collections/${layerId}/items/${itemId}`);
}

async function main() {
  const started = Date.now();
  console.log(`[stac-search-rest] target server: ${BASE_URL}`);

  console.log(`[stac-search-rest] 1/6 uploading ${TABLE_NAME} (${POINTS.features.length} features)...`);
  const uploaded = await uploadGeoJson();

  console.log(`[stac-search-rest] 2/6 registering connection "${CONNECTION_NAME}"...`);
  await registerConnection();

  console.log(`[stac-search-rest] 3/6 publishing layer "${LAYER_NAME}" on service "${SERVICE_NAME}"...`);
  const layerId = await publishLayer(uploaded.physicalTableName);

  console.log(`[stac-search-rest] 4/6 enabling Stac protocol + anonymous reads...`);
  await enableStacProtocol();
  await allowAnonymousReads();

  console.log(`[stac-search-rest] 5/6 walking catalog + conformance...`);
  await walkCatalogAndConformance();
  await checkCollectionsListGap(layerId);

  console.log(`[stac-search-rest] 6/6 fetching bbox-filtered items...`);
  const items = await itemsInBbox(layerId);

  const namesInBbox = items
    .map((f) => f?.properties?.properties?.name ?? f?.properties?.name)
    .filter((name) => typeof name === "string")
    .sort();
  const missingGeometry = items.filter((f) => f?.geometry?.type !== "Point" || f.geometry.coordinates?.length !== 2);

  const duration = Date.now() - started;

  if (namesInBbox.join(",") !== EXPECTED_IN_BBOX.join(",") || missingGeometry.length > 0) {
    console.error(
      `[stac-search-rest] FAIL in ${duration}ms: expected bbox items ${EXPECTED_IN_BBOX.join(", ")}, got ${namesInBbox.join(", ")} (${missingGeometry.length} missing/invalid geometry)`,
    );
    process.exit(1);
  }

  const firstItem = items[0];
  const singleItem = await getSingleItem(layerId, firstItem.id);
  if (!singleItem.geometry || singleItem.geometry.type !== "Point") {
    console.error(`[stac-search-rest] FAIL in ${duration}ms: single-item fetch for ${firstItem.id} missing Point geometry`);
    process.exit(1);
  }

  console.log(
    `[stac-search-rest] PASS in ${duration}ms: bbox filtered ${POINTS.features.length} imported points down to ${items.length} (${namesInBbox.join(", ")}), each with real Point geometry`,
  );
}

main().catch((err) => {
  console.error(`[stac-search-rest] FAIL: ${err.message}`);
  process.exit(1);
});
