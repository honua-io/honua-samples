import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportCsv, exportGeojson, selectRecords, summarize, validateRecord, weeklyTrend } from '../src/records.mjs';
import { collectRequests, requestFeature, sourceBinding } from '../src/source.mjs';
import { request, wireFeature } from './fixture.mjs';

const records = () => [0, 1, 2].map((index) => requestFeature(wireFeature(index)));

test('SR-02: metrics use the scenario date, including overdue and median closure duration', () => {
  assert.deepEqual(summarize(records()), { total: 3, open: 2, closed: 1, overdue: 2, today: 0, medianDays: 2, withinSla: 1 });
  const rows = records();
  rows[0].properties.created = rows[0].properties.asOf - 1;
  assert.equal(summarize(rows).today, 1);
  assert.equal(summarize([]).medianDays, null);
  assert.equal(summarize([]).withinSla, null);
});

test('SR-01/SR-03: all filters share one selection and weekly counts match event dates', () => {
  const filters = { status: '', category: '', district: '', search: '' };
  assert.equal(selectRecords(records(), { ...filters, status: 'exercise_open' }).length, 1);
  assert.equal(selectRecords(records(), { ...filters, category: 'drainage', district: 'Demo district 2 (fictional)' }).length, 0);
  assert.equal(selectRecords(records(), { ...filters, search: 'CREW 2' }).length, 1);
  const weeks = weeklyTrend(records(), records()[0].properties.asOf);
  assert.equal(weeks.length, 12);
  assert.equal(weeks.reduce((sum, week) => sum + week.opened, 0), 3);
  assert.equal(weeks.reduce((sum, week) => sum + week.closed, 0), 1);
});

test('SR-05: unsafe provenance, timeline and contract values fail closed', () => {
  for (const change of [{ is_demo: false }, { exercise_only: false }, { data_origin: 'observed' }, { display_label: '' },
    { status: 'constructor' }, { category: 'toString' }, { district: 'Real district' }, { crew: 'Real employee' },
    { closed_at: '2026-11-01T00:00:00Z' }, { due_at: '2026-01-01' }, { scenario_date: '2026-10-01' }, { scenario_date: '2026-02-30' }, { created_at: 0 }, { due_at: '2026-11-31T00:00:00Z' }]) {
    assert.throws(() => validateRecord({ ...request().properties, ...change }));
  }
  assert.throws(() => requestFeature({ ...wireFeature(0), geometry: { paths: [[]] } }));
  assert.throws(() => requestFeature({ ...wireFeature(0), geometry: { x: 181, y: 20 } }));
});

test('SR-08: exports retain provenance and scenario date, omit unapproved fields, and escape CSV formulas', () => {
  const rows = records();
  rows[0].properties.reporter_email = 'private@example.invalid';
  rows[0].properties.record_id = '=1+1';
  const csv = exportCsv(rows);
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /scenario_date/);
  assert.match(csv, /DEMO DATA/);
  assert.doesNotMatch(csv, /private@example|asOf/);
  const geojson = exportGeojson(rows);
  assert.equal(geojson.features.length, 3);
  assert.equal(geojson.features[0].properties.scenario_date, '2026-11-03');
  assert.equal(geojson.features[0].properties.reporter_email, undefined);
});

test('binding permits approved demo or disposable localhost, never credentials or arbitrary servers', () => {
  assert.equal(sourceBinding(''), null);
  assert.equal(sourceBinding('?service=exercise&layer=1').baseUrl, 'https://demo.honua.io');
  for (const suffix of ['&baseUrl=https://example.invalid', '&baseUrl=https://demo.honua.io/a', '&baseUrl=https://user@demo.honua.io', '&baseUrl=javascript:alert(1)']) {
    assert.throws(() => sourceBinding(`?service=exercise&layer=1${suffix}`));
  }
  assert.throws(() => sourceBinding('?service=exercise'));
});

test('pagination collects beyond the server page size using published SDK query fields', async () => {
  const calls = [];
  const client = { async queryFeatures(query) {
    calls.push(query);
    if (query.extraParams?.returnCountOnly) return { count: 205 };
    return { features: Array.from({ length: query.resultOffset ? 5 : 200 }, (_, i) => wireFeature(i + query.resultOffset)) };
  } };
  const result = await collectRequests(client, { serviceId: 'exercise', layerId: 0 });
  assert.equal(result.length, 205);
  assert.equal(calls[1].orderByFields, 'objectid ASC');
  assert.equal(calls[2].resultOffset, 200);
});

test('pagination rejects truncated, duplicated, changing or mixed-date results', async () => {
  for (const mode of ['truncated', 'duplicates', 'changed', 'dates']) {
    let counts = 0;
    const client = { async queryFeatures(query) {
      if (query.extraParams?.returnCountOnly) return { count: mode === 'changed' && counts++ ? 3 : 2 };
      if (mode === 'truncated') return { features: [wireFeature(0)] };
      const second = wireFeature(mode === 'duplicates' ? 0 : 1);
      if (mode === 'dates') second.attributes.scenario_date = '2026-11-04';
      return { features: [wireFeature(0), second] };
    } };
    await assert.rejects(collectRequests(client, { serviceId: 'exercise', layerId: 0 }), /changed or pagination/);
  }
});
