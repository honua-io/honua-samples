import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countyExport, countyShareUrl } from '../../shared/state-local/county-export.mjs';

const publication = { url: 'https://example.org/descriptor.json', publicFields: [{ name: 'tmk_txt' }, { name: 'taxacres' }], freshness: { capturedAt: '2026-11-13T12:20:54Z', captureId: 'capture', version: 'v1' }, descriptor: { crs: { geoparquet: 'OGC:CRS84' }, provenance: { attribution: 'County of Maui', license: 'public-domain' }, links: { source: 'https://example.org/source' } } };
const feature = { properties: { tmk_txt: '038007001', taxacres: null, homeowner: 'Private' }, geometry: { type: 'MultiPolygon', coordinates: [] } };

test('county exports preserve text identity, raw geometry and capture provenance while removing private fields', () => {
  const data = JSON.parse(countyExport(publication, feature, 'geojson'));
  assert.deepEqual(data.features[0].properties, { tmk_txt: '038007001', taxacres: null });
  assert.deepEqual(data.features[0].geometry, feature.geometry);
  assert.equal(data.provenance.snapshot, publication.freshness.capturedAt);
  assert.equal(data.provenance.sources.parcels.publicationUrl, publication.url);
  assert.equal(data.provenance.sources.parcels.captureId, 'capture');
  const csv = countyExport(publication, feature, 'csv');
  assert.ok(csv.includes('"038007001"'));
  assert.ok(csv.includes('public-domain'));
  assert.ok(!csv.includes('Private'));
  assert.throws(() => countyExport({ ...publication, freshness: {} }, feature, 'csv'));
  assert.throws(() => countyExport(publication, feature, 'html'));
});

test('county share URLs replace only county identity and validate text TMKs', () => {
  const url = new URL(countyShareUrl('https://example.org/property/?theme=dark&countyTmk=old#details', '038-007-001'));
  assert.equal(url.searchParams.get('countyTmk'), '038007001');
  assert.equal(url.searchParams.get('theme'), 'dark');
  assert.equal(url.hash, '#details');
  assert.throws(() => countyShareUrl(url, 38007001));
});
