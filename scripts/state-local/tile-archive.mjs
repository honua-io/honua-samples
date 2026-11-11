import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { adminFetch } from '../lib/admin-api.mjs';
import { sha256 } from '../lib/checksum.mjs';

export const maximumArchiveBytes = 100_000_000;
const jobsPath = '/api/v1/admin/tile-operations/jobs';
const maximumTiles = 5_000;

async function tileOperation(env, request) {
  const response = await adminFetch(env, request);
  return Object.fromEntries(Object.entries(response).map(([key, value]) => [key[0].toLowerCase() + key.slice(1), value]));
}

function tileY(latitude, scale) {
  return Math.floor((1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * scale);
}

export function archiveTileCount({ bbox, minZoom, maxZoom }) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)
    || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]
    || bbox[0] <= -180 || bbox[2] >= 180 || bbox[1] <= -85 || bbox[3] >= 85
    || !Number.isInteger(minZoom) || !Number.isInteger(maxZoom)
    || minZoom < 0 || maxZoom > 22 || minZoom > maxZoom) throw new Error('Invalid tile archive extent or zoom range');
  let total = 0;
  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const scale = 2 ** zoom;
    const west = Math.floor((bbox[0] + 180) / 360 * scale);
    const east = Math.floor((bbox[2] + 180) / 360 * scale);
    total += (east - west + 1) * (tileY(bbox[1], scale) - tileY(bbox[3], scale) + 1);
  }
  if (total > maximumTiles) throw new Error(`Archive needs ${total} tiles; default server limit is ${maximumTiles}`);
  return total;
}

function assertCompletedArchive(job, expectedTiles) {
  if (job.totalTiles !== expectedTiles || job.processedTiles !== expectedTiles
    || job.failedTiles !== 0 || !(job.successfulTiles > 0) || job.successfulTiles > expectedTiles
    || !Array.isArray(job.warnings) || job.warnings.length) throw new Error('Archive coverage is incomplete or has warnings');
  if (!Number.isSafeInteger(job.archiveSizeBytes) || job.archiveSizeBytes < 127
    || job.archiveSizeBytes > maximumArchiveBytes) throw new Error('Archive exceeds the approved size budget or has an invalid size');
}

async function completedArchive(env, jobId) {
  const apiPath = `${jobsPath}/${encodeURIComponent(jobId)}`;
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const job = await tileOperation(env, { method: 'GET', apiPath });
    if ([2, 'Completed'].includes(job.status)) return job;
    if ([3, 4, 'Failed', 'Cancelled'].includes(job.status)) throw new Error('Tile archive failed; inspect the server job');
    await setTimeout(2_000);
  }
  throw new Error('Tile archive still pending; inspect the server before retrying');
}

async function localArchive(url, storageRoot) {
  if (!storageRoot) throw new Error('Local archive requires an explicit shared HONUA_TILE_STORAGE_ROOT');
  const root = await realpath(storageRoot);
  const filename = await realpath(fileURLToPath(url));
  const relative = path.relative(root, filename);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Archive is outside the shared storage root');
  }
  if ((await stat(filename)).size > maximumArchiveBytes) throw new Error('Archive exceeds the approved size budget');
  return readFile(filename);
}

async function remoteArchive(url) {
  if (url.protocol !== 'https:') throw new Error('Remote archive download must use HTTPS');
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`Archive download failed: HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maximumArchiveBytes) throw new Error('Archive exceeds the approved size budget');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readTileArchive(job, options) {
  assertCompletedArchive(job, options.expectedTiles);
  const url = new URL(job.downloadUrl);
  const bytes = url.protocol === 'file:' ? await localArchive(url, options.localStorageRoot) : await remoteArchive(url);
  if (bytes.length !== job.archiveSizeBytes || bytes.toString('ascii', 0, 7) !== 'PMTiles' || bytes[7] !== 3) {
    throw new Error('Archive size or PMTiles v3 header does not match the completed export');
  }
  return { bytes, receipt: { jobId: job.jobId, layerId: job.layerId, totalTiles: job.totalTiles,
    writtenTiles: job.successfulTiles, sizeBytes: bytes.length, sha256: sha256(bytes) } };
}

export async function exportTileArchive(env, options) {
  const expectedTiles = archiveTileCount(options);
  const { serviceId, layerId, bbox, minZoom, maxZoom } = options;
  const started = await tileOperation(env, { method: 'POST', apiPath: jobsPath,
    body: { Operation: 'archive', ServiceId: serviceId, LayerId: layerId, Bbox: bbox,
      MinZoom: minZoom, MaxZoom: maxZoom, MaxTiles: expectedTiles } });
  if (typeof started.jobId !== 'string' || !started.jobId) throw new Error('Tile archive did not return a job ID');
  const job = await completedArchive(env, started.jobId);
  const result = await readTileArchive(job, { expectedTiles, localStorageRoot: options.localStorageRoot });
  return { ...result, receipt: { ...result.receipt, bbox, minZoom, maxZoom } };
}
