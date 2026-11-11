import test from 'node:test';
import assert from 'node:assert/strict';
import { bindAsyncExplanation } from '../src/analysis-explanation.mjs';
import { createLatestSketchBinding } from '../src/analysis-sketch-binding.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function explanation() {
  const trigger = new EventTarget();
  const pending = deferred();
  let model = {};
  const output = { textContent: '', replaceChildren() { this.textContent = ''; } };
  const binding = bindAsyncExplanation({ trigger, event: 'click', output, model: () => model,
    pending: 'Working', run: () => pending.promise, render: (value) => { output.textContent = value; } });
  return { trigger, pending, output, binding, changeSource() { model = {}; } };
}

for (const action of ['invalidate', 'changeSource']) for (const outcome of ['resolve', 'reject']) {
  test(`Delayed explanation ${outcome} cannot replace output after ${action}`, async () => {
    const view = explanation();
    view.trigger.dispatchEvent(new Event('click'));
    assert.equal(view.output.textContent, 'Working');
    if (action === 'invalidate') view.binding.invalidate(); else view.changeSource();
    view.output.textContent = 'Current source';
    view.pending[outcome](outcome === 'resolve' ? 'Old result' : new Error('Old failure'));
    await new Promise(setImmediate);
    assert.equal(view.output.textContent, 'Current source');
  });
}

test('Only the latest catalog sketch binds when map readiness is delayed', async () => {
  const ready = deferred();
  const attached = [];
  const binding = createLatestSketchBinding({ ready: ready.promise,
    create: async (name) => ({ attach() { attached.push(name); }, dispose() {} }) });
  const first = binding.bind('first');
  const second = binding.bind('second');
  ready.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(attached, ['second']);
});

test('A sketch created for a superseded catalog is disposed without attaching', async () => {
  const first = deferred();
  const attached = [], disposed = [];
  const sketch = (name) => ({ attach() { attached.push(name); }, dispose() { disposed.push(name); } });
  const binding = createLatestSketchBinding({ ready: Promise.resolve(),
    create: (name) => name === 'first' ? first.promise : Promise.resolve(sketch(name)) });
  const obsolete = binding.bind('first');
  await new Promise(setImmediate);
  await binding.bind('second');
  first.resolve(sketch('first'));
  await obsolete;
  assert.deepEqual(attached, ['second']);
  assert.deepEqual(disposed, ['first']);
  binding.dispose();
  assert.deepEqual(disposed, ['first', 'second']);
});
