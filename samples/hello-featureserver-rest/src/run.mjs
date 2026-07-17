#!/usr/bin/env node
// hello-featureserver-rest
//
// Plain REST walkthrough of the import -> publish -> query loop documented in
// honua-server's docs/get-started/first-dataset.md, but scripted end-to-end
// and asserted rather than eyeballed:
//   1. upload a small GeoJSON file (POST /api/v1/admin/import/upload)
//   2. register the compose Postgres as a named connection
//   3. publish the imported table as a FeatureServer layer
//   4. allow anonymous reads on that service (so the query step also proves
//      the no-API-key path works)
//   5. query it back over the Esri-compatible GeoServices REST FeatureServer
//      and assert the features round-tripped intact
//
// No SDK package involved on purpose (sdks: ["rest"] in sample.json) -- this
// is meant to be readable by anyone who already speaks plain HTTP/GeoJSON.
//
// Zero npm dependencies: fetch/FormData/Blob are all Node >=18 built-ins.

const BASE_URL = process.env.HONUA_BASE_URL ?? "http://localhost:8080";
const ADMIN_API_KEY = process.env.HONUA_ADMIN_API_KEY ?? "quickstart-admin-password";
const CONNECTION_NAME = process.env.HONUA_SAMPLE_CONNECTION ?? "local";
const SERVICE_NAME = process.env.HONUA_SAMPLE_SERVICE ?? "default";
// Suffix so repeat runs against a long-lived server don't collide on table
// name; a fresh `docker compose down -v` also resolves this by wiping the DB.
const TABLE_NAME = process.env.HONUA_SAMPLE_TABLE ?? `honua_samples_hello_${Date.now()}`;
const LAYER_NAME = "hello-points";

const POINTS_GEOJSON = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "Ferry Building" }, geometry: { type: "Point", coordinates: [-122.3937, 37.7955] } },
    { type: "Feature", properties: { name: "Coit Tower" }, geometry: { type: "Point", coordinates: [-122.4058, 37.8024] } },
    { type: "Feature", properties: { name: "Painted Ladies" }, geometry: { type: "Point", coordinates: [-122.433, 37.7762] } },
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
  const blob = new Blob([JSON.stringify(POINTS_GEOJSON)], { type: "application/geo+json" });
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
  // The import service physically names the table differently from the
  // requested TableName (observed: prefixed with "imported_") -- publish
  // must reference physicalTableName, not the name we asked for.
  if (!body.physicalTableName) {
    throw new Error(`upload response did not include physicalTableName: ${JSON.stringify(body)}`);
  }
  return body;
}

async function registerConnection() {
  // Check first rather than create-then-handle-conflict: a duplicate name
  // comes back as a generic 400 ("Secure connection request is invalid."),
  // not a 409, so message-sniffing would be fragile. This makes re-running
  // the sample against a long-lived server idempotent.
  const existing = await fetch(`${BASE_URL}/api/v1/admin/connections`, {
    headers: adminHeaders(),
  });
  if (existing.ok) {
    const body = await asJson(existing, "list connections");
    const list = Array.isArray(body?.data) ? body.data : [];
    if (list.some((c) => c.name === CONNECTION_NAME)) {
      return { alreadyExists: true };
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
  const body = await asJson(response, "register connection");
  if (!response.ok) {
    throw new Error(`connection registration failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
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
    }),
  });
  const body = await asJson(response, "publish layer");
  if (!response.ok || body.success === false) {
    throw new Error(`layer publish failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return body.data ?? body;
}

async function allowAnonymousReads(serviceName) {
  const response = await fetch(`${BASE_URL}/api/v1/admin/services/${serviceName}/access-policy`, {
    method: "PUT",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ allowAnonymous: true }),
  });
  if (!response.ok) {
    const body = await asJson(response, "access policy");
    throw new Error(`access-policy update failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
}

async function queryFeatureServer(serviceName, layerId) {
  const url = `${BASE_URL}/rest/services/${serviceName}/FeatureServer/${layerId}/query?where=1%3D1&outFields=*&f=json`;
  // Deliberately NO API key here: step 4 opened anonymous reads, and this
  // query is what proves that path actually works.
  const response = await fetch(url);
  const body = await asJson(response, "FeatureServer query");
  if (!response.ok) {
    throw new Error(`FeatureServer query failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const started = Date.now();

  console.log(`[hello-featureserver-rest] target server: ${BASE_URL}`);

  console.log(`[hello-featureserver-rest] 1/5 uploading ${TABLE_NAME} (${POINTS_GEOJSON.features.length} features)...`);
  const uploaded = await uploadGeoJson();

  console.log(`[hello-featureserver-rest] 2/5 registering connection "${CONNECTION_NAME}"...`);
  await registerConnection();

  console.log(`[hello-featureserver-rest] 3/5 publishing layer "${LAYER_NAME}"...`);
  const published = await publishLayer(uploaded.physicalTableName);
  const layerId = published.layerId;
  const serviceName = published.serviceName ?? SERVICE_NAME;
  if (layerId === undefined || layerId === null) {
    throw new Error(`publish response did not include a layerId: ${JSON.stringify(published)}`);
  }

  console.log(`[hello-featureserver-rest] 4/5 allowing anonymous reads on service "${serviceName}"...`);
  await allowAnonymousReads(serviceName);

  console.log(`[hello-featureserver-rest] 5/5 querying FeatureServer/${layerId}...`);
  const result = await queryFeatureServer(serviceName, layerId);

  const features = result.features ?? [];
  // Imported GeoJSON properties land as a single JSONB "properties" field
  // rather than one column per property (observed against a real compose
  // run) -- read the name back out of there.
  const names = features
    .map((f) => f?.attributes?.properties?.name ?? f?.attributes?.name)
    .filter((name) => typeof name === "string")
    .sort();
  const expectedNames = POINTS_GEOJSON.features.map((f) => f.properties.name).sort();

  const missing = expectedNames.filter((name) => !names.includes(name));
  const durationMs = Date.now() - started;

  if (features.length !== POINTS_GEOJSON.features.length || missing.length > 0) {
    console.error(
      `[hello-featureserver-rest] FAIL in ${durationMs}ms: expected ${expectedNames.length} features (${expectedNames.join(", ")}), got ${features.length} (${names.join(", ")})`,
    );
    process.exit(1);
  }

  console.log(
    `[hello-featureserver-rest] PASS in ${durationMs}ms: queried back ${features.length} features (${names.join(", ")}) from ${serviceName}/FeatureServer/${layerId}`,
  );
}

main().catch((err) => {
  console.error(`[hello-featureserver-rest] FAIL: ${err.message}`);
  process.exit(1);
});
