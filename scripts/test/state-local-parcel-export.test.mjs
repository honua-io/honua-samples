import assert from 'node:assert/strict';
import test from 'node:test';
import { parcelCsv, parcelGeoJson } from '../../shared/state-local/parcel-export.mjs';

const parcel = { type: 'Feature', id: 7, geometry: { type: 'Point', coordinates: [-156.47, 20.88] },
  properties: { t9: '001234567', land: 0, bldg: null, acres: 0.326, fld: 'AE', data_origin: 'public_snapshot' } };
const provenance = { snapshot: '2026-11-10', attribution: 'County of Maui; Hawaii Statewide GIS Program',
  warning: 'Generalized display snapshot, not legal boundaries or live information.',
  sources: { parcels: { sourceUrl: 'https://example.org/parcels', license: 'public-domain' } } };

test('GeoJSON preserves selected geometry, identifiers and source provenance without changing inputs', () => {
  const before = JSON.stringify({ parcel, provenance });
  const output = JSON.parse(parcelGeoJson([parcel], provenance));
  assert.equal(output.type, 'FeatureCollection');
  assert.deepEqual(output.features, [parcel]);
  assert.equal(output.provenance.snapshot, provenance.snapshot);
  assert.equal(output.provenance.attribution, provenance.attribution);
  assert.equal(output.provenance.warning, provenance.warning);
  assert.deepEqual(output.provenance.sources, provenance.sources);
  assert.equal(JSON.stringify({ parcel, provenance }), before);
});

test('CSV preserves zero, missing figures, leading zeroes and provenance in every row', () => {
  const csv = parcelCsv([parcel], provenance);
  assert.match(csv, /"t9","land","bldg","acres","fld","data_origin","snapshot","attribution","warning","source_url","license","sources"\r\n/);
  assert.match(csv, /"001234567","0","","0.326","AE","public_snapshot","2026-11-10"/);
  assert.match(csv, /County of Maui; Hawaii Statewide GIS Program/);
  assert.match(csv, /Generalized display snapshot/);
  assert.match(csv, /https:\/\/example.org\/parcels/);
  assert.ok(csv.includes(JSON.stringify(provenance.sources).replaceAll('"', '""')));
});

test('CSV escapes spreadsheet formulas, quotes, commas and multiline properties', () => {
  const feature = { ...parcel, properties: { ...parcel.properties, note: '=HYPERLINK("https://example.org")\nnext,row' } };
  assert.match(parcelCsv([feature], provenance), /"'=HYPERLINK\(""https:\/\/example.org""\)\nnext,row"/);
});

test('exports retain exercise labels and never replace them with a real-data claim', () => {
  const feature = { ...parcel, properties: { ...parcel.properties, data_origin: 'synthetic_demo', is_demo: true, exercise_only: true } };
  const exported = JSON.parse(parcelGeoJson([feature], provenance));
  assert.equal(exported.features[0].properties.exercise_only, true);
  assert.match(parcelCsv([feature], provenance), /"synthetic_demo","true","true"/);
});
