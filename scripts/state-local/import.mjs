import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { adminFetch } from "../lib/admin-api.mjs";
import { getSource } from "./sources.mjs";
import { readSnapshot } from "./snapshot.mjs";

async function publishedLayer(env, publication) {
  const { response, connection, serviceName } = publication;
  if (!response?.data?.jobId) return response?.data;
  const root = `/api/v1/admin/connections/${encodeURIComponent(connection)}/layers`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const job = await adminFetch(env, { method: "GET", apiPath: `${root}/jobs/${encodeURIComponent(response.data.jobId)}` });
    if (["Failed", "Cancelled"].includes(job?.data?.status)) throw new Error("Layer publication failed; inspect Console before retrying");
    if (job?.data?.status === "Completed") {
      const layers = await adminFetch(env, { method: "GET", apiPath: `${root}?serviceName=${encodeURIComponent(serviceName)}` });
      return layers?.data?.find((layer) => layer.layerId === job.data.layerId);
    }
    await setTimeout(500);
  }
  throw new Error("Layer publication still pending; inspect Console before retrying");
}

export async function stageSnapshot(env, options) {
  const { name, directory, connection } = options;
  if (!connection) throw new Error("HONUA_SAMPLE_CONNECTION must name this server's managed import database");
  const source = getSource(name);
  const { receipt, geojson } = await readSnapshot(name, directory);
  const runId = randomUUID().replaceAll("-", "");
  const tableName = `demo_${name}_${runId}`;
  const serviceName = `${source.department}/${name}-${runId}`;
  const form = new FormData();
  form.set("file", new Blob([JSON.stringify(geojson)], { type: "application/geo+json" }), `${name}.geojson`);
  form.set("TableName", tableName);
  const uploaded = await adminFetch(env, { method: "POST", apiPath: "/api/v1/admin/import/upload", body: form });
  if (uploaded?.featureCount !== receipt.accepted || !uploaded.physicalTableName) throw new Error("Import did not confirm the snapshot table and feature count");
  const published = await adminFetch(env, {
    method: "POST", apiPath: `/api/v1/admin/connections/${encodeURIComponent(connection)}/layers`,
    body: {
      schema: uploaded.schema ?? "honua_data", table: uploaded.physicalTableName,
      layerName: name, serviceName, srid: 4326, enabled: false,
      license: source.license === "CC0_10" ? "CC0-1.0" : undefined,
      licenseUrl: source.licenseUrl, attribution: source.attribution,
      sourceUrl: `https://data.nola.gov/d/${source.id}`,
      description: `Ordered preview, at most ${receipt.selection.limit} source rows; not a complete dataset. SHA-256 ${receipt.cleanSha256}`,
    },
  });
  const layer = await publishedLayer(env, { response: published, connection, serviceName });
  if (!Number.isInteger(layer?.layerId) || layer.enabled !== false) {
    throw new Error("Publish did not confirm a disabled layer; inspect Console before retrying");
  }
  return { source: name, serviceName, layerId: layer.layerId, enabled: false,
    schema: uploaded.schema ?? "honua_data", table: uploaded.physicalTableName, cleanSha256: receipt.cleanSha256 };
}
