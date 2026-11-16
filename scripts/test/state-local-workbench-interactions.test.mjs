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
