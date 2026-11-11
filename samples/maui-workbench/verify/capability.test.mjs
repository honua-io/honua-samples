import test from 'node:test';
import assert from 'node:assert/strict';
import { explainAnalysisCapability } from '../src/analysis-capability.mjs';

function model(capabilities) {
  return { catalog: { label: 'Parcels' }, endpoint: 'https://demo.example/FeatureServer/0',
    source: { descriptor: { id: 'parcels', protocol: 'geoservices-feature-service', capabilities: capabilities === undefined ? undefined : new Set(capabilities) },
      query() { assert.fail('capability checks must not execute source operations'); } } };
}

test('SDK capability explanation uses discovered capabilities rather than protocol defaults', async () => {
  const next = model(['query']);
  const available = await explainAnalysisCapability(next, 'query');
  assert.equal(available.supported, true);
  assert.equal(available.tool, 'explainCapabilityGap');
  assert.equal(available.sourceId, 'parcels');
  assert.equal(available.endpoint, next.endpoint);
  const missing = await explainAnalysisCapability(next, 'queryAggregate');
  assert.equal(missing.supported, false);
  assert.deepEqual(missing.capabilities, ['query']);
  assert.match(missing.message, /queryAggregate.*not advertised/);
});

test('missing or empty source metadata never implies protocol-default support', async () => {
  assert.equal((await explainAnalysisCapability(model([]), 'query')).supported, false);
  await assert.rejects(explainAnalysisCapability(model(undefined), 'query'), /Reconnect/);
  await assert.rejects(explainAnalysisCapability(null, 'query'), /Reconnect/);
  await assert.rejects(explainAnalysisCapability(model(['query']), 'madeUpCapability'), /listed operations/);
});
