import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assessDescriptorBody, hostedDescriptorUrls } from '../check-hosted-descriptors.mjs';

const served = 'https://demo.honua.io/demo-data/publications/maui-county-parcels/20261113T122054Z/descriptor.json';

test('hosted descriptor urls are publication descriptors only', () => {
  const text = `island https://demo.honua.io/demo-data/maui-island-display/x/ ${served} again ${served}`;
  assert.deepEqual(hostedDescriptorUrls(text), [served]);
});

test('a served descriptor is a JSON object with publicationId', () => {
  assert.equal(assessDescriptorBody(200, JSON.stringify({ publicationId: 'maui-county-parcels' })), null);
  assert.match(assessDescriptorBody(403, '{}'), /HTTP 403/);
  assert.match(assessDescriptorBody(200, '<html>'), /not a JSON object/);
  assert.match(assessDescriptorBody(200, '[]'), /not a JSON object/);
  assert.match(assessDescriptorBody(200, '{}'), /publicationId/);
});

test('county source files name one descriptor', async () => {
  const script = await readFile(new URL('../../shared/state-local/county-publication.mjs', import.meta.url), 'utf8');
  const page = await readFile(new URL('../../shared/state-local/county-publication.html', import.meta.url), 'utf8');
  const urls = hostedDescriptorUrls(`${script}\n${page}`);
  assert.equal(urls.length, 1);
  assert.deepEqual(hostedDescriptorUrls(script), urls);
  assert.deepEqual(hostedDescriptorUrls(page), urls);
});
