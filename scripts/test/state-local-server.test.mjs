import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { BASEMAP_SETTING, DEFAULT_SERVER, ISLAND_DATA_SETTING, SERVER_SETTING, basemapUrl, islandDataUrl, serverOrigin,
  withStateLocalEndpoints } from '../../shared/state-local/server.mjs';

const REHEARSAL = 'https://rehearsal.example.org';
const ISLAND_MAP = "new URL('{{STATE_LOCAL_ISLAND_DATA}}', location.origin); url: 'pmtiles://{{STATE_LOCAL_BASEMAP}}'";
const configuredHere = [SERVER_SETTING, BASEMAP_SETTING, ISLAND_DATA_SETTING].some((name) => process.env[name]);

function withSettings(settings, script) {
  const env = { ...process.env, [SERVER_SETTING]: '', [BASEMAP_SETTING]: '', [ISLAND_DATA_SETTING]: '', ...settings };
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { cwd: new URL('../..', import.meta.url), env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

test('settings accept only plain http(s) locations', () => {
  assert.equal(serverOrigin(''), DEFAULT_SERVER);
  assert.equal(serverOrigin(`${REHEARSAL}/`), REHEARSAL);
  assert.equal(serverOrigin('http://localhost:8080'), 'http://localhost:8080');
  for (const value of [`${REHEARSAL}/api`, 'https://user@rehearsal.example.org', `${REHEARSAL}?a=1`, `${REHEARSAL}#a`, 'ftp://rehearsal.example.org', 'http://rehearsal.example.org', 'https://', '/']) {
    assert.throws(() => serverOrigin(value), new RegExp(SERVER_SETTING), value);
  }
  assert.equal(basemapUrl('', REHEARSAL), `${REHEARSAL}/api/v1/tiles/pmtiles/maui-basemap`);
  assert.equal(basemapUrl(`${REHEARSAL}/data/maui.pmtiles`, DEFAULT_SERVER), `${REHEARSAL}/data/maui.pmtiles`);
  for (const value of ['/data/maui.pmtiles', `${REHEARSAL}/x'.pmtiles`]) assert.throws(() => basemapUrl(value, DEFAULT_SERVER), new RegExp(BASEMAP_SETTING), value);
  assert.equal(islandDataUrl(''), '/state-local/data/island/');
  assert.equal(islandDataUrl(`${REHEARSAL}/data/island/`), `${REHEARSAL}/data/island/`);
  for (const value of ['//cdn.example.org/island/', `${REHEARSAL}/island`, 'island/']) assert.throws(() => islandDataUrl(value), new RegExp(ISLAND_DATA_SETTING), value);
});

test('the default build keeps the public demo and the same-origin island archives', { skip: configuredHere }, () => {
  assert.equal(withStateLocalEndpoints(ISLAND_MAP),
    "new URL('/state-local/data/island/', location.origin); url: 'pmtiles://https://demo.honua.io/api/v1/tiles/pmtiles/maui-basemap'");
});

test('the server setting moves the binding allow-list and the derived basemap', () => {
  const result = withSettings({ [SERVER_SETTING]: `${REHEARSAL}/` }, `
    import { sourceBinding } from './shared/state-local/binding.mjs';
    import { withStateLocalEndpoints } from './shared/state-local/server.mjs';
    const rejects = (search) => { try { sourceBinding(search); return false; } catch { return true; } };
    console.log(JSON.stringify({
      fallback: sourceBinding('?service=exercise&layer=1').baseUrl,
      local: sourceBinding('?service=exercise&layer=1&baseUrl=http://localhost:8080').baseUrl,
      demoRejected: rejects('?service=exercise&layer=1&baseUrl=${DEFAULT_SERVER}'),
      page: withStateLocalEndpoints(${JSON.stringify(ISLAND_MAP)}),
    }));`);
  assert.deepEqual(result, { fallback: REHEARSAL, local: 'http://localhost:8080', demoRejected: true,
    page: `new URL('/state-local/data/island/', location.origin); url: 'pmtiles://${REHEARSAL}/api/v1/tiles/pmtiles/maui-basemap'` });
});

test('the basemap and island archive settings override the page archives alone', () => {
  const page = withSettings({ [BASEMAP_SETTING]: `${REHEARSAL}/data/maui-basemap.pmtiles`, [ISLAND_DATA_SETTING]: `${REHEARSAL}/data/island/` }, `
    import { stateLocalServer, withStateLocalEndpoints } from './shared/state-local/server.mjs';
    console.log(JSON.stringify([stateLocalServer, withStateLocalEndpoints(${JSON.stringify(ISLAND_MAP)})]));`);
  assert.deepEqual(page, [DEFAULT_SERVER,
    `new URL('${REHEARSAL}/data/island/', location.origin); url: 'pmtiles://${REHEARSAL}/data/maui-basemap.pmtiles'`]);
});

test('an invalid build setting fails the build instead of shipping a broken page', () => {
  assert.throws(() => withSettings({ [SERVER_SETTING]: `${REHEARSAL}/ogc` }, `import './shared/state-local/server.mjs';`), /bare server origin/);
});

test('a static sample that hard-codes the demo keeps it as its data origin under another server', () => {
  const app = withSettings({ [SERVER_SETTING]: REHEARSAL }, `
    import { execFileSync } from 'node:child_process';
    import { mkdtemp, readFile } from 'node:fs/promises';
    import { tmpdir } from 'node:os';
    import path from 'node:path';
    import { stageOwnBrowserApp } from './scripts/lib/own-sample-apps.mjs';
    const dirName = 'maplibre-featureserver-layer';
    const manifest = JSON.parse(await readFile(path.join('samples', dirName, 'sample.json'), 'utf8'));
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const destDir = path.join(await mkdtemp(path.join(tmpdir(), 'state-local-server-')), 'app');
    const staged = await stageOwnBrowserApp({ repoRoot: process.cwd(), dirName, manifest, sourceCommit, destDir });
    console.log(JSON.stringify(staged.app?.dataOrigins ?? staged.reason));`);
  assert.deepEqual(app, [DEFAULT_SERVER]);
});

test('built apps that import the shared server setting are recognised by their import, not a mention', async () => {
  const { importsServerSetting } = await import('../lib/own-sample-apps.mjs');
  assert.equal(importsServerSetting("import { stateLocalServer } from '../../../shared/state-local/server.mjs';"), true);
  assert.equal(importsServerSetting('import { namedBindings } from "../../../shared/state-local/binding.mjs";'), true);
  assert.equal(importsServerSetting('// see shared/state-local/server.mjs'), false);
  assert.equal(importsServerSetting("import { x } from '../../../shared/state-local/features.mjs';"), false);
});
