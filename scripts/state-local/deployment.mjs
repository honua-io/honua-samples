import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { adminFetch } from "../lib/admin-api.mjs";
import { layersPath, listLayers } from "./import.mjs";
import { readSnapshot } from "./snapshot.mjs";
import { getSource } from "./sources.mjs";

function receiptPath(directory, name) {
  getSource(name);
  return path.join(directory, `${name}.deployment.json`);
}

function serverUrl(env) {
  const url = new URL(env.baseUrl);
  if (url.username || url.password || url.search || url.hash) throw new Error("Server URL must not contain credentials, query or fragment");
  return url.href.replace(/\/+$/, "");
}

function servicePath(serviceName) {
  return `/api/v1/admin/services/${encodeURIComponent(serviceName)}`;
}

export async function verifyLayer(env, receipt) {
  const layers = await listLayers(env, receipt.connection, receipt.serviceName);
  const matches = layers.filter((layer) => layer.layerId === receipt.layerId);
  const layer = matches.length === 1 ? matches[0] : null;
  if (!layer || layer.serviceName !== receipt.serviceName || layer.schema !== receipt.schema
    || layer.table !== receipt.table || !layer.description?.includes(`SHA-256 ${receipt.cleanSha256}`)) {
    throw new Error("Published layer no longer matches the import receipt");
  }
  const services = await adminFetch(env, { method: "GET", apiPath: `/api/v1/admin/services/?q=${encodeURIComponent(receipt.serviceName)}` });
  const service = services?.data?.items?.find((entry) => entry.serviceName === receipt.serviceName);
  if (service?.folderId !== receipt.folderId) throw new Error("Published service no longer belongs to the receipt department folder");
  if (!service.folderName || !service.publicName) throw new Error("Published service lacks a public department path");
  return { layer, service };
}

export async function saveDeployment(env, options) {
  const { staged, directory, connection } = options;
  const { receipt } = await readSnapshot(staged.source, directory);
  if (!connection || staged.enabled !== false || staged.cleanSha256 !== receipt.cleanSha256
    || !Number.isInteger(staged.layerId) || !staged.serviceName || !staged.folderId) {
    throw new Error("Deployment requires a disabled layer and matching snapshot receipt");
  }
  const deployment = { ...staged, format: "honua.samples.deployment.v1", connection,
    baseUrl: serverUrl(env), createdAt: new Date().toISOString() };
  const { layer } = await verifyLayer(env, deployment);
  if (layer.enabled !== false) throw new Error("Deployment layer must remain disabled before activation");
  await writeFile(receiptPath(directory, staged.source), JSON.stringify(deployment, null, 2), { mode: 0o600, flag: "wx" });
  return deployment;
}

export async function readDeployment(env, options) {
  const { name, directory } = options;
  const deployment = JSON.parse(await readFile(receiptPath(directory, name), "utf8"));
  const { receipt } = await readSnapshot(name, directory);
  if (deployment.format !== "honua.samples.deployment.v1" || deployment.source !== name
    || deployment.baseUrl !== serverUrl(env) || deployment.cleanSha256 !== receipt.cleanSha256
    || !deployment.connection || !Number.isInteger(deployment.layerId) || deployment.layerId < 0
    || !deployment.serviceName || !deployment.schema || !deployment.table || !deployment.folderId) {
    throw new Error("Deployment receipt does not match this server and snapshot");
  }
  return deployment;
}

async function accessPolicy(env, receipt) {
  const response = await adminFetch(env, { method: "GET",
    apiPath: `${servicePath(receipt.serviceName)}/settings` });
  return response?.data?.accessPolicy;
}

function publicReadOnly(policy) {
  return policy?.allowAnonymous === true && policy.allowAnonymousWrite === false;
}

export async function activateDeployment(env, options) {
  const receipt = await readDeployment(env, options);
  const { layer: current } = await verifyLayer(env, receipt);
  if (!publicReadOnly(await accessPolicy(env, receipt))) {
    await adminFetch(env, { method: "PUT",
      apiPath: `${servicePath(receipt.serviceName)}/access-policy`,
      body: { allowAnonymous: true, allowAnonymousWrite: false } });
  }
  if (current.enabled !== true) {
    await adminFetch(env, { method: "PUT",
      apiPath: `${layersPath(receipt.connection)}/${receipt.layerId}/enabled?serviceName=${encodeURIComponent(receipt.serviceName)}`,
      body: { enabled: true } });
  }
  return activeDeployment(env, options);
}

export async function activeDeployment(env, options) {
  const receipt = await readDeployment(env, options);
  const { layer: activated, service } = await verifyLayer(env, receipt);
  if (activated.enabled !== true) throw new Error("Layer activation was not confirmed");
  if (!publicReadOnly(await accessPolicy(env, receipt))) throw new Error("Public read-only access was not confirmed");
  const layerUrl = `${receipt.baseUrl}/rest/services/${encodeURIComponent(service.folderName)}/${encodeURIComponent(service.publicName)}/FeatureServer/${receipt.layerId}`;
  const response = await fetch(`${layerUrl}?f=json`);
  const metadata = response.ok ? await response.json() : null;
  if (metadata?.id !== receipt.layerId || metadata.error) throw new Error("Anonymous public layer URL was not confirmed");
  return { ...receipt, enabled: true, layerUrl };
}
