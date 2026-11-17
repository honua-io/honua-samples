import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../state-local/approved/pages/12-workbench.html', import.meta.url), 'utf8');

for (const initialMode of ['measure', 'draw']) {
  test(`Map extent ends ${initialMode}, restores navigation and retains the extent polygon`, () => {
    let click;
    let drawn;
    let zoomEnabled = false;
    let refreshes = 0;
    const buttons = ['select', 'measure', 'draw'].map((mode) => ({
      dataset: { mode },
      setAttribute(name, value) { this[name] = String(value); },
    }));
    const hint = { dataset: { on: 'true' } };
    const context = vm.createContext({
      mode: initialMode, measurePts: [[1, 2], [3, 4]], S: {},
      document: {
        querySelectorAll: () => buttons,
        getElementById: (id) => id === 'hint' ? hint : { addEventListener: (_, handler) => { click = handler; } },
      },
      map: {
        doubleClickZoom: { enable() { zoomEnabled = true; }, disable() { zoomEnabled = false; } },
        getBounds: () => ({ getWest: () => 1, getSouth: () => 2, getEast: () => 3, getNorth: () => 4 }),
        getSource: () => ({ setData(data) { drawn = data; } }),
      },
      refresh() { refreshes++; },
    });
    const start = source.indexOf('  function clearDrawn(');
    const end = source.indexOf('  document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener', start);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(source.slice(start, end), context);
    const handler = source.split('\n').find((line) => line.includes('getElementById("spView").addEventListener'));
    assert.ok(handler);
    vm.runInContext(handler, context);
    click();

    assert.equal(context.mode, 'select');
    assert.equal(context.measurePts.length, 0);
    assert.equal(hint.dataset.on, 'false');
    assert.equal(zoomEnabled, true);
    assert.deepEqual(buttons.map((button) => button['aria-pressed']), ['true', 'false', 'false']);
    const extent = [[1, 2], [3, 2], [3, 4], [1, 4], [1, 2]];
    assert.deepEqual(JSON.parse(JSON.stringify(context.S.spatial)), extent);
    assert.equal(drawn.features.length, 1);
    assert.equal(drawn.features[0].geometry.type, 'Polygon');
    assert.deepEqual(JSON.parse(JSON.stringify(drawn.features[0].geometry.coordinates)), [extent]);
    assert.equal(refreshes, 1);
  });
}
