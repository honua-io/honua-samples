import assert from 'node:assert/strict';
import test from 'node:test';
import { fixtureResponse } from './service.ts';
const endpoint = '/rest/services/maui-parcels/FeatureServer/1';
const query = (params = {}) => fixtureResponse(`${endpoint}/query`, new URLSearchParams(params));

test('metadata, TMK lookup and empty result preserve the SDK contract', () => {
  const metadata = fixtureResponse(endpoint, new URLSearchParams()).body;
  assert.equal(metadata.objectIdField, 'id');
  assert.equal(metadata.id, 1);
  const result = query({ where: "(tmk_txt = '234008054')", outFields: 'id,tmk_txt', returnGeometry: 'false' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.features, [{ attributes: { id: 10, tmk_txt: '234008054' } }]);
  assert.deepEqual(query({ where: "tmk_txt='999999999'" }).body.features, []);
});

test('numeric ordering, pagination, counts and stable ID selection agree', () => {
  assert.deepEqual(query({ orderByFields: 'ID ASC', returnIdsOnly: 'true' }).body.objectIds, [2, 10, 30]);
  const page = query({ orderByFields: 'id ASC', resultOffset: '1', resultRecordCount: '1' }).body;
  assert.equal(page.features[0].attributes.id, 10);
  assert.equal(page.exceededTransferLimit, true);
  assert.equal(query({ returnCountOnly: 'true' }).body.count, 3);
  assert.equal(query({ where: 'id = 10' }).body.features[0].attributes.tmk_txt, '234008054');
  assert.equal(query({ objectIds: '30' }).body.features[0].attributes.tmk_txt, '234008055');
});

test('point and polygon intersects support identify and overlap candidates', () => {
  const point = { x: -156.5015, y: 20.8825, spatialReference: { wkid: 4326 } };
  const params = { geometry: JSON.stringify(point), geometryType: 'esriGeometryPoint', spatialRel: 'esriSpatialRelIntersects' };
  assert.equal(query(params).body.features[0].attributes.id, 2);
  const parcel = query({ objectIds: '2' }).body.features[0];
  const zoning = fixtureResponse('/rest/services/maui-zoning/FeatureServer/2/query', new URLSearchParams({
    ...params, geometry: JSON.stringify(parcel.geometry), geometryType: 'esriGeometryPolygon',
  }));
  assert.deepEqual(zoning.body.features.map(row => row.attributes.zone_code), ['R-1']);
  assert.equal(fixtureResponse('/fixture/parcels.geojson', new URLSearchParams()).body.features.length, 3);
});

test('unsupported queries fail instead of pretending to emulate a full server', () => {
  for (const params of [{ where: '1=1 OR 1=2' }, { where: '(1=1' }, { outFields: 'secret' },
    { outSR: '3857' }, { resultOffset: '-1' }, { orderByFields: 'secret DESC' }, { sqlFormat: 'native' }]) {
    assert.equal(query(params).status, 400, JSON.stringify(params));
  }
  assert.equal(fixtureResponse('/rest/services/unknown/FeatureServer/1', new URLSearchParams()).status, 404);
});
