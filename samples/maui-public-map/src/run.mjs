// Real-source public map: import Maui fire stations into Emergency Management,
// activate the reviewed layer, then author and version a Studio map and request
// public publication. A held request is recorded as held, never as released.
// HONUA_SAMPLE_VERIFY_RECEIPT=<path> skips authoring and re-reads an existing
// publication (used after a server restart to prove it is durable).
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { adminFetch, readJsonResponse, serverEnv } from '../../../scripts/lib/admin-api.mjs';
import { ensureConnection } from '../../../scripts/lib/sample-connection.mjs';
import { ensureDepartments } from '../../../scripts/state-local/departments.mjs';
import { fetchSnapshot } from '../../../scripts/state-local/snapshot.mjs';
import { stageSnapshot } from '../../../scripts/state-local/import.mjs';
import { activateDeployment, saveDeployment } from '../../../scripts/state-local/deployment.mjs';

const env = serverEnv();
const name = 'maui-fire-stations';

async function anonymous(path, init = {}) {
  const response = await fetch(`${env.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(60_000) });
  return { status: response.status, ...(await readJsonResponse(response)) };
}

async function mcpTool(name, args) {
  const response = await fetch(`${env.baseUrl}/mcp`, { method: 'POST', signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'X-API-Key': env.adminApiKey },
    body: JSON.stringify({ jsonrpc: '2.0', id: name, method: 'tools/call', params: { name, arguments: args } }) });
  const text = await response.text();
  const payload = JSON.parse(text.startsWith('{') ? text : text.split('\n').find((line) => line.startsWith('data:')).slice(5));
  if (!response.ok || payload.error || payload.result?.isError) throw new Error(`MCP ${name} failed: ${text.slice(0, 400)}`);
  return payload.result.structuredContent;
}

async function readPublication(receipt) {
  const read = await anonymous(`${receipt.publishedUrl}?includeSources=true`);
  assert.equal(read.status, 200, `EM-02: anonymous readers must open the released map: ${read.text.slice(0, 300)}`);
  const data = read.json?.data;
  assert.equal(data?.itemId, receipt.itemId, 'EM-02: published item must be the released version');
  assert.equal(data?.versionId, receipt.versionId, 'EM-02: published version must not drift');
  assert.equal(data?.contentHash, receipt.contentHash, 'EM-02: published content must match the sealed version');
  const source = (data?.sourceCatalog ?? []).find((entry) => entry.id === receipt.sourceId);
  assert.ok(source, `EM-02: the map must expose its public fire-station source: ${JSON.stringify(data?.sourceCatalog)}`);
  assert.equal(source.locator?.layerId, receipt.layerId, 'EM-02: source must resolve to the imported layer');
  return source;
}

function approvePath(receipt) {
  return `/api/v1/admin/proposals/${encodeURIComponent(receipt.proposalId)}/approve`;
}

async function proposalStatus(receipt) {
  const proposal = await adminFetch(env, { method: 'GET', apiPath: `/api/v1/admin/proposals/${encodeURIComponent(receipt.proposalId)}` });
  return proposal?.status ?? proposal?.data?.status;
}

// A released map must point at the imported layer and serve every snapshot feature.
async function verifyReleasedSource(receipt, source) {
  // The locator may carry the server's public base URL, so compare paths, then query the
  // proven-equal activated layer on this server.
  const sourcePath = `${new URL(source.locator.url, env.baseUrl).pathname.replace(/\/+$/, '')}/${source.locator.layerId}`;
  assert.equal(sourcePath, new URL(receipt.layerUrl).pathname, 'EM-02: the released map must point at the imported layer');
  const query = await fetch(`${receipt.layerUrl}/query?where=1%3D1&returnCountOnly=true&f=json`);
  assert.equal(query.status, 200, 'EM-02: the map source must stay anonymously queryable');
  assert.equal((await query.json()).count, receipt.expectedCount, 'EM-02: public map count must match the imported snapshot');
}

async function refusesAnonymousControl(receipt, proposalPath) {
  const publish = await anonymous(receipt.publishRequestPath, { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: { route: receipt.route, visibility: 'public' } }) });
  assert.equal(publish.status, 401, `EM-02: anonymous readers must not request publication (HTTP ${publish.status})`);
  if (proposalPath) {
    const approve = await anonymous(proposalPath, { method: 'POST' });
    assert.equal(approve.status, 401, `EM-02: anonymous readers must not approve (HTTP ${approve.status})`);
  }
}

if (process.env.HONUA_SAMPLE_VERIFY_RECEIPT) {
  const receipt = JSON.parse(await readFile(process.env.HONUA_SAMPLE_VERIFY_RECEIPT, 'utf8'));
  const status = receipt.proposalId ? await proposalStatus(receipt) : 'Released';
  if (status === 'AwaitingApproval') {
    await refusesAnonymousControl(receipt, approvePath(receipt));
    const held = await anonymous(receipt.publishedUrl);
    assert.equal(held.status, 404, `EM-02: a held map must stay unreadable after restart (HTTP ${held.status})`);
    console.log(`PASS Maui map publication still held for approval after restart: ${receipt.proposalId}`);
    process.exit(0);
  }
  await verifyReleasedSource(receipt, await readPublication(receipt));
  await refusesAnonymousControl(receipt);
  console.log(`PASS Maui public map released: ${receipt.expectedCount} stations at ${receipt.publishedUrl}`);
  process.exit(0);
}

const connection = process.env.HONUA_SAMPLE_CONNECTION ?? 'local';
const root = fileURLToPath(new URL('../../../artifacts/state-local/ci/', import.meta.url));
await mkdir(root, { recursive: true });
const directory = await mkdtemp(`${root}maui-map-`);
await ensureConnection(env, connection);
await ensureDepartments(env);
const snapshot = await fetchSnapshot(name, directory);
assert.ok(snapshot.accepted > 0, 'EM data: the real source must contain fire stations');
assert.equal(snapshot.rejected, 0, 'EM data: no silent feature loss');
const staged = await stageSnapshot(env, { name, directory, connection });
await saveDeployment(env, { staged, directory, connection });
const active = await activateDeployment(env, { name, directory });

const packageKey = `maui-fire-stations-${Date.now().toString(36)}`;
// Ask the server which catalog source serves the imported layer, through the
// same MCP tool an agent client uses; never derive the id from the service name.
const listed = await mcpTool('honua_list_layers', {});
const candidates = (listed?.layers ?? []).filter((entry) => entry.serviceName === staged.serviceName
  && entry.serviceLayerIndex === active.serviceLayerIndex);
console.log(`MCP honua_list_layers match: ${JSON.stringify(candidates.map(({ serviceId, serviceName, serviceLayerIndex, name }) => ({ serviceId, serviceName, serviceLayerIndex, name })))}`);
assert.equal(candidates.length, 1, 'MCP must list exactly the activated fire-station layer');
const [chosen] = candidates;
const sourceId = `${encodeURIComponent(chosen.serviceId)}/${chosen.serviceLayerIndex}`;
const body = {
  mapPackageId: packageKey,
  format: 'honua_map_package.v1',
  status: 'Ready',
  createdAt: new Date().toISOString(),
  title: 'Maui County fire stations',
  attribution: snapshot.attribution,
  view: { center: [-156.33, 20.8], zoom: 9 },
  layers: [{ id: 'fire-stations', sourceId, type: 'circle', visible: true }],
};
const created = await adminFetch(env, { method: 'POST', apiPath: '/api/v1/studio/package-drafts', body: {
  packageKey, envelope: { family: 'map', schemaVersion: '1.0', format: 'honua_map_package.v1', body } } });
const draftId = created?.data?.draftId;
assert.ok(draftId, `Studio must create the map draft: ${JSON.stringify(created).slice(0, 300)}`);
const validated = await adminFetch(env, { method: 'POST', apiPath: `/api/v1/studio/package-drafts/${draftId}/validate`, body: {} });
const validation = validated?.data?.envelope?.validation ?? validated?.data?.validation ?? validated?.data;
assert.match(String(validation?.status ?? ''), /^(valid|passed|succeeded|warning)/i,
  `Studio draft must validate: ${JSON.stringify(validated?.data).slice(0, 500)}`);
const version = (await adminFetch(env, { method: 'POST',
  apiPath: `/api/v1/studio/package-drafts/${draftId}/content-versions`, body: {} }))?.data;
assert.ok(version?.itemId && version?.versionId && version?.contentHash, 'Studio must seal an immutable version');

const route = `/maps/${packageKey}`;
const receipt = {
  format: 'honua.samples.public-map.v1', baseUrl: env.baseUrl, route, sourceId,
  layerId: chosen.serviceLayerIndex, layerUrl: active.layerUrl, expectedCount: snapshot.accepted, itemId: version.itemId, versionId: version.versionId, contentHash: version.contentHash,
  publishRequestPath: `/api/v1/studio/content-items/${version.itemId}/versions/${version.versionId}/publish-requests`,
  publishedUrl: `/api/v1/studio/published/maps/${encodeURIComponent(packageKey)}`,
};
const before = await anonymous(receipt.publishedUrl);
assert.equal(before.status, 404, `EM-02: an unpublished map must not be readable (HTTP ${before.status})`);
await refusesAnonymousControl(receipt);

// Publish the way Console does. The server may release it at once or hold it
// for a human approval; both are recorded honestly.
const published = (await adminFetch(env, { method: 'POST', apiPath: receipt.publishRequestPath,
  body: { intent: { route, visibility: 'public' } } }))?.data;
const receiptPath = process.env.HONUA_SAMPLE_RECEIPT_OUT ?? `${directory}/public-map.json`;
if (published?.proposalId) {
  receipt.proposalId = published.proposalId;
  await refusesAnonymousControl(receipt, approvePath(receipt));
  assert.equal(await proposalStatus(receipt), 'AwaitingApproval', 'EM-02: the publication request must be held durably');
  const held = await anonymous(receipt.publishedUrl);
  assert.equal(held.status, 404, `EM-02: a held map must not be readable (HTTP ${held.status})`);
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(`PASS Maui map ready for release: ${snapshot.accepted} stations, publication held for human approval as ${receipt.proposalId}; approve it in Console, then rerun with HONUA_SAMPLE_VERIFY_RECEIPT=${receiptPath}`);
  process.exit(0);
}
assert.match(published?.status ?? '', /^accepted$/i, `Publication must be accepted or held for approval: ${JSON.stringify(published).slice(0, 400)}`);
const source = await readPublication(receipt);
await verifyReleasedSource(receipt, source);
await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { mode: 0o600 });
console.log(`PASS Maui public map released on ${source.locator?.url ?? 'the default server'}: ${snapshot.accepted} stations at ${receipt.publishedUrl}; receipt ${receiptPath}`);
