import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAnalysisSelection } from '../src/analysis-selection.mjs';

function model() {
  return { catalog: { label: '311 service requests', fields: ['record_id', 'status', 'category'] },
    endpoint: 'https://demo.example/rest/services/requests/FeatureServer/1',
    registry: { snapshot: { clauses: [] } },
    table: { selectionTargets: () => [{ sourceId: 'requests', id: 1 }, { sourceId: 'requests', id: 2 }],
      snapshot: { state: 'ready', stale: false, selection: ['one', 'two'], rows: [
        { key: 'one', attributes: { record_id: 'DEMO-1', status: 'exercise_open', category: 'drainage' } },
        { key: 'two', attributes: { record_id: 'DEMO-2', status: 'exercise_open', category: 'roads' } },
        { key: 'three', attributes: { status: 'exercise_closed', category: 'parks' } },
      ] } } };
}

test('SDK summary cites current layer/filter and counts only selected rows without source requests', async () => {
  const next = model();
  next.source = { query() { assert.fail('summary must not query or write records'); } };
  const result = await summarizeAnalysisSelection(next);
  assert.equal(result.tool, 'summarizeSelection');
  assert.equal(result.count, 2);
  assert.equal(result.layer, next.catalog.label);
  assert.equal(result.endpoint, next.endpoint);
  assert.equal(result.filter, 'TRUE');
  assert.match(result.scope, /2 of 2 selected records/);
  assert.deepEqual(result.fields, ['status — exercise_open: 2', 'category — drainage: 1; roads: 1']);
  next.registry.snapshot.clauses = [{ id: 'query', field: 'status', operator: '=', value: 'exercise_open' }];
  assert.match((await summarizeAnalysisSelection(next)).filter, /status.*exercise_open/);
});

test('off-window and empty selections never invent missing field counts', async () => {
  const next = model();
  next.table.snapshot.rows = [next.table.snapshot.rows[0], undefined];
  const partial = await summarizeAnalysisSelection(next);
  assert.match(partial.scope, /1 of 2 selected records/);
  assert.deepEqual(partial.fields, ['status — exercise_open: 1', 'category — drainage: 1']);
  next.table.snapshot.rows = [];
  assert.deepEqual((await summarizeAnalysisSelection(next)).fields, []);
  next.table.selectionTargets = () => [];
  next.table.snapshot.selection = [];
  assert.equal((await summarizeAnalysisSelection(next)).count, 0);
});

test('stale or failed table results cannot produce a selection explanation', async () => {
  const next = model();
  next.table.snapshot.stale = true;
  await assert.rejects(summarizeAnalysisSelection(next), /Finish the current query/);
  next.table.snapshot.stale = false;
  next.table.snapshot.state = 'error';
  await assert.rejects(summarizeAnalysisSelection(next), /Finish the current query/);
});
