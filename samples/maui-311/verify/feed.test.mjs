import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectionUrl, verifyFeed } from '../src/feed.mjs';
import { requestFeature } from '../src/source.mjs';
import { request, wireFeature } from './fixture.mjs';

const binding = { baseUrl: 'http://localhost:8080', serviceId: 'exercise', layerId: 42 };
const records = Array.from({ length: 205 }, (_, index) => requestFeature(wireFeature(index)));

function feedPage(url) {
  const offset = Number(new URL(url).searchParams.get('offset'));
  const features = Array.from({ length: Math.min(200, Math.max(0, 205 - offset)) }, (_, index) => request(offset + index));
  return { type: 'FeatureCollection', features, numberReturned: features.length, numberMatched: 205 };
}

test('OGC verification walks every page and compares normalized snapshots across protocols', async () => {
  const offsets = [];
  const href = await verifyFeed({ binding, records, getJson: async (url) => {
    offsets.push(Number(new URL(url).searchParams.get('offset')));
    return feedPage(url);
  } });
  assert.equal(href, collectionUrl(binding));
  assert.equal(href, 'http://localhost:8080/ogc/features/collections/42');
  assert.deepEqual(offsets, [0, 200, 205]);
});

test('OGC verification rejects truncated, duplicate, altered and unlabelled feed records', async () => {
  for (const mode of ['truncated', 'duplicate', 'altered', 'unlabelled', 'count']) {
    await assert.rejects(verifyFeed({ binding, records, getJson: async (url) => {
      const page = feedPage(url);
      if (mode === 'truncated' && new URL(url).searchParams.get('offset') === '200') page.features = [];
      if (mode === 'duplicate' && page.features.length > 1) page.features[1] = page.features[0];
      if (mode === 'altered' && page.features.length) page.features[0].properties.category = 'accessibility';
      if (mode === 'unlabelled' && page.features.length) page.features[0].properties.is_demo = false;
      if (mode !== 'count') page.numberReturned = page.features.length;
      else page.numberMatched = 204;
      return page;
    } }), undefined, mode);
  }
});

test('OGC verification accepts nested imported attributes and omitted total counts', async () => {
  await verifyFeed({ binding, records, getJson: async (url) => {
    const page = feedPage(url);
    page.numberMatched = null;
    page.features.forEach((feature) => { feature.properties = { properties: feature.properties }; });
    return page;
  } });
});
