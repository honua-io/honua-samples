import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
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

function assertSourceLayersFrom(sourceId, name, minZoom) {
  const layers = layersDrawing(islandMap, sourceId);
  assert.ok(layers.length > 0, `${sourceId} has layers`);
  for (const layer of layers) assert.ok(layer.minzoom >= minZoom, `${layer.id} draws ${name} from z${layer.minzoom}, archive starts at z${minZoom}`);
}

async function scriptsOutsideIslandMap(directory) {
  const entries = await readdir(new URL(`${directory}/`, root), { recursive: true });
  return entries
    .map((file) => `${directory}/${file}`)
    .filter((relative) => /\.(html|js|mjs)$/.test(relative) && !relative.includes('node_modules') && relative !== 'shared/state-local/island-map.js');
}

test('no island map layer draws an archive below the zoom it was exported from', () => {
  const sources = archiveSources(islandMap);
  for (const [name, minZoom] of Object.entries(islandTileMinZoom)) {
    const ids = [...sources].filter(([, archive]) => archive === name).map(([id]) => id);
    assert.ok(ids.length > 0, `${name} archive is drawn somewhere`);
    for (const id of ids) assertSourceLayersFrom(id, name, minZoom);
  }
});

test('no page or shared script attaches a trimmed archive outside island-map.js', async () => {
  // honua-map.js add(map, id, data) resolves HD.<name> or "<name>" to the island archive of that name
  // (parcels excepted: pages keep their own GeoJSON parcels). HI.source(name) returns the archive directly.
  assert.match(honuaMap, /name !== "parcels" \? HI\.source\(name\)/);
  const trimmed = Object.keys(islandTileMinZoom).filter((name) => name !== 'parcels').join('|');
  const viaAdd = new RegExp(`\\badd\\(\\s*\\w+\\s*,\\s*["'][\\w-]+["']\\s*,\\s*(?:HD\\.(?:${trimmed})\\b|["'](?:${trimmed})["'])`);
  const viaSource = new RegExp(`\\b(?:HI\\.)?source\\(\\s*["'](?:${Object.keys(islandTileMinZoom).join('|')})["']\\s*\\)`);
  const directories = ['shared', 'samples/maui-emergency', 'scripts/state-local'];
  const files = (await Promise.all(directories.map(scriptsOutsideIslandMap))).flat();
  assert.ok(files.some((file) => file.endsWith('04-emergency.html')), 'page sources are scanned');
  for (const file of files) {
    const text = await readFile(new URL(file, root), 'utf8');
    assert.doesNotMatch(text, viaAdd, file);
    assert.doesNotMatch(text, viaSource, file);
  }
});
