import { generateExercise, readExercise } from "./exercise.mjs";
import { fetchMauiSnapshot, readMauiSnapshot } from "./maui-snapshot.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanRows } from "./clean.mjs";
import { getSource, sourceCrs, coverageBounds } from "./sources.mjs";

const pageSize = 1000;
const previewLimit = 5000;
const portal = "https://data.nola.gov";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}: ${url}`);
  return response.json();
}

function revision(metadata, source) {
  if ((metadata.licenseId ?? null) !== source.license) throw new Error("Source license changed; review terms before fetching");
  if (!metadata.rowsUpdatedAt) throw new Error("Source lacks a data revision timestamp");
  return JSON.stringify([metadata.rowsUpdatedAt, metadata.viewLastModified, metadata.licenseId]);
}

function recordsUrl(source, offset) {
  const geometryFields = source.geometry.field ? [source.geometry.field]
    : [source.geometry.longitude, source.geometry.latitude];
  const url = new URL(`/resource/${source.id}.json`, portal);
  url.searchParams.set("$select", [":id", ...source.fields, ...geometryFields].join(","));
  url.searchParams.set("$order", ":id");
  url.searchParams.set("$limit", String(pageSize));
  url.searchParams.set("$offset", String(offset));
  return url;
}

function provenance(source) {
  return { department: source.department, licenseUrl: source.licenseUrl,
    metadataUrl: `${portal}/api/views/${source.id}.json`,
    attribution: source.attribution, sourceCrs, outputCrs: sourceCrs, coverageBounds,
    selection: { kind: "ordered-preview", order: ":id", limit: previewLimit, completeDataset: false } };
}

async function downloadRows(source) {
  const rows = [];
  const requests = [];
  const seen = new Set();
  for (let offset = 0; offset < previewLimit; offset += pageSize) {
    const url = recordsUrl(source, offset);
    const page = await fetchJson(url);
    if (!Array.isArray(page)) throw new Error("Source did not return a record array");
    if (page.length > pageSize) throw new Error("Source exceeded the requested page size");
    for (const row of page) {
      if (!row[":id"] || seen.has(row[":id"])) throw new Error("Source has missing or duplicate row IDs");
      seen.add(row[":id"]);
    }
    rows.push(...page);
    requests.push(String(url));
    if (page.length < pageSize) return { rows, requests };
  }
  return { rows, requests };
}

export async function fetchSnapshot(name, directory) {
  const source = getSource(name);
  if (source.synthetic) return generateExercise({ name, directory, source });
  if (source.url) return fetchMauiSnapshot({ name, directory, source });
  const metadataUrl = `${portal}/api/views/${source.id}.json`;
  const metadata = await fetchJson(metadataUrl);
  const initialRevision = revision(metadata, source);
  const { rows, requests } = await downloadRows(source);
  if (revision(await fetchJson(metadataUrl), source) !== initialRevision) throw new Error("Source changed during pagination; discard and retry");
  const { geojson, rejected } = cleanRows(rows, source);
  if (!geojson.features.length) throw new Error("Snapshot has no valid features");
  const raw = JSON.stringify(rows);
  const clean = JSON.stringify(geojson);
  const metadataText = JSON.stringify(metadata);
  const receipt = {
    source: name, dataset: source.id, ...provenance(source), requests,
    retrievedAt: new Date().toISOString(), sourceRevision: initialRevision,
    downloaded: rows.length, rejected, accepted: geojson.features.length,
    rawSha256: sha256(raw), cleanSha256: sha256(clean), metadataSha256: sha256(metadataText),
  };
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${name}.raw.json`), raw, { mode: 0o600, flag: "wx" });
  await writeFile(path.join(directory, `${name}.geojson`), clean, { mode: 0o600, flag: "wx" });
  await writeFile(path.join(directory, `${name}.metadata.json`), metadataText, { mode: 0o600, flag: "wx" });
  await writeFile(path.join(directory, `${name}.receipt.json`), JSON.stringify(receipt, null, 2), { mode: 0o600, flag: "wx" });
  return receipt;
}

function checkProvenance(receipt, source, rows) {
  const expected = provenance(source);
  const pageCount = Math.min(previewLimit / pageSize, Math.floor((Array.isArray(rows) ? rows.length : 0) / pageSize) + 1);
  expected.requests = Array.from({ length: pageCount }, (_, index) => String(recordsUrl(source, index * pageSize)));
  const timestamp = Date.parse(receipt.retrievedAt);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== receipt.retrievedAt) {
    throw new Error("Snapshot provenance mismatch");
  }
  if (!Array.isArray(rows) || rows.length > previewLimit || receipt.downloaded !== rows.length
    || Object.entries(expected).some(([key, value]) => JSON.stringify(receipt[key]) !== JSON.stringify(value))) {
    throw new Error("Snapshot provenance mismatch");
  }
  const ids = rows.map((row) => row[":id"]);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error("Snapshot row IDs are missing or duplicated");
}

export async function readSnapshot(name, directory) {
  const mauiSource = getSource(name);
  if (mauiSource.synthetic) return readExercise({ name, directory, source: mauiSource });
  if (mauiSource.url) return readMauiSnapshot({ name, directory, source: mauiSource });
  const receipt = JSON.parse(await readFile(path.join(directory, `${name}.receipt.json`), "utf8"));
  const raw = await readFile(path.join(directory, `${name}.raw.json`), "utf8");
  const clean = await readFile(path.join(directory, `${name}.geojson`), "utf8");
  const metadata = await readFile(path.join(directory, `${name}.metadata.json`), "utf8");
  const source = getSource(name);
  if (receipt.source !== name || receipt.dataset !== source.id) throw new Error("Snapshot source mismatch");
  if (sha256(raw) !== receipt.rawSha256 || sha256(clean) !== receipt.cleanSha256
    || sha256(metadata) !== receipt.metadataSha256) throw new Error("Snapshot checksum mismatch");
  if (revision(JSON.parse(metadata), source) !== receipt.sourceRevision) throw new Error("Snapshot revision mismatch");
  const rows = JSON.parse(raw);
  checkProvenance(receipt, source, rows);
  const rebuilt = cleanRows(rows, source);
  if (JSON.stringify(rebuilt.geojson) !== clean || rebuilt.rejected !== receipt.rejected) throw new Error("Snapshot cleaning no longer matches receipt");
  if (rebuilt.geojson.features.length !== receipt.accepted || receipt.accepted === 0) throw new Error("Snapshot feature count mismatch");
  return { receipt, geojson: rebuilt.geojson };
}
