import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const honuaMap = await readFile(new URL('shared/state-local/honua-map.js', root), 'utf8');
// The compact decoder sits before the layer cache in the map kit; evaluate just those functions.
const decoderSource = honuaMap.slice(honuaMap.indexOf('function decLine'), honuaMap.indexOf('const cache = {};'));
const decode = new Function(`${decoderSource}; return decode;`)();

function encode(points, decimals) {
  const scale = 10 ** decimals;
  let previousX = 0, previousY = 0;
  return points.flatMap(([x, y]) => {
    const scaledX = Math.round(x * scale), scaledY = Math.round(y * scale);
    const delta = [scaledX - previousX, scaledY - previousY];
    previousX = scaledX; previousY = scaledY;
    return delta;
  });
}

const ring = [[-156.4782161, 20.8931452], [-156.47, 20.8931452], [-156.47, 20.9], [-156.4782161, 20.8931452]];

test('compact collections without a scale decode at five decimals', () => {
  const collection = decode({ k: ['id'], t: 'poly', p: [[1]], g: [[[encode(ring, 5)]]] });
  assert.deepEqual(collection.features[0].geometry.coordinates[0][0], [-156.47822, 20.89315]);
});

test('compact collections honour a recorded scale', () => {
  for (const decimals of [6, 7]) {
    const collection = decode({ k: ['id'], t: 'poly', s: decimals, p: [[1]], g: [[[encode(ring, decimals)]]] });
    const [x, y] = collection.features[0].geometry.coordinates[0][0];
    assert.equal(x, Math.round(ring[0][0] * 10 ** decimals) / 10 ** decimals);
    assert.equal(y, Math.round(ring[0][1] * 10 ** decimals) / 10 ** decimals);
  }
});

test('compact lines honour a recorded scale', () => {
  const line = [[-156.4967601, 20.855], [-156.49, 20.8600001]];
  const collection = decode({ k: ['name'], t: 'line', s: 7, p: [['A']], g: [[encode(line, 7)]] });
  assert.deepEqual(collection.features[0].geometry, { type: 'LineString', coordinates: line });
});
