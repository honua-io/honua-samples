import { boundingBoxClause } from '../src/analysis-spatial.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRangeClauses, previewAnalysisCql2 } from '../src/analysis-query.mjs';

test('date range includes the complete final UTC day and rejects reversed or impossible dates', () => {
  const clauses = dateRangeClauses('2026-11-01', '2026-11-02');
  assert.deepEqual(clauses.map(({ operator, value }) => [operator, value]), [
    ['>=', '2026-11-01'], ['<', '2026-11-03'],
  ]);
  assert.deepEqual(dateRangeClauses('', ''), []);
  for (const dates of [['2026-02-30', ''], ['2026-11-03', '2026-11-01'], ['', '9999-12-31']]) {
    assert.throws(() => dateRangeClauses(...dates), /date|range/i);
  }
});

test('bounding box preserves longitude/latitude axis order and rejects broadening mistakes', () => {
  assert.deepEqual(boundingBoxClause([-156.44, 20.85, -156.43, 20.87]).value, [-156.44, 20.85, -156.43, 20.87]);
  for (const bounds of [[20.85, -156.44, 20.87, -156.43], [-156, 21, -157, 22], [0, 0, 0, 1], [0, 0, Infinity, 2]]) {
    assert.throws(() => boundingBoxClause(bounds), /bounding box/i);
  }
});

test('public SDK compiles the shared attribute/date/spatial clauses into a CQL2 preview', () => {
  const text = previewAnalysisCql2([
    { id: 'query', field: 'category', operator: '=', value: "road's drainage" },
    ...dateRangeClauses('2026-11-01', '2026-11-02'),
    boundingBoxClause([-156.44, 20.85, -156.43, 20.87]),
  ]);
  assert.match(text, /category = 'road''s drainage'/);
  assert.match(text, /opened_at >= '2026-11-01'/);
  assert.match(text, /opened_at < '2026-11-03'/);
  assert.match(text, /S_INTERSECTS\(geometry, POLYGON/);
  assert.match(text, /-156\.44 20\.85/);
  assert.equal(previewAnalysisCql2([]), 'TRUE');
});
