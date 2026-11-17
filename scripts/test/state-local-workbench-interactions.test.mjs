import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../state-local/approved/pages/12-workbench.html', import.meta.url), 'utf8');
function functionSource(name, next) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf(next, start);
  assert.ok(start >= 0 && end > start, `Cannot locate ${name}`);
  return source.slice(start, end);
}

function assertGeoJsonFeatures(collection, types) {
  assert.equal(collection.type, 'FeatureCollection');
  assert.deepEqual(Array.from(collection.features, (feature) => feature.geometry.type), types);
  for (const feature of collection.features) {
    assert.equal(feature.type, 'Feature');
    assert.ok(Object.hasOwn(feature, 'properties'), 'GeoJSON Feature requires properties');
    assert.ok(feature.properties === null || typeof feature.properties === 'object');
  }
}

for (const [mode, count, types] of [
  ['measure', 0, []], ['measure', 1, ['Point']],
  ['measure', 2, ['Point', 'Point', 'LineString']],
  ['draw', 3, ['Point', 'Point', 'Point', 'LineString', 'Polygon']],
]) {
  test(`${mode} with ${count} vertices emits valid GeoJSON features`, () => {
    let collection;
    const points = [[-156.48, 20.88], [-156.47, 20.88], [-156.47, 20.89]].slice(0, count);
    const context = vm.createContext({
      mode, measurePts: points, hav: () => 10, areaM2: () => 100, hintText() {},
      map: { getSource: () => ({ setData: (data) => { collection = data; } }) },
    });
    vm.runInContext(functionSource('drawSketch', '  function hintText('), context);
    vm.runInContext('drawSketch()', context);
    assertGeoJsonFeatures(collection, types);
    if (mode === 'draw') {
      const ring = collection.features.at(-1).geometry.coordinates[0];
      assert.deepEqual(Array.from(ring, (point) => Array.from(point)), [...points, points[0]]);
    }
  });
}

test('map extent emits a valid closed GeoJSON polygon for the applied spatial filter', () => {
  let applyExtent;
  let collection;
  const context = vm.createContext({
    S: {}, refresh() {},
    document: { getElementById: () => ({ addEventListener: (_, handler) => { applyExtent = handler; } }) },
    map: {
      getBounds: () => ({ getWest: () => -156.48, getEast: () => -156.47, getSouth: () => 20.88, getNorth: () => 20.89 }),
      getSource: () => ({ setData: (data) => { collection = data; } }),
    },
  });
  const start = source.indexOf('  document.getElementById("spView").addEventListener(');
  const end = source.indexOf('  document.getElementById("hintDone")', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  applyExtent();
  assertGeoJsonFeatures(collection, ['Polygon']);
  const ring = Array.from(collection.features[0].geometry.coordinates[0], (point) => Array.from(point));
  assert.deepEqual(ring, [[-156.48, 20.88], [-156.47, 20.88], [-156.47, 20.89], [-156.48, 20.89], [-156.48, 20.88]]);
  assert.deepEqual(ring, Array.from(context.S.spatial, (point) => Array.from(point)));
});

test('map selection queries the visible parcel layer in 2D and 3D, or requests', () => {
  let pressed = 'false';
  const context = vm.createContext({ S: { layer: 'parcels' }, document: { getElementById: () => ({ getAttribute: () => pressed }) } });
  vm.runInContext(functionSource('selectionLayers', '  function select('), context);
  const layers = () => Array.from(vm.runInContext('selectionLayers()', context));
  assert.deepEqual(layers(), ['pf-hit']);
  pressed = 'true';
  assert.deepEqual(layers(), ['p3d']);
  context.S.layer = 'requests';
  assert.deepEqual(layers(), ['reqs']);
});

for (const type of ['hist', 'time']) {
  test(`${type} click clears its active brush; dragging applies a range`, () => {
    let callback;
    let refreshes = 0;
    const rows = [{ acres: 1, created: '2026-10-01' }, { acres: 10, created: '2026-11-01' }];
    const context = vm.createContext({
      W: 340, S: { chartF: { [`${type}:acres`]: { v: [1, 2] } } },
      filtered: () => rows, key: (c) => `${c.t}:${c.f}`, chartTitle: () => 'Chart', escapeHtml: String, money: String,
      brush: (svg, height, done) => { callback = done; }, refresh: () => { refreshes++; },
      chart: { t: type, f: 'acres' }, layer: { rows, color: 'blue' },
      element: { innerHTML: '', querySelector: () => ({}), insertAdjacentHTML() {} },
    });
    vm.runInContext(functionSource('binsOf', '  function renderCharts('), context);
    vm.runInContext(functionSource('drawChart', '  function brush('), context);
    vm.runInContext('drawChart(chart, element, layer)', context);
    callback(20, 19); // Both positions round to the same histogram bin.
    assert.equal(context.S.chartF[`${type}:acres`], undefined);
    callback(20, 80);
    assert.equal(context.S.chartF[`${type}:acres`].op, type === 'time' ? 'between-date' : 'between');
    assert.equal(refreshes, 2);
  });
}

for (const [name, value, cell] of [
  ['Unicode', 'Mālama 🌺', 'Mālama 🌺'],
  ['comma', 'Kahului, Maui', '"Kahului, Maui"'],
  ['quotation mark', 'say "aloha"', '"say ""aloha"""'],
  ['line feed', 'first\nsecond', '"first\nsecond"'],
  ['carriage return', 'first\rsecond', '"first\rsecond"'],
  ['CRLF', 'first\r\nsecond', '"first\r\nsecond"'],
  ['empty field', '', ''],
]) {
  test(`CSV export preserves a field containing ${name}`, () => {
    let click;
    let exported;
    const rows = [{ id: 1, value }, { id: 2, value: 'next record' }];
    const context = vm.createContext({
      document: { getElementById: () => ({ addEventListener: (_, callback) => { click = callback; } }) },
      S: { layer: 'requests' },
      LAYERS: { requests: { cols: [['id', 'ID'], ['value', 'Value']] } },
      filtered: () => rows, tableRows: (items) => items,
      download: (name, text, type) => { exported = { name, text, type }; },
    });
    const handler = source.split('\n').find((line) => line.includes('getElementById("expCsv").addEventListener'));
    assert.ok(handler, 'CSV export click handler exists');
    vm.runInContext(handler, context);
    click();
    assert.deepEqual(exported, {
      name: 'maui-requests.csv', type: 'text/csv',
      text: `ID,Value\n1,${cell}\n2,next record`,
    });
  });
}

for (const value of ["O'Brien", "two 'quoted' names", "Mālama 🌺", ""]) {
  test(`contains query keeps ${JSON.stringify(value)} inside one CQL text literal`, () => {
    const context = vm.createContext({ attribute: { f: 'zoning', op: 'contains', v: value } });
    const start = source.indexOf('  const q =');
    const end = source.indexOf('  function cqlText(', start);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(source.slice(start, end), context);
    const cql = vm.runInContext('clause(attribute)', context);
    const literal = cql.match(/^zoning LIKE '((?:[^']|'')*)'$/);
    assert.ok(literal, `Expected exactly one valid text literal: ${cql}`);
    assert.equal(literal[1].replaceAll("''", "'"), `%${value}%`);
  });
}
