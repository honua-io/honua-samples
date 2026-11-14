import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function answers(properties) {
  const window = {};
  const source = await readFile(new URL('../../shared/state-local/parcel-answers.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { window, Intl, Number });
  return window.HonuaParcelAnswers.summarize(properties);
}

test('assessment and area answers quote the selected snapshot figures', async () => {
  const rows = await answers({ t9: '001234567', land: 602300, bldg: 132800, acres: 0.326, fld: 'AE' });
  assert.equal(rows.length, 3);
  assert.match(rows[0].answer, /001234567.*\$602,300.*\$132,800/);
  assert.match(rows[1].answer, /0\.326 acres.*14,200 sq ft/);
  assert.match(rows[2].answer, /AE.*0\.326 acres/);
});

test('zero assessments and acreage remain zero rather than missing', async () => {
  const rows = await answers({ t9: '000000001', land: 0, bldg: 0, acres: 0, fld: 'X' });
  assert.match(rows[0].answer, /land assessment \$0.*building value \$0/);
  assert.match(rows[1].answer, /0\.000 acres.*0 sq ft/);
});

test('unavailable figures and flood overlays are never invented', async () => {
  const rows = await answers({ t9: '001234567', land: null, bldg: -1, acres: NaN });
  assert.match(rows[0].answer, /land assessment unavailable.*building value unavailable/);
  assert.match(rows[1].answer, /area unavailable/);
  assert.match(rows[2].answer, /flood zone unavailable/);
  assert.doesNotMatch(rows.map((row) => row.answer).join(' '), /NaN|\$0|zone X/);
});


test('changing the parcel clears the announced answer and renders data as text', async () => {
  const element = () => ({ children: [], textContent: '', setAttribute() {},
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    addEventListener(name, callback) { this[name] = callback; },
  });
  const window = {}, root = element();
  const source = await readFile(new URL('../../shared/state-local/parcel-answers.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { window, Intl, Number, document: { createElement: element } });
  const control = window.HonuaParcelAnswers.mount(root);
  control.update({ t9: '001234567', land: 0, bldg: 0, acres: 0, fld: 'X' });
  root.children[0].children[0].click();
  assert.match(root.children[1].textContent, /001234567/);
  control.update({ t9: '000000002', land: 9, bldg: 8, acres: 1, fld: '<img src=x>' });
  assert.equal(root.children[1].textContent, '');
  root.children[0].children[2].click();
  assert.match(root.children[1].textContent, /000000002.*<img src=x>/);
  assert.doesNotMatch(root.children[1].textContent, /001234567/);
  assert.equal(root.children[1].children.length, 0);
});
