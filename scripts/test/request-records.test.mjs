import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestStore, nextReset, triageSuggestion, openRequestsCsv } from '../../shared/state-local/request-records.mjs';
import { assertExerciseProvenance } from '../../shared/state-local/exercise-provenance.mjs';

const seeds = [{ id: 'SR-1', type: 'Pothole', addr: 'Fictional street', c: [-156.47, 20.889], status: 'New' }];
const input = { type: 'Pothole', addr: 'Fictional corner', note: 'Exercise', lat: 20.889, lng: -156.47, photo: '' };
function fixture() {
  let now = Date.UTC(2026, 10, 14, 23, 59);
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  return { storage, clock: () => now, advance: () => { now += 120000; } };
}
test('report, assignment, status and provenance survive a page reload in this session', () => {
  const options = fixture();
  const store = createRequestStore({ seeds, ...options });
  const report = store.submit(input);
  store.update(report.id, { crew: 'Demo roads', status: 'Assigned' });
  const reopened = createRequestStore({ seeds, ...options });
  const row = reopened.records().find(row => row.id === report.id);
  assert.equal(row.crew, 'Demo roads'); assert.equal(row.status, 'Assigned'); assertExerciseProvenance(row);
  assert.equal(triageSuggestion(row, reopened.records()).duplicateId, 'SR-1');
});
test('reset occurs at the next UTC midnight and clears assignments and reports', () => {
  const options = fixture(), store = createRequestStore({ seeds, ...options });
  store.submit(input); store.update('SR-1', { crew: 'Demo', status: 'Closed' });
  assert.equal(store.resetAt(), nextReset(options.clock()));
  options.advance();
  assert.deepEqual(store.records().map(row => row.id), ['SR-1']); assert.equal(store.records()[0].status, 'New');
  store.submit(input); store.reset(); assert.equal(store.records().length, 1);
});
test('open CSV excludes closed records, neutralizes formulas and keeps provenance', () => {
  const store = createRequestStore({ seeds });
  store.submit({ ...input, addr: '=HYPERLINK("bad")' });
  store.update('SR-1', { crew: '', status: 'Closed' });
  const csv = openRequestsCsv(store.records());
  assert.ok(!csv.includes('SR-1')); assert.ok(csv.includes("'=HYPERLINK"));
  assert.match(csv, /synthetic_demo/); assert.match(csv, /DEMO DATA/); assert.match(csv, /exercise_only/);
});
test('rejects outside locations and unsafe photos; unavailable storage stays usable', () => {
  const store = createRequestStore({ seeds, storage: { getItem() { throw Error(); }, setItem() { throw Error(); } } });
  assert.throws(() => store.submit({ ...input, lat: 0 }), /Maui Nui/);
  assert.throws(() => store.submit({ ...input, photo: 'data:image/svg+xml;base64,AAAA' }), /JPEG/);
  const report = store.submit(input); assert.equal(store.records()[0].id, report.id);
});
test('scripted triage cites only a nearby open report of the same category', () => {
  const report = { ...seeds[0], id: 'DEMO-1' };
  assert.deepEqual(triageSuggestion(report, [report, ...seeds]), { category: 'Pothole', duplicateId: 'SR-1' });
  assert.equal(triageSuggestion(report, [{ ...seeds[0], status: 'Closed' }]).duplicateId, null);
  assert.equal(triageSuggestion(report, [{ ...seeds[0], c: [-156.5, 20.9] }]).duplicateId, null);
  assert.equal(triageSuggestion(report, [{ ...seeds[0], type: 'Trash' }]).duplicateId, null);
});
