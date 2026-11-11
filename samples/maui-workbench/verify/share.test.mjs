import { boundingBoxClause } from '../src/analysis-spatial.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRangeClauses } from '../src/analysis-query.mjs';
import { createAnalysisShareUrl, parseAnalysisShare } from '../src/analysis-share.mjs';

const address = 'https://samples.honua.io/maui-workbench/app/analysis.html?requestsService=r&requestsLayer=1&parcelsService=p&parcelsLayer=2&token=discard-me';
const query = { id: 'query', field: 'gisacres', operator: '>=', value: .25 };
const chart = { id: 'chart-status', field: 'status', operator: '=', value: 'exercise_open' };
const link = (catalog, clauses) => createAnalysisShareUrl(address, { catalog, clauses });

test('share restores the parcel catalog and numeric filter through the SDK serializer', () => {
  const url = new URL(link('parcels', [query]));
  assert.equal(url.searchParams.has('token'), false);
  assert.equal(url.searchParams.get('parcelsService'), 'p');
  assert.deepEqual(parseAnalysisShare(url.hash), { catalog: 'parcels', clauses: [query] });
});

test('share restores numeric record identity and the camera without changing query filters', () => {
  const presentation = { selection: [7, 42], camera: [-156.43, 20.86, 13, -20, 30] };
  const url = createAnalysisShareUrl(address, { catalog: 'requests', clauses: [chart], presentation });
  assert.deepEqual(parseAnalysisShare(new URL(url).hash), { catalog: 'requests', clauses: [chart], presentation });
});

for (const presentation of [
  null, [], { token: 'secret' }, { selection: ['1'] }, { selection: [1, 1] },
  { selection: [Number.MAX_SAFE_INTEGER + 1] }, { selection: Array.from({ length: 101 }, (_, i) => i) },
  { camera: [-181, 20, 9, 0, 0] }, { camera: [-156, 90, 9, 0, 0] },
  { camera: [-156, 20, 23, 0, 0] }, { camera: [-156, 20, 9, 181, 0] },
  { camera: [-156, 20, 9, 0, 61] }, { camera: [-156, 20, 9, 0] },
]) test(`share rejects invalid presentation ${JSON.stringify(presentation)}`, () => {
  assert.throws(() => parseAnalysisShare(`#wb=1&catalog=requests&view=${encodeURIComponent(JSON.stringify(presentation))}`), /share/i);
});

test('share preserves chart ownership separately from the field filter', () => {
  const field = { id: 'query', field: 'category', operator: '=', value: "road's drainage" };
  assert.deepEqual(parseAnalysisShare(new URL(link('requests', [field, chart])).hash), {
    catalog: 'requests', clauses: [chart, field],
  });
  assert.deepEqual(parseAnalysisShare(new URL(link('requests', [])).hash), { catalog: 'requests', clauses: [] });
  assert.equal(parseAnalysisShare(''), null);
  assert.equal(parseAnalysisShare('#main'), null);
});

for (const [label, fragment] of [
  ['unknown version', '#wb=2&catalog=requests'],
  ['unknown catalog', '#wb=1&catalog=other'],
  ['raw predicate', '#wb=1&catalog=requests&where=1%3D1'],
  ['malformed JSON', '#wb=1&catalog=requests&f=broken'],
  ['non-object clauses', '#wb=1&catalog=requests&f=[]'],
  ['unsupported field', `#wb=1&catalog=requests&f=${encodeURIComponent(JSON.stringify({ query: { field: 'password', operator: '=', value: 'x' } }))}`],
  ['source override', `#wb=1&catalog=requests&f=${encodeURIComponent(JSON.stringify({ query: { field: 'status', operator: '=', value: 'x', appliesTo: ['other'] } }))}`],
  ['oversized state', `#wb=1&catalog=requests&f=${'x'.repeat(9000)}`],
]) test(`share rejects ${label} instead of silently broadening the query`, () => {
  assert.throws(() => parseAnalysisShare(fragment), /share/i);
});

test('share rejects incompatible chart and numeric filters and unsafe endpoints', () => {
  assert.throws(() => link('parcels', [chart]), /share/i);
  assert.throws(() => link('parcels', [{ ...query, value: 'NaN' }]), /share/i);
  assert.throws(() => link('requests', [{ ...chart, operator: '!=' }]), /share/i);
  assert.throws(() => createAnalysisShareUrl(address.replace('requestsService=r', 'baseUrl=https://untrusted.example&requestsService=r'), {
    catalog: 'requests', clauses: [],
  }), /Connect to/);
});

test('share restores validated date and area clauses without trusting a serialized spatial scope', () => {
  const clauses = [...dateRangeClauses('2026-11-01', '2026-11-02'), boundingBoxClause([-156.44, 20.85, -156.43, 20.87])];
  const restored = parseAnalysisShare(new URL(link('requests', clauses)).hash);
  assert.deepEqual(restored.clauses.sort((a, b) => a.id.localeCompare(b.id)), clauses.sort((a, b) => a.id.localeCompare(b.id)));
  assert.throws(() => link('parcels', dateRangeClauses('2026-11-01', '')), /share/i);
  assert.throws(() => link('requests', [{ id: 'spatial', value: [-156, 21, -157, 22] }]), /share/i);
  assert.throws(() => link('requests', [
    ...dateRangeClauses('2026-11-03', ''), ...dateRangeClauses('', '2026-11-01'),
  ]), /share/i);
});
