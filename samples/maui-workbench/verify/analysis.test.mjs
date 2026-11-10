import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAnalysisExport, encodeAnalysisExport } from '../src/analysis-export.mjs';
import { analysisBindings, catalogs, validatedAnalysisSource, queryAnalysisMap, queryStatusChart, setAnalysisFilter } from '../src/analysis-model.mjs';
import { createFilterRegistry } from '@honua/sdk-js/filter-registry';

const row = (id) => ({ attributes: { objectid: id, status: 'exercise_open' }, geometry: { x: -156.4, y: 20.85 } });
function model(query, count = 2) {
  return { identity: 'objectid', columns: ['objectid', 'status'], catalog: { group: 'status' },
    registry: createFilterRegistry(), source: { descriptor: { id: 'requests', protocol: 'geoservices-feature-service', capabilities: new Set(['query', 'sql']) },
      query, queryExtent: async () => ({ count }) } };
}

test('bindings require both approved layers and reject credential-bearing origins', () => {
  assert.equal(analysisBindings(''), null);
  assert.throws(() => analysisBindings('?requestsService=r&requestsLayer=1'), /all layers/);
  assert.throws(() => analysisBindings('?baseUrl=https://user:pass@demo.honua.io&requestsService=r&requestsLayer=1&parcelsService=p&parcelsLayer=2'), /Connect to/);
});

test('status crossfilter affects the map but excludes itself from chart counts', async () => {
  const requests = [];
  const next = model(async (query) => { requests.push(query); return query.aggregation
    ? { aggregateRows: [{ status: 'exercise_open', record_count: 2 }] }
    : { features: [row(1), row(2)] }; });
  setAnalysisFilter(next, { id: 'query', field: 'objectid', operator: '>=', value: 1 });
  setAnalysisFilter(next, { id: 'chart-status', field: 'status', operator: '=', value: 'exercise_open', owner: 'status-chart' });
  await queryAnalysisMap(next);
  assert.deepEqual(await queryStatusChart(next), [{ label: 'exercise_open', value: 2 }]);
  assert.match(requests[0].where, /exercise_open/);
  assert.doesNotMatch(requests[1].where, /exercise_open/);
  assert.match(requests[1].where, /objectid/);
});

test('map refuses duplicate IDs and chart refuses incomplete aggregates', async () => {
  await assert.rejects(queryAnalysisMap(model(async () => ({ features: [row(1), row(1)] }))), /repeated/);
  await assert.rejects(queryStatusChart(model(async () => ({ aggregateRows: [], exceededTransferLimit: true }))), /complete/);
});

test('311 map and exports reject records without exercise provenance', async () => {
  const next = model(async () => ({ features: [row(1), row(2)] }));
  next.catalog = catalogs.requests;
  await assert.rejects(queryAnalysisMap(next), /DEMO DATA provenance/);
  await assert.rejects(collectAnalysisExport(next, {}, undefined), /DEMO DATA provenance/);
});

test('exports preserve geometry and the same IDs across CSV and GeoJSON', async () => {
  const next = model(async () => ({ features: [row(11), row(17)] }));
  const data = await collectAnalysisExport(next, {}, undefined);
  assert.deepEqual(JSON.parse(encodeAnalysisExport(data, next.columns, 'geojson')).features.map((f) => f.id), [11, 17]);
  assert.deepEqual(data.features[0].geometry, { type: 'Point', coordinates: [-156.4, 20.85] });
  assert.equal(encodeAnalysisExport(data, next.columns, 'csv'), '"objectid","status"\r\n"11","exercise_open"\r\n"17","exercise_open"');
});

for (const [name, query, count, message] of [
  ['duplicates', async () => ({ features: [row(1), row(1)] }), 2, /repeated/],
  ['truncated result', async () => ({ features: [row(1)] }), 2, /ended early/],
  ['incomplete page', async () => ({ features: [row(1)], exceededTransferLimit: true }), 2, /incomplete page/],
  ['degraded predicate', async () => ({ features: [], degraded: ['unsupported'] }), 2, /every filter/],
  ['excessive count', async () => { throw new Error('must not fetch'); }, 10001, /exact count/],
]) test(`export fails closed for ${name}`, async () => {
  await assert.rejects(collectAnalysisExport(model(query, count), {}, undefined), message);
});

test('export stops when the exact count changes during collection', async () => {
  const next = model(async () => ({ features: [row(1), row(2)] }));
  let calls = 0;
  next.source.queryExtent = async () => ({ count: ++calls === 1 ? 2 : 3 });
  await assert.rejects(collectAnalysisExport(next, {}, undefined), /records changed/);
});

test('export follows stable ordered pages and preserves every object ID', async () => {
  const offsets = [];
  const next = model(async ({ pagination }) => {
    offsets.push(pagination.offset);
    return { features: Array.from({ length: pagination.offset === 0 ? 200 : 1 },
      (_, index) => row(pagination.offset + index + 1)), exceededTransferLimit: pagination.offset === 0 };
  }, 201);
  const data = await collectAnalysisExport(next, {}, undefined);
  assert.deepEqual(offsets, [0, 200]);
  assert.deepEqual(data.features.map((feature) => feature.id), Array.from({ length: 201 }, (_, index) => index + 1));
});

test('CSV quotes cells and neutralizes spreadsheet formulas', () => {
  const data = { features: [{ properties: { value: '=1+1,"quoted"' } }] };
  assert.equal(encodeAnalysisExport(data, ['value'], 'csv'), '"value"\r\n"\'=1+1,""quoted"""');
});


test('every table page validates exercise provenance before returning rows', async () => {
  const valid = { attributes: { data_origin: 'synthetic-exercise', is_demo: true,
    exercise_only: true, display_label: 'DEMO DATA' } };
  const source = { query: async ({ pagination }) => ({ features: pagination.offset === 0 ? [valid] : [row(1001)] }),
    async *stream() { yield { features: [valid] }; yield { features: [row(1001)] }; } };
  let checked = 0;
  const guarded = validatedAnalysisSource(source, (attributes) => {
    checked += 1;
    if (attributes !== valid.attributes) throw new Error('DEMO DATA provenance');
  });
  assert.deepEqual((await guarded.query({ pagination: { offset: 0 } })).features, [valid]);
  await assert.rejects(guarded.query({ pagination: { offset: 1000 } }), /DEMO DATA provenance/);
  const pages = guarded.stream({});
  assert.deepEqual((await pages.next()).value.features, [valid]);
  await assert.rejects(pages.next(), /DEMO DATA provenance/);
  assert.equal(checked, 4);
});
