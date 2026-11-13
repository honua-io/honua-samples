import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { DEFAULT_SERVER, SERVER_SETTING, serverOrigin, stateLocalServer, withStateLocalServer } from '../../shared/state-local/server.mjs';

const REHEARSAL = 'https://rehearsal.example.org';

function withSetting(value, script) {
  const env = { ...process.env, [SERVER_SETTING]: value };
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { cwd: new URL('../..', import.meta.url), env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

test('the server defaults to the public demo and accepts only a bare origin', { skip: Boolean(process.env[SERVER_SETTING]) }, () => {
  assert.equal(stateLocalServer, DEFAULT_SERVER);
  assert.equal(serverOrigin(''), DEFAULT_SERVER);
  assert.equal(serverOrigin(`${REHEARSAL}/`), REHEARSAL);
  assert.equal(serverOrigin('http://localhost:8080'), 'http://localhost:8080');
  for (const value of [`${REHEARSAL}/api`, 'https://user@rehearsal.example.org', `${REHEARSAL}?a=1`, `${REHEARSAL}#a`, 'ftp://rehearsal.example.org']) {
    assert.throws(() => serverOrigin(value), new RegExp(SERVER_SETTING), value);
  }
  assert.equal(withStateLocalServer("url: 'pmtiles://{{STATE_LOCAL_SERVER}}/api'"), `url: 'pmtiles://${DEFAULT_SERVER}/api'`);
});

test('the build setting moves the binding allow-list and the page basemap to another server', () => {
  const result = withSetting(`${REHEARSAL}/`, `
    import { sourceBinding } from './shared/state-local/binding.mjs';
    import { withStateLocalServer } from './shared/state-local/server.mjs';
    const rejects = (search) => { try { sourceBinding(search); return false; } catch { return true; } };
    console.log(JSON.stringify({
      fallback: sourceBinding('?service=exercise&layer=1').baseUrl,
      local: sourceBinding('?service=exercise&layer=1&baseUrl=http://localhost:8080').baseUrl,
      demoRejected: rejects('?service=exercise&layer=1&baseUrl=${DEFAULT_SERVER}'),
      page: withStateLocalServer('pmtiles://{{STATE_LOCAL_SERVER}}/api/v1/tiles/pmtiles/maui-basemap'),
    }));`);
  assert.deepEqual(result, { fallback: REHEARSAL, local: 'http://localhost:8080', demoRejected: true,
    page: `pmtiles://${REHEARSAL}/api/v1/tiles/pmtiles/maui-basemap` });
});

test('an invalid build setting fails the build instead of shipping a broken page', () => {
  assert.throws(() => withSetting(`${REHEARSAL}/ogc`, `import './shared/state-local/server.mjs';`), /bare server origin/);
});
