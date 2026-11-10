import test from 'node:test';
import assert from 'node:assert/strict';
import { zoneGeometry, containsPoint, parseLocation, nearestShelter } from '../src/location.mjs';
const ring = [[0,0],[10,0],[10,10],[0,10],[0,0]];
test('zone lookup preserves holes, disjoint rings and boundary uncertainty', () => {
  const polygon = zoneGeometry({ rings: [ring, [[2,2],[4,2],[4,4],[2,4],[2,2]], [[20,20],[21,20],[21,21],[20,21],[20,20]]] });
  assert.equal(polygon.type, 'MultiPolygon');
  assert.equal(polygon.coordinates.length, 2);
  assert.equal(polygon.coordinates[0].length, 2);
  assert.equal(containsPoint([1,1], polygon), true);
  assert.equal(containsPoint([3,3], polygon), false);
  assert.equal(containsPoint([20.5,20.5], polygon), true);
  assert.equal(containsPoint([11,11], polygon), false);
  assert.equal(containsPoint([0,5], polygon), true);
  assert.throws(() => zoneGeometry({ rings: [[[0,0],[1,0],[1,1],[0,1]]] }), /Invalid/);
  assert.throws(() => zoneGeometry({ rings: [ring], spatialReference: { wkid: 3857 } }), /WGS84/);
});
test('location entry rejects blank, ambiguous and outside-area coordinates', () => {
  assert.deepEqual(parseLocation('20.89, -156.47'), [-156.47,20.89]);
  for (const value of ['', ',', '20.89,', '20.89,-156.47,0', '-156.47,20.89', '21.5,-156.47']) assert.throws(() => parseLocation(value));
});
test('nearest exercise shelter excludes closed resources and handles no candidates', () => {
  const feature = (id, status, x) => ({ id, geometry: { type: 'Point', coordinates: [x,20.89] }, properties: { record_type: 'exercise_shelter', status } });
  const records = [feature('closed','exercise_closed',-156.47),feature('open','exercise_open',-156.48)];
  assert.equal(nearestShelter([-156.47,20.89], records).feature.id, 'open');
  assert.equal(nearestShelter([-156.47,20.89], []), undefined);
});
