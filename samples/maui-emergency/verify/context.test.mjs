import test from 'node:test';
import assert from 'node:assert/strict';
import { contextFeature } from '../src/context.mjs';
const geometry = { rings: [[[0,0],[0,10],[10,10],[10,0],[0,0]]], spatialReference: { wkid: 4326 } };
test('context admits explicit regular and extreme classes and rejects unknown geography', () => {
  for (const [zone_type, kind] of [['Tsunami Evacuation Zone', 'regular'], ['Extreme Tsunami Evacuation Zone', 'extreme']]) {
    const feature = contextFeature({ attributes: { OBJECTID: 1, properties: JSON.stringify({ zone_type }) }, geometry }, 'tsunami');
    assert.equal(feature.id, 1);
    assert.equal(feature.properties.zone_kind, kind);
  }
  assert.equal(contextFeature({ attributes: { id: 7, zone_type: 'Tsunami Evacuation Zone' }, geometry }, 'tsunami').id, 7);
  for (const zone_type of [undefined, 'Other hazard', '<script>']) assert.throws(() => contextFeature({ attributes: { objectid: 1, zone_type }, geometry }, 'tsunami'), /classification/);
  assert.throws(() => contextFeature({ attributes: { objectid: 1 }, geometry }, 'roads'), /line.*geometry/);
});
