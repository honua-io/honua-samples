import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const code = await readFile(new URL('../../shared/state-local/island-map.js', import.meta.url), 'utf8');
const base = 'https://samples.honua.io/state-local/data/island/';
const islandLock = JSON.parse(await readFile(new URL('../../shared/state-local/island-display.lock.json', import.meta.url), 'utf8'));
const islandRelease = islandLock.url.match(/\/download\/maui-island-display-([\d-]+)\//)[1];
const tileBase = `https://demo.honua.io/demo-data/maui-island-display/${islandRelease}/`;
const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const edge = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0';
const windowsChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const chromiumAgents = new Set([chrome, edge, windowsChrome]);

// Minimal pmtiles 4.x / MapLibre surface: a Protocol keyed by source URL, and a FetchSource whose
// chromeWindowsNoCache flag switches its range fetches to cache: 'no-store'.
function load(userAgent) {
  const added = [];
  const registered = [];
  class FetchSource { constructor(url) { this.url = url; this.chromeWindowsNoCache = false; } getKey() { return this.url; } }
  class PMTiles { constructor(source) { this.source = source; } }
  class Protocol {
    constructor() { this.tiles = new Map(); this.tile = () => {}; }
    add(p) { added.push(p.source); this.tiles.set(p.source.getKey(), p); }
    get(url) { return this.tiles.get(url); }
  }
  const context = { URL, navigator: { userAgent }, location: { origin: 'https://samples.honua.io' },
    pmtiles: { FetchSource, PMTiles, Protocol }, maplibregl: { addProtocol: (name) => registered.push(name) } };
  context.window = context;
  vm.runInNewContext(code, context);
  return { HI: context.HI, added, registered };
}

test('island archives get one shared source each, with the HTTP cache bypassed on Chromium only', () => {
  for (const userAgent of [chrome, edge, windowsChrome, firefox, safari]) {
    const { HI, added, registered } = load(userAgent);
    const zoning = HI.source('zoning');
    assert.equal(zoning.type, 'vector');
    assert.equal(zoning.url, `pmtiles://${tileBase}zoning.pmtiles`);
    assert.equal(HI.source('zoning').url, zoning.url, 'a second source of the same archive reuses it');
    HI.source('parcels');
    assert.deepEqual(registered, ['pmtiles'], 'one protocol registration');
    assert.deepEqual(added.map((source) => source.url), [`${tileBase}zoning.pmtiles`, `${tileBase}parcels.pmtiles`]);
    assert.ok(added.every((source) => source.chromeWindowsNoCache === chromiumAgents.has(userAgent)), userAgent);
  }
});

test('GeoJSON overlays are untouched', () => {
  const { HI, added } = load(chrome);
  assert.deepEqual({ ...HI.source('schools') }, { type: 'geojson', data: `${base}schools.geojson` });
  assert.equal(added.length, 0);
});

test('the street basemap keeps default caching', () => {
  // Only the static island archives showed the cache failure; the basemap is served by Honua behind its own CDN.
  assert.match(code, /url: 'pmtiles:\/\/https:\/\/demo\.honua\.io\/api\/v1\/tiles\/pmtiles\/maui-basemap'/);
  assert.doesNotMatch(code, /islandArchive\(\s*'https:\/\/demo\.honua\.io/);
});

test('pages load the pmtiles build whose FetchSource honours chromeWindowsNoCache', async () => {
  // pmtiles 4.5.0 FetchSource uses cache: 'no-store' when chromeWindowsNoCache is set. Re-check that flag
  // in the library before changing this pin; the fix silently disappears if the flag is renamed.
  for (const file of ['shared/state-local/approved-page.mjs', 'scripts/state-local/approved/build.py']) {
    const text = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    const versions = [...text.matchAll(/pmtiles@([\d.]+)\/dist\/pmtiles\.js/g)].map(([, version]) => version);
    assert.ok(versions.length > 0, file);
    assert.deepEqual([...new Set(versions)], ['4.5.0'], file);
  }
});
