import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { islandTileExtent, islandTileLayers, islandTileMinZoom } from '../state-local/approved/sources.mjs';

const root = new URL('../../', import.meta.url);
const islandMap = await readFile(new URL('shared/state-local/island-map.js', root), 'utf8');
const honuaMap = await readFile(new URL('shared/state-local/honua-map.js', root), 'utf8');

// Map source ids to archive names, e.g. map.addSource('island-parcels', source('parcels')).
function archiveSources(code) {
  return new Map([...code.matchAll(/addSource\('([\w-]+)', source\('(\w+)'\)\)/g)].map(([, id, name]) => [id, name]));
}

function layersDrawing(code, sourceId) {
  return [...code.matchAll(/\{ id: '([\w-]+)'[^}]*?source: '([\w-]+)'([^}]*)/g)]
    .filter(([, , source]) => source === sourceId)
    .map(([, id, , rest]) => ({ id, minzoom: Number(/minzoom: ([\d.]+)/.exec(rest)?.[1] ?? 0) }));
}

test('trimmed archives are only for known island layers and keep the 8-14 default otherwise', () => {
  for (const name of Object.keys(islandTileMinZoom)) assert.ok(islandTileLayers.includes(name), name);
  assert.deepEqual(islandTileExtent('zoning'), { ...islandTileExtent('zoning'), minZoom: 8, maxZoom: 14 });
  assert.equal(islandTileExtent('parcels').minZoom, 13);
});

test('no island map layer draws an archive below the zoom it was exported from', () => {
  const sources = archiveSources(islandMap);
  for (const [name, minZoom] of Object.entries(islandTileMinZoom)) {
    const ids = [...sources].filter(([, archive]) => archive === name).map(([id]) => id);
    assert.ok(ids.length > 0, `${name} archive is drawn somewhere`);
    for (const id of ids) {
      const layers = layersDrawing(islandMap, id);
      assert.ok(layers.length > 0, `${id} has layers`);
      for (const layer of layers) assert.ok(layer.minzoom >= minZoom, `${layer.id} draws ${name} from z${layer.minzoom}, archive starts at z${minZoom}`);
    }
  }
});

test('shared page overlays never attach a trimmed archive', () => {
  // honua-map.js attaches island archives by name for overlays (parcels stay page GeoJSON).
  for (const name of Object.keys(islandTileMinZoom)) {
    if (name === 'parcels') continue;
    assert.doesNotMatch(honuaMap, new RegExp(`add\\(map, "[\\w-]+", "${name}"\\)`), name);
  }
  assert.match(honuaMap, /name !== "parcels" \? HI\.source\(name\)/);
});
