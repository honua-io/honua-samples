import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../state-local/approved/pages/12-workbench.html', import.meta.url), 'utf8');
const functionSource = (name, next) => source.slice(source.indexOf(`  function ${name}(`), source.indexOf(next, source.indexOf(`  function ${name}(`)));
const escapeSource = source.split('\n').find((line) => line.includes('function escapeHtml('));
const attack = '<img src=x onerror="alert(1)"> & \'quoted\'';
const encoded = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;';

function harness() {
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', getAttribute: () => 'false' });
    return elements.get(id);
  };
  const layer = { cols: [['type', attack]], rows: [{ type: attack }], sum: 'requests' };
  const context = vm.createContext({
    document: { getElementById }, LAYERS: { requests: layer },
    S: { layer: 'requests', attr: [{ f: 'type', op: '=', v: attack }], chartF: {}, time: [attack, attack] },
    LABEL: (L, f) => L.cols.find((c) => c[0] === f)[1],
    money: String, HM: { money: String }, updOps() {}, cqlText: () => attack,
    filtered: () => layer.rows, CITE: { requests: 'requests' }, proposal: null,
    lastPlan: { layer: 'requests', text: attack, cites: [attack], read: [[attack, attack]], ignored: [attack], clauses: [], group: 'type', hash: '123' },
  });
  vm.runInContext(escapeSource, context);
  return { context, elements };
}

test('typed and shared-state filter values stay literal in rows and query chips', () => {
  const { context, elements } = harness();
  vm.runInContext(functionSource('renderFilterUI', '  function updOps('), context);
  vm.runInContext(functionSource('chipText', '  function renderNL('), context);
  vm.runInContext('renderFilterUI()', context);
  assert.ok(elements.get('fRows').innerHTML.includes(encoded));
  assert.ok(elements.get('fField').innerHTML.includes(encoded));
  assert.equal(vm.runInContext('chipText(S.attr[0])', context), `<b>${encoded}</b> = ${encoded}`);
  assert.equal(elements.get('cql').textContent, attack);
});

test('agent explanations, citations and plans escape markup while retaining readable text', () => {
  const { context, elements } = harness();
  vm.runInContext(functionSource('chipText', '  function renderNL('), context);
  vm.runInContext(functionSource('renderNL', '  function renderExplain('), context);
  vm.runInContext(functionSource('renderExplain', '  function renderPlanTab('), context);
  vm.runInContext(functionSource('renderPlanTab', '  // chip edit / remove'), context);
  vm.runInContext('renderNL(); renderExplain(); renderPlanTab(lastPlan)', context);
  for (const id of ['chips', 'nlqCites', 'nlqExp', 'plan']) {
    assert.ok(elements.get(id).innerHTML.includes(encoded), id);
    assert.ok(!elements.get(id).innerHTML.includes('<img'), id);
  }
});

test('chart titles are escaped once at their HTML boundary', () => {
  const { context } = harness();
  vm.runInContext(functionSource('chartTitle', '  const key ='), context);
  assert.equal(vm.runInContext('escapeHtml(chartTitle({ t: "hist", f: "type" }, LAYERS.requests))', context), `${encoded} distribution`);
});
