import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const opened = [];
mock.module('@honua/sdk-js/publication', {
  namedExports: {
    openPublication: async () => {
      opened.push('open');
      return {
        display: { pmtilesUrl: 'https://example.test/parcels.pmtiles', promoteId: 'tmk_txt', minzoom: 0, maxzoom: 14, sourceLayer: 'parcels' },
        publicFields: [],
      };
    },
    publicationSource: () => ({ lookup: async () => ({ result: { features: [] } }) }),
  },
});

globalThis.location = new URL('https://demo.example/property');
globalThis.window = { HM: { bbox: () => [0, 0, 1, 1] } };

const { mountCountyPublication } = await import('../../shared/state-local/county-publication.mjs');

class Node {
  constructor() {
    this.listeners = new Map();
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
  }

  addEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  async dispatch(type) {
    for (const fn of this.listeners.get(type) ?? []) await fn();
  }

  removeAttribute(name) { if (name === 'href') this.href = undefined; }
}

function page({ open }) {
  const root = new Node();
  root.open = open;
  const nodes = {
    '#countySearch': new Node(),
    '#countyTmk': new Node(),
    '#countyStatus': new Node(),
    '#countyDetails': Object.assign(new Node(), { replaceChildren() {}, append() {} }),
    '#countyExports': new Node(),
    '#countyShare': new Node(),
    '#countyMapStatus': new Node(),
  };
  root.querySelector = (selector) => nodes[selector];
  root.querySelectorAll = () => [];
  const layers = {
    'parcels-fill': { visibility: 'none' },
    'parcels-line': { visibility: 'visible' },
    'parcels-sel': { visibility: 'visible' },
  };
  const sources = {};
  const map = {
    getLayer: (id) => layers[id],
    getLayoutProperty: (id, prop) => layers[id][prop],
    setLayoutProperty: (id, prop, value) => { layers[id][prop] = value; },
    getSource: (id) => sources[id],
    addSource: (id) => { sources[id] = { id }; },
    addLayer: (layer) => { layers[layer.id] = { visibility: 'visible' }; },
    on() {},
    once() {},
    getCenter: () => ({ lng: 0, lat: 0 }),
    getZoom: () => 12,
    getBearing: () => 0,
    getPitch: () => 0,
    jumpTo() {},
    fitBounds() {},
  };
  return { root, map, layers, sources };
}

test('an already-open county panel connects and attaches its map at mount', async () => {
  opened.length = 0;
  const { root, map, sources } = page({ open: true });
  mountCountyPublication({ root, map: () => map });
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  assert.equal(opened.length, 1);
  assert.ok(sources['county-publication']);
});

test('closing the county panel restores the snapshot layers the user had hidden', async () => {
  const { root, map, layers } = page({ open: false });
  mountCountyPublication({ root, map: () => map });
  root.open = true;
  await root.dispatch('toggle');
  root.open = false;
  await root.dispatch('toggle');
  assert.equal(layers['parcels-fill'].visibility, 'none');
  assert.equal(layers['parcels-line'].visibility, 'visible');
});
