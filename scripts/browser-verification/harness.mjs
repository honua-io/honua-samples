// Shared harness for the Playwright verifications of browser samples
// (samples/<id>/verify/*.spec.mjs, run by playwright.config.ts and by
// scripts/run-samples.mjs's browser lane). See docs/browser-verification/.
//
// Everything a spec needs that is not the sample itself lives here:
//   - the runner's environment (base URL + admin API key, never hard-coded),
//   - seeding the committed fixture into the composed server through the
//     same admin API a user would call (import -> publish -> protocols ->
//     access policy), so every oracle is computed from the fixture, not from
//     the server's answer,
//   - scaffolding create-honua-app from the published package at the
//     sample-pinned version and building it,
//   - starting/stopping the origin the browser loads the sample from,
//   - projecting fixture coordinates onto the rendered map and reading pixels.
//
// Waiting is always on a condition (an HTTP answer, a DOM state, a rendered
// pixel), never a fixed sleep.

import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");
export const FIXTURE_PATH = path.join(HERE, "fixtures", "honolulu-operations-areas.geojson");

/**
 * The browser origin every sample is served from. docker/compose.yml pins the
 * server's Cors:AllowedOrigins to exactly "http://localhost:3000", so a
 * cross-origin fetch from the page only succeeds from this origin.
 */
export const BROWSER_ORIGIN_PORT = Number(process.env.HONUA_BROWSER_STATIC_PORT ?? 3000);
export const BROWSER_ORIGIN = `http://localhost:${BROWSER_ORIGIN_PORT}`;

const NPM_REGISTRY_PREFIX = "https://registry.npmjs.org/";
const CONVERGENCE_TIMEOUT_MS = 30_000;
const CONVERGENCE_POLL_MS = 500;

/** The composed server the runner points every sample at. */
export function serverEnv() {
  const baseUrl = (process.env.HONUA_BASE_URL ?? "").replace(/\/+$/, "");
  const adminApiKey = process.env.HONUA_ADMIN_API_KEY ?? "";
  if (!baseUrl) throw new Error("HONUA_BASE_URL is not set: point it at the composed Honua server.");
  if (!adminApiKey) throw new Error("HONUA_ADMIN_API_KEY is not set: the harness seeds the fixture through the admin API.");
  return { baseUrl, adminApiKey };
}

// ---- fixture + oracle ---------------------------------------------------

/**
 * Loads the committed fixture and derives everything a spec asserts on:
 * feature count, fixture ids, names, rings, and an interior point per polygon.
 */
export async function loadFixture() {
  const geojson = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  const features = geojson.features.map((feature) => {
    const ring = feature.geometry.coordinates[0];
    const interior = bboxCenter(ring);
    if (!pointInRing(interior, ring)) {
      throw new Error(`fixture feature ${feature.properties.fixtureId} has no interior bbox centre; pick another oracle point`);
    }
    return {
      fixtureId: feature.properties.fixtureId,
      name: feature.properties.name,
      ring,
      interior,
    };
  });
  return { geojson, features, count: features.length };
}

function bboxCenter(ring) {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A lon/lat point outside every fixture polygon, used as the background control pixel. */
export function outsidePoint(fixture, view) {
  const candidate = [view.center[0] - 0.02, view.center[1] + 0.02];
  for (const feature of fixture.features) {
    if (pointInRing(candidate, feature.ring)) throw new Error("background control point falls inside a fixture polygon");
  }
  return candidate;
}

// ---- seeding the composed server ----------------------------------------

async function adminFetch(env, method, apiPath, body) {
  const headers = { "X-API-Key": env.adminApiKey };
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${env.baseUrl}${apiPath}`, { method, headers, body: payload });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (!response.ok || json?.success === false) {
    throw new Error(`${method} ${apiPath} -> HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

async function ensureConnection(env, name) {
  const existing = await adminFetch(env, "GET", "/api/v1/admin/connections");
  if ((existing.data ?? []).some((connection) => connection.name === name)) return;
  await adminFetch(env, "POST", "/api/v1/admin/connections", {
    name,
    host: process.env.HONUA_SAMPLE_DB_HOST ?? "postgres",
    port: 5432,
    databaseName: "honua_dev",
    username: "honua_user",
    password: "honua_password",
    sslRequired: false,
    sslMode: "Prefer",
  });
}

/**
 * Imports the fixture into a fresh table and publishes it as a FeatureServer
 * service. Unique names keep every spec independent of run order and of
 * whatever an earlier run left on the server.
 *
 * @param {{ prefix: string, allowAnonymous: boolean }} opts
 */
export async function seedFeatureService({ prefix, allowAnonymous }) {
  const env = serverEnv();
  const fixture = await loadFixture();
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const serviceName = `${prefix}-${suffix}`;
  const tableName = `${prefix.replace(/-/g, "_")}_${suffix}`;
  const layerName = "operations-areas";

  const form = new FormData();
  form.set("file", new Blob([JSON.stringify(fixture.geojson)], { type: "application/geo+json" }), "operations-areas.geojson");
  form.set("TableName", tableName);
  const upload = await adminFetch(env, "POST", "/api/v1/admin/import/upload", form);
  if (upload.featureCount !== fixture.count) {
    throw new Error(`import reported ${upload.featureCount} feature(s); the fixture has ${fixture.count}`);
  }

  const connectionName = process.env.HONUA_SAMPLE_CONNECTION ?? "local";
  await ensureConnection(env, connectionName);
  const published = await adminFetch(env, "POST", `/api/v1/admin/connections/${connectionName}/layers`, {
    schema: upload.schema ?? "honua_data",
    table: upload.physicalTableName,
    layerName,
    srid: 4326,
    serviceName,
    enabled: true,
  });
  if (published.data?.enabled !== true) {
    throw new Error(`layer publish did not confirm serving enablement: ${JSON.stringify(published).slice(0, 300)}`);
  }
  const layerId = published.data.layerId;

  await adminFetch(env, "PUT", `/api/v1/admin/services/${serviceName}/protocols`, { enabledProtocols: ["FeatureServer"] });
  if (allowAnonymous) {
    await adminFetch(env, "PUT", `/api/v1/admin/services/${serviceName}/access-policy`, { allowAnonymous: true });
  }

  const serviceUrl = `${env.baseUrl}/rest/services/${serviceName}/FeatureServer`;
  const layerUrl = `${serviceUrl}/${layerId}`;
  await waitForFeatureServer({ env, layerUrl, allowAnonymous, expectedCount: fixture.count });
  return { serviceName, layerId, layerName, serviceUrl, layerUrl, allowAnonymous };
}

/**
 * Publishing invalidates metadata asynchronously, so poll the real query
 * until it answers with the fixture. For a service that must refuse
 * anonymous callers, also prove the refusal before any spec relies on it.
 */
async function waitForFeatureServer({ env, layerUrl, allowAnonymous, expectedCount }) {
  const query = `${layerUrl}/query?where=1%3D1&outFields=*&returnGeometry=false&f=json`;
  const headers = allowAnonymous ? {} : { "X-API-Key": env.adminApiKey };
  const deadline = Date.now() + CONVERGENCE_TIMEOUT_MS;
  let last = "no response";
  for (;;) {
    const body = await fetch(query, { headers })
      .then((response) => response.json())
      .catch((error) => ({ error: { message: error.message } }));
    if (body.features?.length === expectedCount) break;
    last = JSON.stringify(body).slice(0, 300);
    if (Date.now() >= deadline) throw new Error(`${layerUrl} did not serve the fixture within ${CONVERGENCE_TIMEOUT_MS} ms: ${last}`);
    await delay(CONVERGENCE_POLL_MS);
  }
  if (!allowAnonymous) {
    const anonymous = await fetch(query).then((response) => response.json());
    if (!anonymous.error) throw new Error(`${layerUrl} answered an anonymous query; the refusal precondition does not hold`);
  }
}

// ---- processes ----------------------------------------------------------

/** Runs a command to completion; rejects with the output tail on failure. */
export function runCommand(command, args, { cwd, env = process.env, label = command } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const collect = (chunk) => {
      output = (output + chunk.toString()).slice(-20_000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${label} exited ${code} in ${cwd}:\n${output.slice(-4_000)}`));
    });
  });
}

/**
 * Serves a built Vite app with `vite preview` on the browser origin port and
 * resolves once the origin answers.
 */
export async function startVitePreview({ appDir, outDir }) {
  const vite = path.join(appDir, "node_modules", ".bin", "vite");
  const child = spawn(
    vite,
    ["preview", "--port", String(BROWSER_ORIGIN_PORT), "--strictPort", "--host", "localhost", "--outDir", outDir],
    { cwd: appDir, stdio: ["ignore", "pipe", "pipe"], detached: true },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));

  const deadline = Date.now() + 60_000;
  for (;;) {
    const ready = await fetch(`${BROWSER_ORIGIN}/`).then((response) => response.ok).catch(() => false);
    if (ready) break;
    const code = await Promise.race([exited, delay(250).then(() => undefined)]);
    if (code !== undefined) throw new Error(`vite preview exited ${code} before serving:\n${output}`);
    if (Date.now() >= deadline) {
      process.kill(-child.pid, "SIGTERM");
      throw new Error(`vite preview did not answer on ${BROWSER_ORIGIN} within 60 s:\n${output}`);
    }
  }
  return {
    url: `${BROWSER_ORIGIN}/`,
    async close() {
      if (child.exitCode !== null) return;
      process.kill(-child.pid, "SIGTERM");
      await exited;
    },
  };
}

// ---- create-honua-app templates -----------------------------------------

/**
 * Scaffolds a create-honua-app template from the PUBLISHED package at the
 * version the sample's package.json pins (installed with `npm ci`, so the
 * lockfile's registry integrity is enforced), installs the generated app from
 * the registry, typechecks it, and builds it once per endpoint.
 *
 * @param {{ sampleDir: string, templateId: string, builds: Record<string, string> }} opts
 *   builds: outDir suffix -> VITE_HONUA_ENDPOINT baked into that build.
 */
export async function prepareTemplateApp({ sampleDir, templateId, builds }) {
  const samplePackage = JSON.parse(await readFile(path.join(sampleDir, "package.json"), "utf8"));
  const pinned = samplePackage.devDependencies?.["create-honua-app"];
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(pinned ?? "")) {
    throw new Error(`samples/${path.basename(sampleDir)}/package.json must pin create-honua-app to an exact version, found ${pinned}`);
  }

  await runCommand("npm", ["ci", "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: sampleDir, label: "npm ci" });
  const sampleLock = JSON.parse(await readFile(path.join(sampleDir, "package-lock.json"), "utf8"));
  const scaffolder = registryReceipt(sampleLock, "create-honua-app");
  if (scaffolder.version !== pinned) {
    throw new Error(`package-lock.json resolves create-honua-app ${scaffolder.version}, package.json pins ${pinned}`);
  }
  const scaffolderRoot = path.join(sampleDir, "node_modules", "create-honua-app");
  const scaffolderPackage = JSON.parse(await readFile(path.join(scaffolderRoot, "package.json"), "utf8"));
  if (scaffolderPackage.version !== pinned) {
    throw new Error(`installed create-honua-app is ${scaffolderPackage.version}, expected ${pinned}`);
  }

  const appDir = path.join(sampleDir, "app");
  await rm(appDir, { recursive: true, force: true });
  await runCommand(
    process.execPath,
    [path.join(scaffolderRoot, scaffolderPackage.bin["create-honua-app"]), "app", "--template", templateId],
    { cwd: sampleDir, label: `create-honua-app --template ${templateId}` },
  );

  const appPackage = JSON.parse(await readFile(path.join(appDir, "package.json"), "utf8"));
  const sdkPin = appPackage.dependencies?.["@honua/sdk-js"];
  await runCommand("npm", ["install", "--no-audit", "--no-fund"], { cwd: appDir, label: "npm install (generated app)" });
  const appLock = JSON.parse(await readFile(path.join(appDir, "package-lock.json"), "utf8"));
  const sdk = registryReceipt(appLock, "@honua/sdk-js");
  if (sdk.version !== sdkPin) {
    throw new Error(`generated app pins @honua/sdk-js ${sdkPin} but installed ${sdk.version}`);
  }
  const maplibre = registryReceipt(appLock, "maplibre-gl");

  await runCommand("npm", ["run", "typecheck"], { cwd: appDir, label: "npm run typecheck" });
  const outDirs = {};
  for (const [name, endpoint] of Object.entries(builds)) {
    const outDir = `dist-${name}`;
    const env = { ...process.env, VITE_HONUA_ENDPOINT: endpoint };
    delete env.VITE_HONUA_PROTOCOL;
    await runCommand("npm", ["run", "build", "--", "--outDir", outDir, "--emptyOutDir"], {
      cwd: appDir,
      env,
      label: `npm run build (${name})`,
    });
    outDirs[name] = outDir;
  }

  return {
    appDir,
    outDirs,
    receipt: { templateId, createHonuaApp: scaffolder, sdk, maplibre },
  };
}

function registryReceipt(lock, name) {
  const entry = lock.packages?.[`node_modules/${name}`];
  if (!entry) throw new Error(`${name} is not in the lockfile`);
  if (!entry.resolved?.startsWith(NPM_REGISTRY_PREFIX) || !entry.integrity) {
    throw new Error(`${name} did not resolve from the public npm registry with an integrity hash (resolved=${entry.resolved})`);
  }
  return { name, version: entry.version, resolved: entry.resolved, integrity: entry.integrity };
}

/**
 * Reads the initial map view and the basemap background colour out of the
 * scaffolded source, so the pixel oracle follows the template bytes instead
 * of a copy of them.
 */
export async function readTemplateView(sourceFile) {
  const source = await readFile(sourceFile, "utf8");
  const view = /center:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\][^}]*?zoom:\s*([\d.]+)/.exec(source);
  const background = /"background-color":\s*"(#[0-9a-fA-F]{6})"/.exec(source);
  if (!view || !background) throw new Error(`could not read the initial view and background colour from ${sourceFile}`);
  return {
    center: [Number(view[1]), Number(view[2])],
    zoom: Number(view[3]),
    background: hexToRgb(background[1]),
  };
}

// ---- map pixels ---------------------------------------------------------

/**
 * Web Mercator projection of a lon/lat onto a MapLibre map of the given CSS
 * size showing `view` (MapLibre's world is 512 px wide at zoom 0).
 */
export function projectToMapPixel([lng, lat], view, size) {
  const world = 512 * 2 ** view.zoom;
  const toWorld = ([x, y]) => {
    const phi = (y * Math.PI) / 180;
    return [((x + 180) / 360) * world, ((1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2) * world];
  };
  const [px, py] = toWorld([lng, lat]);
  const [cx, cy] = toWorld(view.center);
  return [Math.round(size.width / 2 + (px - cx)), Math.round(size.height / 2 + (py - cy))];
}

/** Screenshots `locator` and returns the RGB value at each CSS-pixel point. */
export async function readPixels(page, locator, points) {
  const png = await locator.screenshot({ animations: "disabled" });
  return page.evaluate(
    async ({ b64, points }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      return points.map(([x, y]) => {
        const [r, g, b] = context.getImageData(x, y, 1, 1).data;
        return { r, g, b };
      });
    },
    { b64: png.toString("base64"), points },
  );
}

export function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function colourDistance(a, b) {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
