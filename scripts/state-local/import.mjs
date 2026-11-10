import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { adminFetch } from "../lib/admin-api.mjs";
import { getSource } from "./sources.mjs";
import { readSnapshot } from "./snapshot.mjs";

// Keep the full random suffix while respecting the server's 64-character limit.
export function stagingServiceName(name, runId) {
  return `${name.slice(0, 31).replace(/-+$/, "")}-${runId}`;
}

export function stagingTableName(name, runId) {
  return `demo_${name.replaceAll("-", "_").slice(0, 25).replace(/_+$/, "")}_${runId}`;
}

export function layersPath(connection) {
  return `/api/v1/admin/connections/${encodeURIComponent(connection)}/layers`;
}

export async function listLayers(env, connection, serviceName) {
  const response = await adminFetch(env, { method: "GET",
    apiPath: `${layersPath(connection)}?serviceName=${encodeURIComponent(serviceName)}` });
  return response?.data?.items ?? response?.data ?? [];
}

async function publishedLayer(env, publication) {
  const { response, connection, serviceName } = publication;
  if (!response?.data?.jobId) return response?.data;
  const root = layersPath(connection);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const job = await adminFetch(env, { method: "GET", apiPath: `${root}/jobs/${encodeURIComponent(response.data.jobId)}` });
    if (["Failed", "Cancelled"].includes(job?.data?.status)) throw new Error("Layer publication failed; inspect Console before retrying");
    if (job?.data?.status === "Completed") {
      const layers = await listLayers(env, connection, serviceName);
      return layers.find((layer) => layer.layerId === job.data.layerId);
    }
    await setTimeout(500);
  }
  throw new Error("Layer publication still pending; inspect Console before retrying");
}

async function completedUpload(env, uploaded) {
  if (!uploaded?.jobId) return uploaded;
  const apiPath = `/api/v1/admin/import/jobs/${encodeURIComponent(uploaded.jobId)}`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const job = await adminFetch(env, { method: "GET", apiPath });
    if ([3, 4, "Failed", "Cancelled"].includes(job?.status)) {
      throw new Error(`Import failed or cancelled; inspect Console job ${uploaded.jobId} before retrying`);
    }
    if ([2, "Completed"].includes(job?.status)) {
      throw new Error(`Import completed but lacks a physical table receipt; inspect Console job ${uploaded.jobId} before publishing manually`);
    }
    await setTimeout(500);
  }
  throw new Error(`Import still pending; inspect Console job ${uploaded.jobId} before retrying`);
}

async function departmentFolder(env, department) {
  const folders = await adminFetch(env, { method: "GET", apiPath: "/api/v1/admin/folders" });
  const matches = folders?.data?.filter((folder) => !folder.deleted
    && folder.metadata?.title === department && typeof folder.metadata?.id === "string"
    && folder.metadata.id.length > 0);
  if (matches?.length !== 1) throw new Error(`Create exactly one ${department} department folder in Console before staging`);
  return matches[0].metadata.id;
}

export async function uploadSnapshotTable(env, snapshot) {
  const form = new FormData();
  form.set("file", new Blob([JSON.stringify(snapshot.geojson)], { type: "application/geo+json" }), "snapshot.geojson");
  form.set("TableName", snapshot.tableName);
  const uploaded = await completedUpload(env,
    await adminFetch(env, { method: "POST", apiPath: "/api/v1/admin/import/upload", body: form }));
  if (uploaded?.featureCount !== snapshot.geojson.features.length || !uploaded.physicalTableName) {
    throw new Error("Import did not confirm the snapshot table and feature count");
  }
  return uploaded;
}

export async function stageSnapshot(env, options) {
  const { name, directory, connection } = options;
  if (!connection) throw new Error("HONUA_SAMPLE_CONNECTION must name this server's managed import database");
  const source = getSource(name);
  const { receipt, geojson } = await readSnapshot(name, directory);
  const folderId = await departmentFolder(env, source.department);
  const runId = randomUUID().replaceAll("-", "");
  const tableName = stagingTableName(name, runId);
  const serviceName = stagingServiceName(name, runId);
  const uploaded = await uploadSnapshotTable(env, { tableName, geojson });
  const published = await adminFetch(env, {
    method: "POST", apiPath: layersPath(connection),
    body: {
      schema: uploaded.schema ?? "honua_data", table: uploaded.physicalTableName,
      layerName: name, serviceName, folderId, srid: 4326, enabled: false,
      license: source.license === "public-domain" ? "LicenseRef-Hawaii-Statewide-GIS-Public-Domain"
        : source.license === "CC0_10" ? "CC0-1.0" : source.license ?? undefined,
      licenseUrl: source.licenseUrl, attribution: source.attribution,
      sourceUrl: source.url ?? `https://data.nola.gov/d/${source.id}`,
      description: `${receipt.selection.kind}; ${receipt.accepted} accepted, ${receipt.rejected} rejected. SHA-256 ${receipt.cleanSha256}`,
    },
  });
  const layer = await publishedLayer(env, { response: published, connection, serviceName });
  if (!Number.isInteger(layer?.layerId) || layer.enabled !== false) {
    throw new Error("Publish did not confirm a disabled layer; inspect Console before retrying");
  }
  return { source: name, serviceName, folderId, layerId: layer.layerId, enabled: false,
    schema: uploaded.schema ?? "honua_data", table: uploaded.physicalTableName, cleanSha256: receipt.cleanSha256 };
}
