import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countyFieldText, countyParcel, countyTmk, countyFields } from '../../shared/state-local/county-parcel.mjs';

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

test('county details carry the published zoning district with its own labels', () => {
  const geometry = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] };
  const publication = { publicFields: [{ name: 'tmk_txt' }, { name: 'zone' }, { name: 'zoning_code' }, { name: 'zoning_district' }] };
  const feature = countyParcel(publication, { attributes: { tmk_txt: '238007001', zone: '3', zoning_code: '929', zoning_district: 'PK Park' }, geometry });
  assert.deepEqual(feature.properties, { tmk_txt: '238007001', zone: '3', zoning_code: '929', zoning_district: 'PK Park' });
  assert.equal(countyFields.zoning_district, 'County zoning district');
  assert.equal(countyFields.zone, 'Tax map zone');
  assert.doesNotMatch(countyFields.zone, /zoning/iu);
});

test('a parcel without a main zoning district keeps null and says why', () => {
  const geometry = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] };
  const publication = { publicFields: [{ name: 'tmk_txt' }, { name: 'zoning_district' }, { name: 'taxacres' }] };
  const feature = countyParcel(publication, { attributes: { tmk_txt: '238007001', zoning_district: null, taxacres: null }, geometry });
  assert.equal(feature.properties.zoning_district, null);
  assert.equal(countyFieldText('zoning_district', null), 'None (no district covers at least 10%)');
  assert.equal(countyFieldText('taxacres', null), 'Unknown');
  assert.equal(countyFieldText('zoning_code', '929'), '929');
});

test('county lookup refuses incomplete or mismatched identity and missing geometry', () => {
  const publication = { publicFields: [{ name: 'tmk_txt' }] };
  assert.throws(() => countyParcel(publication, { attributes: { tmk_txt: 238007001 }, geometry: {} }));
  assert.throws(() => countyParcel(publication, { attributes: { tmk_txt: '238007001' }, geometry: null }));
});
