// Run against an installed server; output is an ignored deployment artifact, never a fixture.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { validateManifest, publicUrl, resultRows, sha256 } from '../../shared/state-local/workbench-analytics.mjs';

const [manifestFile, output] = process.argv.slice(2);
if (!manifestFile || !output || !process.env.HONUA_ANALYSIS_SERVER_IMAGE) {
  throw new Error('Usage: HONUA_ANALYSIS_SERVER_IMAGE=<digest> node scripts/state-local/record-workbench-analysis.mjs <manifest.json> <artifact-directory>');
}
const manifest = validateManifest(JSON.parse(await readFile(manifestFile, 'utf8')));
const base = process.env.HONUA_ANALYSIS_SERVER ?? 'https://demo.honua.io';
const recordings = {};

async function record(key, config) {
  const request = config.request;
  if (!request || !['GET', 'POST'].includes(request.method)) throw new Error(`${key}: a real GET/POST server request is required`);
  const headers = { Accept: 'application/geo+json, application/json' };
  if (process.env.HONUA_ANALYSIS_API_KEY) headers['X-API-Key'] = process.env.HONUA_ANALYSIS_API_KEY;
  if (request.method === 'POST') headers['Content-Type'] = 'application/json';
  const response = await fetch(publicUrl(request.url, base), { method: request.method, headers, signal: AbortSignal.timeout(120000),
    ...(request.method === 'POST' ? { body: JSON.stringify(request.body ?? {}) } : {}) });
  if (!response.ok) throw new Error(`${key}: real server returned HTTP ${response.status}; no recording was produced`);
  const raw = await response.text();
  const rows = resultRows(JSON.parse(raw), key, config.cellLimit);
  const envelope = { raw, sha256: await sha256(raw), datasetSha256: manifest.dataset.sha256, request,
    createdAt: new Date().toISOString(), serverImage: process.env.HONUA_ANALYSIS_SERVER_IMAGE };
  await writeFile(path.join(output, `${key}.json`), JSON.stringify(envelope, null, 2) + '\n');
  recordings[key] = { recording: `${key}.json`, ...(key === 'h3' ? { cellLimit: config.cellLimit } : {}) };
  console.log(`${key}: recorded ${rows.length} real server rows (${envelope.sha256})`);
}

await mkdir(output, { recursive: true });
for (const [key, config] of Object.entries(manifest.operations)) await record(key, config);
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ ...manifest, operations: recordings }, null, 2) + '\n');
