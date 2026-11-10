import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadDepthAssets } from '../build/depth-assets.mjs';
import { syntheticDepthReceipt, DEPTH_FILE } from './depth-receipt.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'honua-depth-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = await readFile(new URL('./fixtures/depth.tif', import.meta.url));
  await writeFile(path.join(directory, DEPTH_FILE), bytes);
  return { directory, receipt: syntheticDepthReceipt(bytes) };
}

async function publish(data) {
  await writeFile(path.join(data.directory, 'receipt.json'), JSON.stringify(data.receipt));
  return loadDepthAssets(data.directory);
}

test('publishes the verified numeric COG and receipt; rejects modified data', async (t) => {
  const data = await fixture(t);
  const assets = await publish(data);
  assert.deepEqual(assets.map(({ fileName }) => fileName), [`depth/${DEPTH_FILE}`, 'depth/receipt.json']);
  await writeFile(path.join(data.directory, DEPTH_FILE), 'modified');
  await assert.rejects(publish(data), /checksum mismatch/);
});

test('rejects changed numeric semantics and incomplete provenance', async (t) => {
  const data = await fixture(t);
  const baseline = structuredClone(data.receipt);
  for (const mutate of [
    (receipt) => { receipt.scenario = '+3.2 ft'; },
    (receipt) => { receipt.conversion.resampling = 'bilinear'; },
    (receipt) => { receipt.conversion.nodata = 0; },
    (receipt) => { receipt.conversion.units = 'feet'; },
    (receipt) => { delete receipt.terms['reuse-policy']; },
    (receipt) => { receipt.output.file = '../source.tif'; },
  ]) {
    data.receipt = structuredClone(baseline);
    mutate(data.receipt);
    await assert.rejects(publish(data), /Complete prepared NOAA depth receipt/);
  }
});
