#!/usr/bin/env node

const BASE_URL = process.env.HONUA_BASE_URL ?? "http://localhost:8080";
const ADMIN_API_KEY = process.env.HONUA_ADMIN_API_KEY ?? "quickstart-admin-password";
const CONNECTION_NAME = process.env.HONUA_SAMPLE_CONNECTION ?? "local";
const SERVICE_NAME = process.env.HONUA_SAMPLE_SERVICE ?? "wms-getmap-check-sample";
const TABLE_NAME = process.env.HONUA_SAMPLE_TABLE ?? `honua_samples_wms_${Date.now()}`;
const LAYER_NAME = "wms-getmap-check-points";
const MAP_WIDTH = 317;
const MAP_HEIGHT = 241;

const POINTS = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "Ferry Building" }, geometry: { type: "Point", coordinates: [-122.3937, 37.7955] } },
    { type: "Feature", properties: { name: "Coit Tower" }, geometry: { type: "Point", coordinates: [-122.4058, 37.8024] } },
    { type: "Feature", properties: { name: "Painted Ladies" }, geometry: { type: "Point", coordinates: [-122.433, 37.7762] } },
  ],
};

function log(message) {
  console.log(`[wms-getmap-check] ${message}`);
}

function adminHeaders(extra = {}) {
  return { "X-API-Key": ADMIN_API_KEY, ...extra };
}

async function jsonBody(response, step) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${step}: response was not JSON (HTTP ${response.status}): ${text.slice(0, 500)}`);
  }
}

async function requireJson(response, step) {
  const body = await jsonBody(response, step);
  if (!response.ok || body.success === false) {
    throw new Error(`${step} failed (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function uploadGeoJson() {
  const form = new FormData();
  form.append("file", new Blob([JSON.stringify(POINTS)], { type: "application/geo+json" }), "points.geojson");
  form.append("TableName", TABLE_NAME);
  const response = await fetch(`${BASE_URL}/api/v1/admin/import/upload`, {
    method: "POST",
    headers: adminHeaders(),
    body: form,
  });
  const body = await requireJson(response, "upload");
  if (!body.physicalTableName) throw new Error("upload response omitted physicalTableName");
  return body.physicalTableName;
}

async function registerConnection() {
  const existing = await fetch(`${BASE_URL}/api/v1/admin/connections`, { headers: adminHeaders() });
  if (existing.ok) {
    const body = await jsonBody(existing, "list connections");
    if ((body.data ?? []).some((connection) => connection.name === CONNECTION_NAME)) return;
  }
  await requireJson(
    await fetch(`${BASE_URL}/api/v1/admin/connections`, {
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
    }),
    "register connection",
  );
}

async function publishLayer(physicalTableName) {
  await requireJson(
    await fetch(`${BASE_URL}/api/v1/admin/connections/${encodeURIComponent(CONNECTION_NAME)}/layers`, {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        schema: "honua_data",
        table: physicalTableName,
        layerName: LAYER_NAME,
        srid: 4326,
        serviceName: SERVICE_NAME,
      }),
    }),
    "publish layer",
  );
}

async function configureService() {
  const service = encodeURIComponent(SERVICE_NAME);
  await requireJson(
    await fetch(`${BASE_URL}/api/v1/admin/services/${service}/protocols`, {
      method: "PUT",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ enabledProtocols: ["Wms"] }),
    }),
    "enable WMS",
  );
  await requireJson(
    await fetch(`${BASE_URL}/api/v1/admin/services/${service}/access-policy`, {
      method: "PUT",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ allowAnonymous: true }),
    }),
    "allow anonymous reads",
  );
}

async function verifyCapabilities() {
  const parameters = new URLSearchParams({ SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetCapabilities" });
  const response = await fetch(`${BASE_URL}/ogc/services/${encodeURIComponent(SERVICE_NAME)}/wms?${parameters}`);
  const xml = await response.text();
  if (!response.ok) throw new Error(`GetCapabilities failed (HTTP ${response.status})`);
  if (!xml.includes(`<Name>${LAYER_NAME}</Name>`)) throw new Error(`GetCapabilities omitted layer ${LAYER_NAME}`);
}

async function verifyMap() {
  const parameters = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: LAYER_NAME,
    STYLES: "",
    CRS: "EPSG:4326",
    BBOX: "37.7,-122.5,37.9,-122.3",
    WIDTH: String(MAP_WIDTH),
    HEIGHT: String(MAP_HEIGHT),
    FORMAT: "image/png",
  });
  const response = await fetch(`${BASE_URL}/ogc/services/${encodeURIComponent(SERVICE_NAME)}/wms?${parameters}`);
  if (!response.ok) throw new Error(`GetMap failed (HTTP ${response.status})`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/png")) throw new Error(`GetMap content type was ${contentType}`);
  const png = Buffer.from(await response.arrayBuffer());
  if (png.length <= 100) throw new Error(`GetMap response was suspiciously small (${png.length} bytes)`);
  if (!png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) throw new Error("GetMap response was not PNG");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== MAP_WIDTH || height !== MAP_HEIGHT) {
    throw new Error(`GetMap dimensions mismatch: requested ${MAP_WIDTH}x${MAP_HEIGHT}, received ${width}x${height}`);
  }
  return { width, height, bytes: png.length };
}

async function main() {
  const started = Date.now();
  log(`target server: ${BASE_URL}`);
  log(`1/6 uploading ${TABLE_NAME} (${POINTS.features.length} features)...`);
  const physicalTableName = await uploadGeoJson();
  log(`2/6 registering connection "${CONNECTION_NAME}"...`);
  await registerConnection();
  log(`3/6 publishing layer "${LAYER_NAME}" on service "${SERVICE_NAME}"...`);
  await publishLayer(physicalTableName);
  log("4/6 enabling WMS and anonymous reads...");
  await configureService();
  log("5/6 requesting GetCapabilities...");
  await verifyCapabilities();
  log(`6/6 requesting GetMap (${MAP_WIDTH}x${MAP_HEIGHT})...`);
  const image = await verifyMap();
  log(`PASS in ${Date.now() - started}ms: ${image.width}x${image.height} image/png (${image.bytes} bytes)`);
}

main().catch((error) => {
  console.error(`[wms-getmap-check] FAIL: ${error.message}`);
  process.exit(1);
});
