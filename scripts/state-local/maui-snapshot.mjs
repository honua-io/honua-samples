import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanRows } from './clean.mjs';
import { sha256 } from '../lib/checksum.mjs';
import { download, fetchJson } from './download.mjs';

const pageSize = 100;
const maximumFeatures = 100_000;
const policyStatement = 'The contents of this web page are public domain';

async function json(url) {
  const data = await fetchJson(url);
  if (data.error) throw new Error(`Source query failed: ${data.error.message}`);
  return data;
}

function queryUrl(source, parameters) {
  const url = new URL(`${source.url}/query`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  return String(url);
}

async function selectedIds(source) {
  const response = await json(queryUrl(source, {
    f: 'json', where: source.where ?? '1=1', returnIdsOnly: true, geometry: source.bounds.join(','),
    geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects',
  }));
  const ids = response.objectIds;
  if (!Array.isArray(ids) || !ids.every(Number.isSafeInteger) || new Set(ids).size !== ids.length
    || ids.length > maximumFeatures || response.exceededTransferLimit) throw new Error('Invalid or truncated source ID selection');
  return ids.sort((left, right) => left - right);
}

function nativeSpatialReference(metadata) {
  const reference = metadata.extent?.spatialReference;
  if ((reference?.latestWkid ?? reference?.wkid) !== 3750) throw new Error("Unexpected source CRS; review before downloading");
  return reference;
}

function pageUrl(source, batch) {
  return queryUrl(source, { f: "geojson", objectIds: batch.join(","),
    outFields: source.fields.join(","), returnGeometry: true, outSR: 4326, ...source.displayGeometry });
}

function pageBatches(source, ids) {
  return Array.from({ length: Math.ceil(ids.length / pageSize) }, (_, index) => {
    const batch = ids.slice(index * pageSize, (index + 1) * pageSize);
    return { batch, url: pageUrl(source, batch) };
  });
}

function metadataFingerprint(metadata) {
  return JSON.stringify([metadata.extent?.spatialReference, metadata.fields, metadata.editingInfo ?? null,
    metadata.name, metadata.copyrightText]);
}

function provenance(source) {
  return { dataset: source.id, department: source.department, license: source.license,
    licenseUrl: source.licenseUrl, metadataUrl: source.metadataUrl, sourceUrl: source.url,
    attribution: source.attribution, ...(source.dataVintage ? { dataVintage: source.dataVintage } : {}),
    outputCrs: 'EPSG:4326', coverageBounds: source.bounds,
    displayGeometry: { ...source.displayGeometry, warning: 'Display geometry generalized in output degrees (approximately two metres); not legal boundaries or survey measurements' },
    datumTransformation: 'No explicit datum transformation requested; server default NAD83 to WGS84 may differ by approximately one metre',
    selection: { kind: 'Maui Nui envelope intersection; whole features; not a county boundary clip',
      bounds: source.bounds, ...(source.where ? { where: source.where } : {}), completeDataset: false, pageSize } };
}

async function downloadRows(source, ids) {
  const rows = [];
  const requests = [];
  for (const { batch, url } of pageBatches(source, ids)) {
    const data = await json(url);
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.exceededTransferLimit
      || (data.crs && !['urn:ogc:def:crs:OGC:1.3:CRS84', 'urn:ogc:def:crs:EPSG::4326'].includes(data.crs.properties?.name))) {
      throw new Error('Source did not return an untruncated GeoJSON feature collection');
    }
    const received = data.features.map((feature) => feature.properties?.objectid);
    if (received.length !== batch.length || new Set(received).size !== batch.length
      || received.some((id) => !batch.includes(id))) throw new Error('Source page has missing, duplicate or unexpected IDs');
    rows.push(...data.features.map((feature) => ({ ...feature.properties,
      ':id': String(feature.properties.objectid), the_geom: feature.geometry })));
    requests.push(url);
  }
  return { rows: rows.sort((left, right) => Number(left[':id']) - Number(right[':id'])), requests };
}

export async function fetchMauiSnapshot(options) {
  const { name, directory, source } = options;
  const metadata = await json(`${source.url}?f=json`);
  nativeSpatialReference(metadata);
  const policy = await download(source.licenseUrl);
  if (!policy.toString().includes(policyStatement)) throw new Error('Source public-domain terms changed; review before downloading');
  const summary = await download(source.metadataUrl);
  const ids = await selectedIds(source);
  const { rows, requests } = await downloadRows(source, ids);
  if (JSON.stringify(ids) !== JSON.stringify(await selectedIds(source))
    || metadataFingerprint(metadata) !== metadataFingerprint(await json(`${source.url}?f=json`))) {
    throw new Error('Source changed during download; discard and retry');
  }
  const cleaned = cleanRows(rows, source);
  if (!cleaned.geojson.features.length) throw new Error('Snapshot has no valid features');
  const files = { raw: JSON.stringify(rows), geojson: JSON.stringify(cleaned.geojson),
    metadata: JSON.stringify(metadata), policy, summary };
  const receipt = { source: name, ...provenance(source), requests, selectedIds: ids,
    retrievedAt: new Date().toISOString(), sourceCrs: nativeSpatialReference(metadata),
    consistency: 'ID set and exposed metadata checked before/after; attribute changes may be undetectable without editingInfo',
    downloaded: rows.length, accepted: cleaned.geojson.features.length, rejected: cleaned.rejected,
    hashes: Object.fromEntries(Object.entries(files).map(([key, value]) => [key, sha256(value)])),
    cleanSha256: sha256(files.geojson) };
  await mkdir(directory, { recursive: true });
  for (const [key, value] of Object.entries(files)) {
    await writeFile(path.join(directory, `${name}.${key}`), value, { flag: 'wx', mode: 0o600 });
  }
  await writeFile(path.join(directory, `${name}.receipt.json`), JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
  return receipt;
}

export async function readMauiSnapshot(options) {
  const { name, directory, source } = options;
  const receipt = JSON.parse(await readFile(path.join(directory, `${name}.receipt.json`), 'utf8'));
  const files = {};
  for (const key of ['raw', 'geojson', 'metadata', 'policy', 'summary']) {
    files[key] = await readFile(path.join(directory, `${name}.${key}`));
    if (sha256(files[key]) !== receipt.hashes?.[key]) throw new Error('Snapshot checksum mismatch');
  }
  if (receipt.source !== name || Object.entries(provenance(source))
    .some(([key, value]) => JSON.stringify(receipt[key]) !== JSON.stringify(value))) throw new Error('Snapshot provenance mismatch');
  const metadata = JSON.parse(files.metadata);
  const rows = JSON.parse(files.raw);
  const ids = rows.map((row) => Number(row[':id']));
  nativeSpatialReference(metadata);
  if (!Array.isArray(receipt.selectedIds) || ids.some((id) => !Number.isSafeInteger(id))
    || new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify(receipt.selectedIds)
    || rows.length > maximumFeatures || receipt.downloaded !== rows.length
    || ids.some((id, index) => id !== rows[index].objectid || (index > 0 && id <= ids[index - 1]))
    || JSON.stringify(receipt.requests) !== JSON.stringify(pageBatches(source, ids).map(({ url }) => url))
    || JSON.stringify(receipt.sourceCrs) !== JSON.stringify(metadata.extent?.spatialReference)
    || !files.policy.toString().includes(policyStatement) || !Number.isFinite(Date.parse(receipt.retrievedAt))) {
    throw new Error('Snapshot provenance mismatch');
  }
  const rebuilt = cleanRows(rows, source);
  const clean = JSON.stringify(rebuilt.geojson);
  if (clean !== files.geojson.toString() || rebuilt.rejected !== receipt.rejected
    || rebuilt.geojson.features.length !== receipt.accepted || !receipt.accepted
    || sha256(clean) !== receipt.cleanSha256) throw new Error('Snapshot cleaning no longer matches receipt');
  return { receipt, geojson: rebuilt.geojson };
}
