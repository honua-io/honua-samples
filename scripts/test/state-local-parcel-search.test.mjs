import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

class Element {
  constructor() { this.attributes = {}; this.listeners = {}; this.children = []; this.dataset = {}; this.value = ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  contains(target) { return target === this || this.children.includes(target); }
  focus() { this.focused = true; this.fire('focus'); }
  fire(name, event = {}) { this.listeners[name]?.({ preventDefault() {}, ...event }); }
}

async function fixture() {
  const input = new Element(), list = new Element();
  input.id = 'q'; list.id = 'sug';
  const selected = [], streets = [], document = new Element();
  document.createElement = () => new Element();
  const window = {};
  const source = await readFile(new URL('../../shared/state-local/parcel-search.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { window, document });
  window.HonuaParcelSearch({ input, list,
    parcels: [{ properties: { id: 7, t9: '001234567', zone: 'R-1' } }, { properties: { id: 8, t9: '237004006', zone: 'B-2' } }, { properties: { id: 9, t9: '237004007', zone: 'R-1' } }],
    streets: ['Lono Avenue', '<Street>'], formatTmk: (value) => value,
    onParcel: (parcel) => selected.push(parcel.properties), onStreet: (street) => streets.push(street),
  });
  return { input, list, selected, streets, document };
}

test('parcel search preserves leading zeroes and selects with Enter', async () => {
  const { input, list, selected } = await fixture();
  input.value = '001234567'; input.fire('input');
  assert.equal(list.children.length, 1);
  assert.match(list.children[0].textContent, /001234567/);
  input.fire('keydown', { key: 'Enter' });
  assert.equal(selected[0].t9, '001234567');
  assert.equal(input.attributes['aria-expanded'], 'false');
  assert.equal(input.attributes['aria-activedescendant'], undefined);
});

test('formatted TMKs and arrow navigation keep focus on the combobox', async () => {
  const { input, list, selected } = await fixture();
  input.value = '(2) 3-7-004:006'; input.fire('input');
  input.fire('keydown', { key: 'ArrowDown' });
  assert.equal(input.attributes.role, 'combobox');
  assert.equal(input.attributes['aria-activedescendant'], list.children[0].id);
  assert.equal(list.children[0].attributes['aria-selected'], 'true');
  input.fire('keydown', { key: 'Enter' });
  assert.equal(selected[0].id, 8);
});

test('street results work with pointer selection and never interpret HTML', async () => {
  const { input, list, streets } = await fixture();
  input.value = '<street>'; input.fire('input');
  assert.equal(list.children[0].textContent, '<Street>');
  list.children[0].fire('click');
  assert.deepEqual(streets, ['<Street>']);
  assert.equal(input.focused, true);
  assert.equal(input.attributes['aria-expanded'], 'false');
});

test('ArrowUp starts at the last suggestion and wraps in both directions', async () => {
  const { input, list } = await fixture();
  input.value = '237'; input.fire('input');
  assert.equal(list.children.length, 2);
  input.fire('keydown', { key: 'ArrowUp' });
  assert.equal(input.attributes['aria-activedescendant'], list.children[1].id);
  input.fire('keydown', { key: 'ArrowDown' });
  assert.equal(input.attributes['aria-activedescendant'], list.children[0].id);
  input.fire('keydown', { key: 'ArrowUp' });
  assert.equal(input.attributes['aria-activedescendant'], list.children[1].id);
});

test('Escape, Tab, outside clicks and unmatched input clear active suggestions', async () => {
  const { input, list, document, selected } = await fixture();
  for (const key of ['Escape', 'Tab']) {
    input.value = '237'; input.fire('input'); input.fire('keydown', { key: 'ArrowDown' });
    input.fire('keydown', { key });
    assert.equal(list.dataset.open, 'false');
    assert.equal(input.attributes['aria-expanded'], 'false');
    assert.equal(input.attributes['aria-activedescendant'], undefined);
  }
  input.fire('focus'); document.fire('click', { target: new Element() });
  assert.equal(input.attributes['aria-expanded'], 'false');
  input.value = 'unmatched'; input.fire('input'); input.fire('keydown', { key: 'Enter' });
  assert.deepEqual(selected, []);
  assert.match(list.children[0].textContent, /No matches/);
  assert.equal(list.children[0].attributes.role, 'option');
  assert.equal(list.children[0].attributes['aria-disabled'], 'true');
  input.value = ''; input.fire('input');
  assert.equal(list.dataset.open, 'false');
});
