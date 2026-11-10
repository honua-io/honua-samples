import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../lib/checksum.mjs";
import { adminFetch, serverEnv } from "../lib/admin-api.mjs";
import { fetchSnapshot, readSnapshot } from "./snapshot.mjs";
import { propertyLayers } from "./property-app.mjs";
import { stageSnapshot, layersPath, stagingTableName, stagingServiceName } from "./import.mjs";
import { saveDeployment, readDeployment, activateDeployment, verifyLayer } from "./deployment.mjs";
import { ensureDepartments } from "./departments.mjs";

export const loadSources = Object.keys(propertyLayers);
const planName = "shared-load-plan.json";
const maximumBytes = 900_000_000;

export async function inventory(directory) {
  const layers = [];
  for (const name of loadSources) {
    const { receipt } = await readSnapshot(name, directory);
    if (receipt.rejected !== 0 || receipt.displayGeometry?.maxAllowableOffset !== 0.00002) {
      throw new Error("Shared load requires simplified display geometry and zero rejected rows");
    }
    layers.push({ name, count: receipt.accepted, cleanSha256: receipt.cleanSha256,
      bytes: (await stat(path.join(directory, `${name}.geojson`))).size });
  }
  // A conservative admission reservation, not a measurement of PostgreSQL storage.
  // Main checks actual RDS storage before/after; this never authorizes more than 900 MB.
  const reservedBytes = layers.reduce((total, layer) => total + layer.bytes * 16, 32_000_000);
  if (reservedBytes >= maximumBytes) throw new Error("Display dataset exceeds the shared-load storage reservation; reduce the scope before loading");
  return { format: "honua.samples.shared-load.v1", layers, reservedBytes, maximumBytes };
}

export async function verifyPlan(directory, expectedSha256) {
  const bytes = await readFile(path.join(directory, planName));
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? "") || sha256(bytes) !== expectedSha256) {
    throw new Error("Plan digest must match the reviewed prepare artifact");
  }
  const current = await inventory(directory);
  if (JSON.stringify(current) !== bytes.toString()) throw new Error("Snapshot inventory does not match approved plan");
  return current;
}

export async function prepare(directory) {
  await mkdir(directory, { recursive: true });
  for (const name of loadSources) {
    const exists = await stat(path.join(directory, `${name}.receipt.json`)).catch(() => null);
    if (!exists) await fetchSnapshot(name, directory);
  }
  const plan = JSON.stringify(await inventory(directory));
  const existing = await readFile(path.join(directory, planName), "utf8").catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (existing !== undefined && existing !== plan) throw new Error("Existing plan differs; use a new prepare directory");
  if (existing === undefined) await writeFile(path.join(directory, planName), plan, { flag: "wx", mode: 0o600 });
  return { planSha256: sha256(plan), ...JSON.parse(plan) };
}

export async function verifyStagedSource(layer, sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" || !url.pathname.split("/").includes(layer.cleanSha256)) {
    throw new Error("Shared source URL must use an HTTPS content-addressed key");
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error("Staged source unavailable");
  const digest = createHash("sha256");
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > layer.bytes) throw new Error("Staged source exceeds reviewed size");
    digest.update(chunk);
  }
  if (bytes !== layer.bytes || digest.digest("hex") !== layer.cleanSha256) {
    throw new Error("Staged source checksum does not match reviewed snapshot");
  }
}

async function stageMissing(env, options, planned, expectedSha256) {
  const { name, directory, connection } = options;
  if (!options.sourceUrl || new URL(options.sourceUrl).protocol !== "https:") {
    throw new Error("Shared imports require a staged HTTPS source URL");
  }
  await verifyStagedSource(planned, options.sourceUrl);
  options.runId = randomUUID().replaceAll("-", "");
  // Persist before mutation so interrupted imports require reconciliation.
  await writeFile(path.join(directory, `${name}.intent.json`), JSON.stringify({ name, connection,
    baseUrl: env.baseUrl, expectedSha256, runId: options.runId,
    tableName: stagingTableName(name, options.runId), serviceName: stagingServiceName(name, options.runId),
    startedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  const staged = await stageSnapshot(env, options);
  await saveDeployment(env, { staged, directory, connection });
}

export async function runSharedLoad(action, directory, expectedSha256, env) {
  if (!["stage", "activate", "rollback"].includes(action)) throw new Error("Unknown shared load action");
  const plan = await verifyPlan(directory, expectedSha256);
  if (action === "stage") await ensureDepartments(env);
  const connectionResponse = await adminFetch(env, { method: "GET", apiPath: "/api/v1/admin/connections" });
  const connections = connectionResponse?.data?.items ?? connectionResponse?.data;
  const matches = connections?.filter((connection) => connection.name === "demo-rds");
  if (matches?.length !== 1 || !matches[0].connectionId) throw new Error("Expected exactly one demo-rds managed import connection");
  const connection = matches[0].connectionId;
  if (action === "activate") {
    for (const { name } of plan.layers) {
      const receipt = await readDeployment(env, { name, directory });
      if (receipt.connection !== connection) throw new Error("Managed import connection changed");
      await verifyLayer(env, receipt);
    }
  }
  for (const planned of plan.layers) {
    const { name } = planned;
    const options = { name, directory, connection, sourceUrl: env.importSourceUrls?.[name] };
    const existing = await stat(path.join(directory, `${name}.deployment.json`)).catch(() => null);
    if (!existing && action === "rollback") {
      if (await stat(path.join(directory, `${name}.intent.json`)).catch(() => null)) {
        throw new Error("Intent without receipt: reconcile the interrupted stage in Console");
      }
      continue;
    }
    if (!existing) {
      if (action !== "stage") throw new Error("Stage receipt missing; activation refused");
      await stageMissing(env, options, planned, expectedSha256);
    }
    const receipt = await readDeployment(env, options);
    if (receipt.connection !== connection) throw new Error("Managed import connection changed");
    await verifyLayer(env, receipt);
    if (action === "activate") await activateDeployment(env, options);
    if (action === "rollback") {
      await adminFetch(env, { method: "PUT",
        apiPath: `${layersPath(connection)}/${receipt.layerId}/enabled?serviceName=${encodeURIComponent(receipt.serviceName)}`,
        body: { enabled: false } });
      const { layer } = await verifyLayer(env, receipt);
      if (layer.enabled !== false) throw new Error("Rollback disable not confirmed");
    }
  }
  return { action, planSha256: expectedSha256, layers: plan.layers };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, directory, digest, ...extra] = process.argv.slice(2);
    if (!directory || extra.length) throw new Error("Usage: shared-load.mjs prepare|stage|activate|rollback <directory> [plan-sha256]");
    const env = action === "prepare" ? undefined : serverEnv();
    if (env && process.env.HONUA_SAMPLE_IMPORT_URLS_FILE) {
      env.importSourceUrls = JSON.parse(await readFile(process.env.HONUA_SAMPLE_IMPORT_URLS_FILE, "utf8"));
    }
    const result = action === "prepare" ? await prepare(directory)
      : await runSharedLoad(action, directory, digest, env);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    // Do not echo HTTP bodies: the shared stack can include sensitive details.
    process.stderr.write(`Shared load stopped: ${error.code === "EEXIST" ? "existing intent or artifact; inspect receipts and reconcile before retry" : "validation or server operation failed; inspect Console and retained receipts"}\n`);
    process.exitCode = 1;
  }
}
