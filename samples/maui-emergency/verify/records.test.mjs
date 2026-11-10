import assert from 'node:assert/strict';
import test from 'node:test';
import { namedBindings } from '../../../shared/state-local/binding.mjs';
import { emergencyRecord, exerciseSummary, filterRecords } from '../src/records.mjs';
import { exerciseFeature } from './fixture.mjs';

test('emergency records reject unlabelled, misanchored and inconsistent exercise data', () => {
  const row = exerciseFeature().properties;
  assert.equal(emergencyRecord(row, 'exercise_shelter').asset_id, 'maui-public-schools:1');
  assert.equal(emergencyRecord({ ...row, validation_geometry: false, geometry_source: 'https://planning.hawaii.gov/gis/download-gis-data-expanded/' }, 'exercise_shelter').asset_id, 'maui-public-schools:1');
  for (const change of [{ is_demo: false }, { exercise_only: false }, { anchor_source: 'other' },
    { anchor_feature_id: '' }, { asset_id: 'maui-public-schools:2' }, { record_type: 'actual_shelter' },
    { status: 'open' }, { occupancy: 101 }, { occupancy: -1 }, { occupancy: 1.5 }, { capacity: 0 },
    { closed_at: '2026-11-01T00:00:00.000Z' }, { due_at: '2026-10-29T00:00:00.000Z' },
    { scenario_date: '2026-10-29' }, { opened_at: 'yesterday' }, { validation_geometry: undefined }, { validation_geometry: false }]) {
    assert.throws(() => emergencyRecord({ ...row, ...change }, 'exercise_shelter'), JSON.stringify(change));
  }
});

test('capacity totals exclude closed shelters and closures do not contribute capacity', () => {
  const records = [exerciseFeature(0), exerciseFeature(1), exerciseFeature(2), exerciseFeature(0, 'exercise_closure'), exerciseFeature(2, 'exercise_closure')];
  assert.deepEqual(exerciseSummary(records), { shelters: 3, openShelters: 2, capacity: 200, occupancy: 40, unclosedClosures: 1 });
  assert.deepEqual(exerciseSummary([]), { shelters: 0, openShelters: 0, capacity: 0, occupancy: 0, unclosedClosures: 0 });
  assert.deepEqual(filterRecords(records, { kind: 'exercise_shelter', status: 'exercise_open', search: ' SCHOOLS:1 ' }).map((record) => record.id), ['exercise_shelter-1']);
  assert.equal(filterRecords(records, { kind: '', status: '', search: 'nonexistent' }).length, 0);
});

test('both approved layer bindings are required and retain the shared origin policy', () => {
  assert.equal(namedBindings('', ['shelter', 'closure']), null);
  assert.throws(() => namedBindings('?shelterService=schools&shelterLayer=7', ['shelter', 'closure']), /all layers/);
  const params = '?shelterService=schools&shelterLayer=7&closureService=roads&closureLayer=8';
  assert.equal(namedBindings(params, ['shelter', 'closure']).closure.layerId, 8);
  assert.throws(() => namedBindings(`${params}&baseUrl=https://unapproved.example`, ['shelter', 'closure']), /demo\.honua\.io/);
  assert.throws(() => namedBindings(params.replace('closureLayer=8', 'closureLayer=bad'), ['shelter', 'closure']), /numeric layer/);
});
