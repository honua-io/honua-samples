import test from 'node:test';
import assert from 'node:assert/strict';
import { polygonClause } from '../src/analysis-spatial.mjs';
import { previewAnalysisCql2 } from '../src/analysis-query.mjs';
import { createAnalysisShareUrl, parseAnalysisShare } from '../src/analysis-share.mjs';

const geometry = { type: 'Polygon', coordinates: [[[-156.45, 20.85], [-156.42, 20.85],
  [-156.44, 20.87], [-156.45, 20.85]]] };

test('a drawn triangle remains a polygon in SDK query, CQL2 and anonymous share state', () => {
  const clause = polygonClause(geometry);
  assert.equal(clause.spatialScope.filter.geometryType, 'esriGeometryPolygon');
  assert.deepEqual(clause.spatialScope.filter.geometry.rings[0], [...geometry.coordinates[0]].reverse());
  const text = previewAnalysisCql2([clause]);
  assert.match(text, /S_INTERSECTS\(geometry, POLYGON/);
  assert.match(text, /-156\.44 20\.87/);
  assert.doesNotMatch(text, /-156\.42 20\.87/);
  const address = 'https://samples.honua.io/maui-workbench/app/analysis.html?requestsService=r&requestsLayer=1&parcelsService=p&parcelsLayer=2';
  const url = createAnalysisShareUrl(address, { catalog: 'requests', clauses: [clause] });
  assert.deepEqual(parseAnalysisShare(new URL(url).hash).clauses, [clause]);
  clause.value.coordinates[0][0][0] = 0;
  assert.equal(geometry.coordinates[0][0][0], -156.45);
});

test('invalid polygon state fails closed instead of broadening or repairing it', () => {
  const invalid = [null, {}, { ...geometry, token: 'extra' }, { ...geometry, type: 'MultiPolygon' },
    { ...geometry, coordinates: [...geometry.coordinates, geometry.coordinates[0]] },
    ...[
      [[0, 0], [1, 0], [0, 1]],
      [[0, 0], [1, 0], [2, 0], [0, 0]],
      [[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]],
      [[0, 0], [1, 0], [1, 0], [0, 1], [0, 0]],
      [[0, 0], [181, 0], [0, 1], [0, 0]],
      [[179, 0], [-179, 0], [179, 1], [179, 0]],
      [[0, 0], [1, Infinity], [0, 1], [0, 0]],
      [[0, 0, 1], [1, 0], [0, 1], [0, 0, 1]],
    ].map((ring) => ({ type: 'Polygon', coordinates: [ring] })),
  ];
  for (const value of invalid) assert.throws(() => polygonClause(value), /polygon/i);
});

test('the polygon vertex limit includes exactly 100 distinct vertices and one closure', () => {
  const make = (count) => {
    const ring = Array.from({ length: count }, (_, index) => [Math.cos(index * 2 * Math.PI / count), Math.sin(index * 2 * Math.PI / count)]);
    return { type: 'Polygon', coordinates: [[...ring, [...ring[0]]]] };
  };
  assert.equal(polygonClause(make(100)).value.coordinates[0].length, 101);
  assert.throws(() => polygonClause(make(101)), /polygon/i);
});
