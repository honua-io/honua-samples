import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const code = await readFile(new URL('../../shared/state-local/island-map.js', import.meta.url), 'utf8');
const base = 'https://samples.honua.io/state-local/data/island/';
const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

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
  for (const userAgent of [chrome, firefox]) {
    const { HI, added, registered } = load(userAgent);
    const zoning = HI.source('zoning');
    assert.equal(zoning.type, 'vector');
    assert.equal(zoning.url, `pmtiles://${base}zoning.pmtiles`);
    assert.equal(HI.source('zoning').url, zoning.url, 'a second source of the same archive reuses it');
    HI.source('parcels');
    assert.deepEqual(registered, ['pmtiles'], 'one protocol registration');
    assert.deepEqual(added.map((source) => source.url), [`${base}zoning.pmtiles`, `${base}parcels.pmtiles`]);
    assert.ok(added.every((source) => source.chromeWindowsNoCache === (userAgent === chrome)), userAgent);
  }
});

test('GeoJSON overlays are untouched', () => {
  const { HI, added } = load(chrome);
  assert.deepEqual({ ...HI.source('schools') }, { type: 'geojson', data: `${base}schools.geojson` });
  assert.equal(added.length, 0);
});
