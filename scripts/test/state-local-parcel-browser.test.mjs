import assert from 'node:assert/strict';
import test from 'node:test';
import { parcelResults, parcelViewUrl } from '../../shared/state-local/parcel-browser.mjs';

const parcels = [
  { properties: { id: 1, t9: '000000001', zone: 0, acres: 0 } },
  { properties: { id: 2, t9: '000000002', zone: 1, acres: 0.25 } },
  { properties: { id: 3, t9: '000000003', zone: 1, acres: null } },
];
test('zoning filter preserves zero-valued codes and summarizes every matching parcel', () => {
  const result = parcelResults(parcels, '0');
  assert.deepEqual(result.features, [parcels[0]]);
  assert.equal(result.acres, 0);
  assert.equal(result.missingArea, 0);
  const other = parcelResults(parcels, '1');
  assert.deepEqual(other.features, parcels.slice(1));
  assert.equal(other.acres, 0.25);
  assert.equal(other.missingArea, 1);
  assert.equal(parcelResults(parcels, '').features.length, 3);
  assert.equal(parcelResults(parcels, 'missing').features.length, 0);
});
test('share URLs retain leading-zero parcel IDs and the current zoning filter', () => {
  const url = new URL(parcelViewUrl('https://example.test/property/?zone=2&tmk=old', { tmk: '000000001', zone: '0' }));
  assert.equal(url.searchParams.get('tmk'), '000000001');
  assert.equal(url.searchParams.get('zone'), '0');
  assert.equal(new URL(parcelViewUrl(url, { tmk: '000000002', zone: '' })).searchParams.has('zone'), false);
});
