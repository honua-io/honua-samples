import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../shared/state-local/honua-map.js', import.meta.url), 'utf8');

function fixture() {
  let theme = 'light';
  const root = {
    setAttribute: (_, value) => { theme = value; },
    getAttribute: () => theme,
  };
  const context = vm.createContext({
    window: {}, document: { documentElement: root, readyState: 'loading',
      addEventListener() {}, querySelectorAll: () => [], dispatchEvent() {} },
    getComputedStyle: () => ({ getPropertyValue: () => theme === 'dark' ? '#ff922b' : '#d9480f' }),
    localStorage: { setItem() {} }, CustomEvent: class {},
  });
  vm.runInContext(source, context);
  return context.window.HM;
}

function mapFixture(styleLoaded) {
  const layers = new Map();
  const listeners = new Map();
  return {
    layers,
    isStyleLoaded: () => styleLoaded,
    getLayer: (id) => layers.get(id),
    addLayer: (layer) => layers.set(layer.id, layer),
    setPaintProperty: (id, key, value) => { layers.get(id).paint[key] = value; },
    on: (event, handler) => listeners.set(event, handler),
    once: (event, handler) => listeners.set(event, handler),
    fire: (event) => listeners.get(event)?.(),
  };
}

for (const styleLoaded of [true, false]) {
  test(`theme repaints existing overlays when tile readiness is ${styleLoaded}`, () => {
    const kit = fixture();
    const map = mapFixture(styleLoaded);
    kit.maps.push(map);
    kit.themed(map, { id: 'ds-fill', paint: { 'fill-color': '--hz-tsu' } });
    kit.setTheme('dark');
    assert.equal(map.layers.get('ds-fill').paint['fill-color'], '#ff922b');
    kit.setTheme('light');
    assert.equal(map.layers.get('ds-fill').paint['fill-color'], '#d9480f');
    assert.equal(kit.maps[0], map);
  });
}

test('a map without overlays picks up the latest theme when layers are added', () => {
  const kit = fixture();
  const map = mapFixture(false);
  kit.maps.push(map);
  kit.setTheme('dark');
  kit.setTheme('light');
  kit.setTheme('dark');
  kit.themed(map, { id: 'ds-fill', paint: { 'fill-color': '--hz-tsu' } });
  assert.equal(map.layers.get('ds-fill').paint['fill-color'], '#ff922b');
});
