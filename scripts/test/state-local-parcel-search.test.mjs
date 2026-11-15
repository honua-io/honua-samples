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
    parcels: [{ properties: { id: 7, t9: '001234567', zone: 'R-1' } }, { properties: { id: 8, t9: '237004006', zone: 'B-2' } },
      { properties: { id: 9, t9: '237004007', zone: 'R-1' } }, { properties: { id: 10, t9: '238007001', zone: 'R-1' } }],
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

for (const query of ['370040060000', '2370040060000', '3-7-004:006:0000', '(2) 3-7-004-006-0000', '3-7-4:6', '(2) 3-7-4:6']) {
  test(`parcel search resolves ${query} to its base parcel`, async () => {
    const { input, list, selected } = await fixture();
    input.value = query; input.fire('input');
    assert.equal(list.children[0].textContent, 'TMK 237004006');
    input.fire('keydown', { key: 'Enter' });
    assert.equal(selected[0].id, 8);
  });
}

for (const query of ['370040060001', '2370040060001', '3-7-4:6:0001', '(2) 3-7-004-006-0001']) {
  test(`parcel search explains unsupported CPR unit ${query}`, async () => {
    const { input, list, selected } = await fixture();
    input.value = query; input.fire('input');
    assert.match(list.children[0].textContent, /CPR unit lookup is not supported/);
    assert.equal(list.children[0].attributes['aria-disabled'], 'true');
    input.fire('keydown', { key: 'Enter' });
    assert.deepEqual(selected, []);
  });
}

test('zero CPR suffix preserves leading zeroes in the base parcel', async () => {
  const { input, selected } = await fixture();
  input.value = '0012345670000'; input.fire('input');
  input.fire('keydown', { key: 'Enter' });
  assert.equal(selected[0].t9, '001234567');
});

for (const query of ['38007001', '238007001', '3-8-007:001', '380070010000', '2380070010000', '3-8-007:001:0000', '(2) 3-8-007-001-0000', '3-8-7:1']) {
  test(`parcel search selects the same property for ${query}`, async () => {
    const { input, selected } = await fixture();
    input.value = query; input.fire('input');
    input.fire('keydown', { key: 'Enter' });
    assert.equal(selected[0].t9, '238007001');
  });
}

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

for (const query of ['3-7-004:0', '3-7-004:00', '(2) 3-7-004:00']) {
  test(`partial formatted parcel search preserves suggestions for ${query}`, async () => {
    const { input, list } = await fixture();
    input.value = query; input.fire('input');
    assert.deepEqual(list.children.map((child) => child.textContent), ['TMK 237004006', 'TMK 237004007']);
  });
}

test('partial formatted search finds the property while its parcel number is unfinished', async () => {
  const { input, list } = await fixture();
  input.value = '3-8-007:00'; input.fire('input');
  assert.equal(list.children[0].textContent, 'TMK 238007001');
});
