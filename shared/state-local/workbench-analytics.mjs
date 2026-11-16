import { csvCell } from './csv.mjs';

export const operations = Object.freeze({
  clusters: { title: 'Clustering', label: 'clusterId', value: 'featureCount', operation: 'cluster' },
  join: { title: 'Spatial join', label: 'objectId', value: 'matchCount', operation: 'spatial-join' },
  h3: { title: 'H3 density', label: 'cellIndex', value: 'count' },
});

export function publicUrl(value, base) {
  const url = new URL(value, base);
  if (url.username || url.password || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid public URL');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('HTTPS is required');
  if (Array.from(url.searchParams.keys()).some((key) => /token|password|secret|api.?key|authorization/i.test(key))) throw new Error('Public URLs must not contain credentials');
  return url.href;
}

export function validateRequest(request) {
  if (!request || !['GET', 'POST'].includes(request.method) || typeof request.url !== 'string') throw new Error('A public GET/POST server request is required');
  if (Object.keys(request).some((key) => !['method', 'url', 'body'].includes(key))) throw new Error('Public requests cannot contain headers or credentials');
  publicUrl(request.url, 'https://analysis.invalid/');
  return request;
}

export function validateManifest(manifest) {
  const data = manifest?.dataset;
  if (!data?.name || !data.sourceUrl || !data.license || !/^[a-f0-9]{64}$/.test(data.sha256)) throw new Error('Dataset provenance is incomplete');
  if (!manifest.operations || Object.keys(manifest.operations).some((key) => !operations[key])) throw new Error('Unknown analysis operation');
  publicUrl(data.sourceUrl);
  for (const [key, config] of Object.entries(manifest.operations)) {
    if (!config || typeof config !== 'object') throw new Error('Invalid operation configuration');
    if (Object.keys(config).some((key) => !['request', 'recording', 'agentRecording', 'cellLimit'].includes(key))) throw new Error('Unknown operation configuration');
    if (key === 'h3' && (!Number.isSafeInteger(config.cellLimit) || config.cellLimit < 1)) throw new Error('H3 requires the installed server cell limit');
    if (config.request) validateRequest(config.request);
    if (!config.recording && !config.request) throw new Error('Operation requires a request or recording');
  }
  return manifest;
}

export async function sha256(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function resultRows(collection, key, cellLimit) {
  const definition = operations[key];
  if (!definition || collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('Expected a GeoJSON analysis result');
  if (collection.features.length > 10000) throw new Error('Too many result rows; narrow the dataset and rerun');
  if (key === 'h3' && (!Number.isSafeInteger(cellLimit) || cellLimit < 1)) throw new Error('H3 requires the installed server cell limit');
  if (key === 'h3' && collection.features.length >= cellLimit) throw new Error('H3 reached the server cell limit; narrow the dataset and rerun');
  const metadata = collection.metadata;
  if (metadata?.inputTruncated || metadata?.resultTruncated) throw new Error('Server truncated the analysis; narrow the dataset and rerun');
  if (metadata?.operation && metadata.operation !== definition.operation) throw new Error('Server returned a different operation');
  if (collection.numberReturned !== undefined && collection.numberReturned !== collection.features.length) throw new Error('Result count does not match the returned rows');
  const seen = new Set();
  return collection.features.map((feature) => {
    const label = feature.properties?.[definition.label], value = feature.properties?.[definition.value];
    if (label === undefined || label === null || !Number.isSafeInteger(value) || value < 0) throw new Error('Analysis row has an invalid category or count');
    if (seen.has(String(label))) throw new Error('Analysis categories must be unique');
    seen.add(String(label));
    return { label: String(label), value };
  });
}

export function validateAgentChart(agent, result) {
  if (!agent?.question || !agent.provider || !agent.model || !agent.runId || !Number.isFinite(Date.parse(agent.createdAt))) throw new Error('Agent execution provenance is incomplete');
  if (agent.resultSha256 !== result.sha256) throw new Error('Agent chart belongs to a different analysis response');
  const series = agent.chart?.series;
  if (!agent.chart?.title || !Array.isArray(series) || series.length !== result.rows.length) throw new Error('Agent chart must include every result row');
  const expected = new Map(result.rows.map((row) => [row.label, row.value]));
  for (const row of series) {
    if (!expected.has(row.label) || expected.get(row.label) !== row.value) throw new Error('Agent chart values differ from the result table');
    expected.delete(row.label);
  }
  return agent;
}

async function fetchText(url, fetcher) {
  const response = await fetcher(url, { credentials: 'omit', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Analysis resource unavailable (HTTP ${response.status})`);
  return response.text();
}

async function liveResponse(config, context) {
  const request = config.request;
  if (!request || !['GET', 'POST'].includes(request.method)) throw new Error('Live operation has no supported server request');
  const response = await context.fetcher(publicUrl(request.url, context.base), {
    method: request.method, credentials: 'omit', signal: AbortSignal.timeout(30000),
    ...(request.method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body ?? {}) } : {}),
  });
  if (!response.ok) throw new Error(`Server analysis unavailable (HTTP ${response.status})`);
  return { raw: await response.text(), createdAt: new Date().toISOString(), request, mode: 'Live server result' };
}

async function recordedResponse(config, context) {
  const envelope = JSON.parse(await fetchText(publicUrl(config.recording, context.base), context.fetcher));
  if (!Number.isFinite(Date.parse(envelope.createdAt)) || !envelope.serverImage || !envelope.request || typeof envelope.raw !== 'string') throw new Error('Recording provenance is incomplete');
  validateRequest(envelope.request);
  if (envelope.datasetSha256 !== context.dataset.sha256 || await sha256(envelope.raw) !== envelope.sha256) throw new Error('Recording checksum does not match the dataset or response');
  return { ...envelope, mode: 'Recorded server result' };
}

export async function runAnalysis(manifest, key, context) {
  validateManifest(manifest);
  const config = manifest.operations[key];
  if (!config) throw new Error('This operation has not been published for the Maui dataset');
  const runtime = { ...context, base: new URL('/state-local/data/analysis/', context.base).href, fetcher: context.fetcher ?? fetch, dataset: manifest.dataset };
  const response = config.recording ? await recordedResponse(config, runtime) : await liveResponse(config, runtime);
  const collection = JSON.parse(response.raw);
  const result = { ...response, collection, rows: resultRows(collection, key, config.cellLimit), cellLimit: config.cellLimit, sha256: await sha256(response.raw), dataset: manifest.dataset, key };
  if (config.agentRecording) {
    try {
      const agent = JSON.parse(await fetchText(publicUrl(config.agentRecording, runtime.base), runtime.fetcher));
      result.agent = validateAgentChart(agent, result);
    } catch (error) { result.agentError = error.message; }
  }
  return result;
}

export function exportCsv(result) {
  const fields = [operations[result.key].label, operations[result.key].value, 'response_sha256', 'dataset_sha256', 'recorded_at', 'result_mode'];
  return [fields, ...result.rows.map((row) => [row.label, row.value, result.sha256, result.dataset.sha256, result.createdAt, result.mode])]
    .map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function exportGeoJson(result) {
  return JSON.stringify({ ...result.collection, honuaAnalysis: { dataset: result.dataset, request: result.request,
    responseSha256: result.sha256, cellLimit: result.cellLimit ?? null, createdAt: result.createdAt, mode: result.mode, serverImage: result.serverImage ?? null } }, null, 2);
}
