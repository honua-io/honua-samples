import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countyParcel, countyTmk, countyFields } from '../../shared/state-local/county-parcel.mjs';

test('county TMKs remain text with leading zeroes and accept display separators', () => {
  assert.equal(countyTmk(' 0-3-8-007-001 '), '038007001');
  assert.throws(() => countyTmk(38007001));
  assert.throws(() => countyTmk('238007001<script>'));
});

test('county details expose only public fields and use raw lookup geometry', () => {
  const geometry = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [0, 0]]]] };
  const publication = { publicFields: [{ name: 'tmk_txt' }, { name: 'zone' }, { name: 'plat' }, { name: 'taxacres' }, { name: 'homeowner' }] };
  const feature = countyParcel(publication, { attributes: { tmk_txt: '038007001', zone: '3', plat: '007', taxacres: null, homeowner: 'Private', bldgvalue: 42 }, geometry });
  assert.deepEqual(feature, { type: 'Feature', geometry, properties: { tmk_txt: '038007001', zone: '3', plat: '007', taxacres: null } });
  assert.equal(countyFields.zone, 'Tax map zone');
  assert.notEqual(countyFields.zone, 'Zoning');
});

test('county lookup refuses incomplete or mismatched identity and missing geometry', () => {
  const publication = { publicFields: [{ name: 'tmk_txt' }] };
  assert.throws(() => countyParcel(publication, { attributes: { tmk_txt: 238007001 }, geometry: {} }));
  assert.throws(() => countyParcel(publication, { attributes: { tmk_txt: '238007001' }, geometry: null }));
});
