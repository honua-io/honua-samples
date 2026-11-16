import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runAnalysis, resultRows, sha256, validateAgentChart, exportCsv, exportGeoJson, publicUrl } from '../../shared/state-local/workbench-analytics.mjs';
import { publishWorkbenchAnalysis } from '../state-local/publish-workbench-analysis.mjs';

// Harness-only response doubles; never published as Maui server/agent recordings.
const dataset = { name: 'Harness data', sourceUrl: 'https://example.org/data', license: 'CC0', sha256: 'a'.repeat(64) };
const collection = { type: 'FeatureCollection', numberReturned: 2, metadata: { operation: 'cluster', inputTruncated: false, resultTruncated: false },
  features: [1, 2].map((id) => ({ type: 'Feature', geometry: null, properties: { clusterId: id, featureCount: id * 3 } })) };
const raw = JSON.stringify(collection);
const manifest = { dataset, operations: { clusters: { recording: 'clusters.json', agentRecording: 'agent.json' } } };
const stamp = '2026-11-16T12:00:00Z';
const envelope = async () => ({ raw, sha256: await sha256(raw), datasetSha256: dataset.sha256, createdAt: stamp, serverImage: 'harness-only', request: { method: 'POST', url: '/harness/queryClusters', body: {} } });
const agent = async () => ({ question: 'Chart cluster sizes', provider: 'harness', model: 'harness', runId: 'test-only', createdAt: stamp,
  resultSha256: await sha256(raw), chart: { title: 'Cluster sizes', series: [{ label: '2', value: 6 }, { label: '1', value: 3 }] } });

async function runtime(overrides = {}) {
  const resources = { 'clusters.json': await envelope(), 'agent.json': await agent(), ...overrides };
  return { base: 'https://example.org/workbench/', fetcher: async (url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.match(url, /\/state-local\/data\/analysis\//);
    const value = resources[path.posix.basename(new URL(url).pathname)];
    return new Response(JSON.stringify(value), { status: value ? 200 : 404 });
  } };
}

test('recorded response, map GeoJSON, table, CSV and agent chart retain the same counts and provenance', async () => {
  const result = await runAnalysis(manifest, 'clusters', await runtime());
  assert.deepEqual(result.rows, [{ label: '1', value: 3 }, { label: '2', value: 6 }]);
  assert.equal(result.mode, 'Recorded server result');
  assert.deepEqual(result.agent.chart.series, (await agent()).chart.series);
  assert.match(exportCsv(result), /"1","3"/);
  const exported = JSON.parse(exportGeoJson(result));
  assert.deepEqual(exported.features, collection.features);
  assert.equal(exported.honuaAnalysis.responseSha256, result.sha256);
  assert.equal(exported.honuaAnalysis.dataset.sha256, dataset.sha256);
});

test('tampered recording or dataset checksum cannot become a chart', async () => {
  await assert.rejects(runAnalysis(manifest, 'clusters', await runtime({ 'clusters.json': { ...await envelope(), raw: '{}' } })), /checksum/);
  await assert.rejects(runAnalysis(manifest, 'clusters', await runtime({ 'clusters.json': { ...await envelope(), datasetSha256: 'b'.repeat(64) } })), /checksum/);
});

test('partial, duplicate and wrong-operation results are rejected; empty results remain honest', () => {
  for (const metadata of [{ inputTruncated: true }, { resultTruncated: true }, { operation: 'spatial-join' }]) {
    assert.throws(() => resultRows({ ...collection, metadata }, 'clusters'));
  }
  assert.throws(() => resultRows({ ...collection, numberReturned: 9 }, 'clusters'), /count/);
  assert.throws(() => resultRows({ ...collection, features: [collection.features[0], collection.features[0]] }, 'clusters'), /unique/);
  assert.deepEqual(resultRows({ type: 'FeatureCollection', features: [] }, 'h3', 100), []);
});

test('agent mismatch, duplicate, omitted or invented rows fail while real analysis remains available', async () => {
  const result = await runAnalysis(manifest, 'clusters', await runtime());
  const original = await agent();
  for (const series of [[{ label: '1', value: 300 }, { label: '2', value: 6 }], [{ label: '1', value: 3 }],
    [{ label: '1', value: 3 }, { label: '1', value: 3 }]]) {
    assert.throws(() => validateAgentChart({ ...original, chart: { ...original.chart, series } }, result));
  }
  assert.throws(() => validateAgentChart({ ...original, resultSha256: 'bad' }, result), /different/);
  const missing = await runAnalysis(manifest, 'clusters', await runtime({ 'agent.json': null }));
  assert.equal(missing.rows.length, 2);
  assert.match(missing.agentError, /404/);
});

test('live server failures never fall back to a recording or scripted counts', async () => {
  const live = { dataset, operations: { clusters: { request: { method: 'POST', url: '/harness/queryClusters', body: { eps: 100 } } } } };
  const context = { base: 'https://example.org/workbench/', fetcher: async (url, options) => {
    assert.equal(url, 'https://example.org/harness/queryClusters');
    assert.equal(options.credentials, 'omit');
    assert.deepEqual(JSON.parse(options.body), { eps: 100 });
    return new Response('unavailable', { status: 503 });
  } };
  await assert.rejects(runAnalysis(live, 'clusters', context), /503/);
  await assert.rejects(runAnalysis(live, 'h3', context), /not been published/);
});

test('exports escape spreadsheet formulas and endpoint URLs exclude credentials', async () => {
  const result = await runAnalysis(manifest, 'clusters', await runtime());
  result.rows[0].label = '=HYPERLINK("https://example.org")';
  assert.match(exportCsv(result), /"'=HYPERLINK/);
  assert.throws(() => publicUrl('https://user:secret@example.org', 'https://example.org'), /Invalid/);
  assert.throws(() => publicUrl('http://example.org', 'https://example.org'), /HTTPS/);
});

test('publisher validates recordings and copies only referenced public files', async () => {
  const source = await mkdtemp(path.join(tmpdir(), 'analysis-source-'));
  const destination = await mkdtemp(path.join(tmpdir(), 'analysis-publish-'));
  for (const [name, value] of Object.entries({ 'manifest.json': manifest, 'clusters.json': await envelope(), 'agent.json': await agent(), 'private.json': { secret: 'never-publish' } })) {
    await writeFile(path.join(source, name), JSON.stringify(value));
  }
  await publishWorkbenchAnalysis(source, destination);
  assert.deepEqual((await readdir(destination)).sort(), ['agent.json', 'clusters.json', 'manifest.json']);
  assert.equal(JSON.parse(await readFile(path.join(destination, 'manifest.json'))).dataset.sha256, dataset.sha256);
  await writeFile(path.join(source, 'agent.json'), JSON.stringify({ ...await agent(), resultSha256: 'bad' }));
  await assert.rejects(publishWorkbenchAnalysis(source, destination), /different/);
});

test('H3 requires the installed cap and rejects silently capped responses', () => {
  const h3 = { type: 'FeatureCollection', numberReturned: 100, features: Array.from({ length: 100 }, (_, index) =>
    ({ type: 'Feature', geometry: null, properties: { cellIndex: String(index), count: 1 } })) };
  assert.throws(() => resultRows(h3, 'h3'), /installed server cell limit/);
  assert.throws(() => resultRows(h3, 'h3', 100), /reached the server cell limit/);
  assert.equal(resultRows({ ...h3, numberReturned: 99, features: h3.features.slice(1) }, 'h3', 100).length, 99);
});

test('unconfigured publication serves an explicit unavailable manifest without inventing results', async () => {
  const destination = await mkdtemp(path.join(tmpdir(), 'analysis-unavailable-'));
  await publishWorkbenchAnalysis(undefined, destination);
  assert.deepEqual(await readdir(destination), ['manifest.json']);
  assert.equal(JSON.parse(await readFile(path.join(destination, 'manifest.json'), 'utf8')), null);
});
