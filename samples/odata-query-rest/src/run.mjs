#!/usr/bin/env node
// odata-query-rest
//
// Plain REST walkthrough of Honua's OData v4 service (/odata/*) against a
// composed Honua Server. No SDK, just fetch() -- readable by anyone who
// already speaks plain HTTP/OData.
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
//   4. Enable the OData protocol and open anonymous reads on that service.
//   5. GET /odata (service document) -- assert the Layers/Features entity
//      sets are advertised.
//   6. GET /odata/$metadata -- assert the EDMX declares the Feature entity
//      type.
//   7. GET /odata/Layers({layerId})/Features?$count=true -- read back the
//      full, unfiltered set to learn the real (server-assigned) ObjectId
//      values, since those are a global sequence, not reset per layer.
//   8. GET .../Features?$filter=ObjectId gt {median}&$count=true -- assert
//      the filtered @odata.count is exactly the expected remainder and
//      every returned feature's ObjectId is actually above the threshold
//      (proves $filter is real server-side filtering, not just echoing
//      $count from the unfiltered set).
//
// Zero npm dependencies: fetch is a Node >=18 built-in.

const BASE_URL = process.env.HONUA_BASE_URL ?? "http://localhost:8080";
const ADMIN_API_KEY = process.env.HONUA_ADMIN_API_KEY ?? "quickstart-admin-password";
const CONNECTION_NAME = process.env.HONUA_SAMPLE_CONNECTION ?? "local";
const SERVICE_NAME = process.env.HONUA_SAMPLE_SERVICE ?? "odata-query-rest-sample";
const TABLE_NAME = process.env.HONUA_SAMPLE_TABLE ?? `honua_samples_odata_${Date.now()}`;
const LAYER_NAME = "odata-query-rest-points";

const POINTS = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "Ferry Building" }, geometry: { type: "Point", coordinates: [-122.3937, 37.7955] } },
    { type: "Feature", properties: { name: "Coit Tower" }, geometry: { type: "Point", coordinates: [-122.4058, 37.8024] } },
    { type: "Feature", properties: { name: "Painted Ladies" }, geometry: { type: "Point", coordinates: [-122.433, 37.7762] } },
    { type: "Feature", properties: { name: "Golden Gate Bridge" }, geometry: { type: "Point", coordinates: [-122.4783, 37.8199] } },
  ],
};

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

async function enableODataProtocol() {
  const response = await fetch(`${BASE_URL}/api/v1/admin/services/${SERVICE_NAME}/protocols`, {
    method: "PUT",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ enabledProtocols: ["OData"] }),
  });
  if (!response.ok) {
    const body = await asJson(response, "enable OData protocol");
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

async function anonymousGet(path, { asText = false } = {}) {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GET ${path} failed (HTTP ${response.status}): ${body.slice(0, 500)}`);
  }
  return asText ? response.text() : asJson(response, path);
}

async function walkServiceDocAndMetadata() {
  const serviceDoc = await anonymousGet("/odata");
  const entitySets = (serviceDoc.value ?? []).map((e) => e.name);
  if (!entitySets.includes("Layers") || !entitySets.includes("Features")) {
    throw new Error(`OData service document missing Layers/Features entity sets: ${JSON.stringify(entitySets)}`);
  }

  const metadata = await anonymousGet("/odata/$metadata", { asText: true });
  if (!metadata.includes('EntityType Name="Feature"')) {
    throw new Error(`OData $metadata missing Feature entity type declaration`);
  }
}

async function main() {
  const started = Date.now();
  console.log(`[odata-query-rest] target server: ${BASE_URL}`);

  console.log(`[odata-query-rest] 1/7 uploading ${TABLE_NAME} (${POINTS.features.length} features)...`);
  const uploaded = await uploadGeoJson();

  console.log(`[odata-query-rest] 2/7 registering connection "${CONNECTION_NAME}"...`);
  await registerConnection();

  console.log(`[odata-query-rest] 3/7 publishing layer "${LAYER_NAME}" on service "${SERVICE_NAME}"...`);
  const layerId = await publishLayer(uploaded.physicalTableName);

  console.log(`[odata-query-rest] 4/7 enabling OData protocol + anonymous reads...`);
  await enableODataProtocol();
  await allowAnonymousReads();

  console.log(`[odata-query-rest] 5/7 walking service document + $metadata...`);
  await walkServiceDocAndMetadata();

  console.log(`[odata-query-rest] 6/7 reading back the unfiltered feature set...`);
  const unfiltered = await anonymousGet(`/odata/Layers(${layerId})/Features?$count=true`);
  const allFeatures = unfiltered.value ?? [];
  if (allFeatures.length !== POINTS.features.length) {
    throw new Error(
      `expected ${POINTS.features.length} unfiltered features, got ${allFeatures.length}: ${JSON.stringify(allFeatures)}`,
    );
  }
  if (unfiltered["@odata.count"] !== POINTS.features.length) {
    throw new Error(`unfiltered @odata.count mismatch: expected ${POINTS.features.length}, got ${unfiltered["@odata.count"]}`);
  }

  const objectIds = allFeatures.map((f) => f.ObjectId).sort((a, b) => a - b);
  // ObjectId is a global sequence across every layer ever published to this
  // server, not reset per layer -- so the threshold has to be derived from
  // the actual values, never hardcoded.
  const medianIndex = Math.floor(objectIds.length / 2) - 1;
  const threshold = objectIds[medianIndex];
  const expectedFilteredCount = objectIds.filter((id) => id > threshold).length;

  console.log(`[odata-query-rest] 7/7 querying $filter=ObjectId gt ${threshold}&$count=true...`);
  const filtered = await anonymousGet(
    `/odata/Layers(${layerId})/Features?$filter=ObjectId gt ${threshold}&$count=true`,
  );
  const filteredFeatures = filtered.value ?? [];
  const allAboveThreshold = filteredFeatures.every((f) => f.ObjectId > threshold);

  const duration = Date.now() - started;

  if (filtered["@odata.count"] !== expectedFilteredCount || filteredFeatures.length !== expectedFilteredCount || !allAboveThreshold) {
    console.error(
      `[odata-query-rest] FAIL in ${duration}ms: expected ${expectedFilteredCount} feature(s) with ObjectId > ${threshold}, got ${filteredFeatures.length} (@odata.count=${filtered["@odata.count"]}, allAboveThreshold=${allAboveThreshold})`,
    );
    process.exit(1);
  }

  console.log(
    `[odata-query-rest] PASS in ${duration}ms: $filter=ObjectId gt ${threshold} narrowed ${allFeatures.length} features to ${filteredFeatures.length} (@odata.count=${filtered["@odata.count"]})`,
  );
}

main().catch((err) => {
  console.error(`[odata-query-rest] FAIL: ${err.message}`);
  process.exit(1);
});
