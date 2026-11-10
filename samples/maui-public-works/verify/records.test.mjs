import assert from 'node:assert/strict';
import { test } from 'node:test';
import { associatedInspections, bridgeRecord, exerciseRecord, filterFeatures } from '../src/records.mjs';
import { exerciseFeature, bridgeFeature } from './fixture.mjs';

test('PW-03: all five work-order stages preserve the exercise timeline', () => {
  const orders = Array.from({ length: 34 }, (_, index) => exerciseRecord(exerciseFeature(index).properties));
  assert.equal(new Set(orders.map((row) => row.status)).size, 5);
  assert.equal(orders.filter((row) => row.closed !== null).length, 6);
  assert.equal(orders[0].asOf, Date.parse('2026-11-03T23:59:59.999Z'));
});

test('PW-02: inspection links require the exact road asset key, never proximity', () => {
  const order = exerciseFeature();
  const matching = exerciseFeature(8, 'inspection');
  const nearby = exerciseFeature(1, 'inspection');
  nearby.geometry = matching.geometry;
  assert.deepEqual(associatedInspections(order, [matching, nearby]), [matching]);
});

test('PW-01: historical bridge condition is kept separate from exercise condition', () => {
  const bridge = bridgeRecord(bridgeFeature(2).properties);
  assert.equal(bridge.kind, 'bridge');
  assert.equal(bridge.bridge_condition, 'P');
  for (const change of [{ county_code_003: '005' }, { bridge_condition: 'safe' }, { deck_cond_058: '10' }, { structure_number_008: '' }]) {
    assert.throws(() => bridgeRecord({ ...bridge, ...change }));
  }
  assert.equal(filterFeatures([bridgeFeature(0), bridgeFeature(2)], { status: '', condition: 'P', search: '' }).length, 1);
});

test('PW-02/PW-03: reject unsafe provenance, inconsistent dates and invented assignments', () => {
  const row = exerciseFeature().properties;
  for (const change of [{ is_demo: false }, { exercise_only: false }, { data_origin: 'observed' }, { display_label: '' },
    { status: 'constructor' }, { crew: 'Real employee' }, { condition: 'good' }, { record_id: '' },
    { anchor_source: 'other-road' }, { anchor_feature_id: NaN }, { anchor_feature_id: Infinity }, { asset_id: 'maui-roads:999' },
    { due_at: '2026-01-01T00:00:00Z' }, { scenario_date: '2026-02-30' }, { closed_at: row.opened_at }]) {
    assert.throws(() => exerciseRecord({ ...row, ...change }));
  }
  const epoch = exerciseRecord({ ...row, opened_at: Date.parse(row.opened_at), due_at: Date.parse(row.due_at) });
  assert.equal(epoch.opened_at, row.opened_at);
});
