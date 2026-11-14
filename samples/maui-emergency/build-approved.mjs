// Assemble the approved UI with attested display geometry and fictional exercise records.
import { approvedPage } from '../../shared/state-local/approved-page.mjs';
import { lockedArchive, copyManifestFiles, islandFilePattern } from '../../shared/state-local/locked-archive.mjs';
import { withIslandPoints } from '../../shared/state-local/island-points.mjs';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { LIVE_FEEDS } from './public/live-feeds.js';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const approved = path.join(root, 'approved');
const output = path.resolve(process.argv[2] ?? path.join(root, 'dist'));
const islandLock = JSON.parse(await readFile(new URL('../../shared/state-local/island-display.lock.json', import.meta.url)));
const islandDirectory = path.join(root, 'node_modules/.cache/island-display');
const islandManifest = await lockedArchive(islandLock, islandDirectory);
const read = (file) => readFile(file, 'utf8');
const snapshot = JSON.parse(await read(path.join(root, 'public/data/exercise-data.json')));
const collection = (features) => ({ type: 'FeatureCollection', features });
const shelterRecords = snapshot.records.filter((f) => f.properties.record_type === 'exercise_shelter');
const exerciseShelters = Object.fromEntries(shelterRecords.map(({ properties: p }) => [p.anchor_name, {
  fid: p.record_id, label: p.anchor_name, cap: p.capacity, occ: p.occupancy,
  pct: Math.round(p.occupancy / p.capacity * 100), real: false,
  st: p.status === 'exercise_closed' ? 'closed' : 'open',
  note: 'DEMO DATA · fictional shelter; not a designated evacuation site',
}]));
const overrides = {
  roads: collection(snapshot.context.roads),
  tsunami: collection(snapshot.context.zones.map((f) => ({ ...f, properties: { ...f.properties,
    code: f.properties.zone_kind === 'extreme' ? 2 : 1 } }))),
  shelters: collection(shelterRecords.map((f) => ({ ...f, properties: { ...f.properties,
    name: f.properties.anchor_name, addr: 'Real school location · fictional exercise shelter', pets: false, sn: false,
  } }))),
};
const approvedData = { exerciseShelters };
const receipts = [];
const endpoints = { land: 'Terrestrial/MapServer/3', contours: 'Elevation/MapServer/5',
  streams: 'FreshWater/MapServer/1', waterbodies: 'FreshWater/MapServer/19',
  dfirm: 'Hazards/MapServer/4', slr32: 'Climate/MapServer/45', fire: 'EmergMgmtPubSafety/MapServer/7',
  police: 'EmergMgmtPubSafety/MapServer/5', hospitals: 'Infrastructure/MapServer/5', schools: 'Infrastructure/MapServer/7' };
for (const name of ['land', 'roads', 'contours', 'streams', 'waterbodies', 'dfirm', 'tsunami', 'slr32', 'shelters', 'fire', 'police', 'hospitals', 'schools']) {
  if (overrides[name]) { approvedData[name] = overrides[name]; continue; }
  for (const extension of ['cjson', 'geojson', 'json']) {
    let raw;
    try { raw = await read(path.join(approved, 'data', `${name}.${extension}`)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    approvedData[name] = JSON.parse(raw);
    receipts.push({ dataset: name, sourceUrl: `https://geodata.hawaii.gov/arcgis/rest/services/${endpoints[name]}`, sha256: createHash('sha256').update(raw).digest('hex'),
      attribution: 'Hawaii Statewide GIS Program', license: 'Public domain',
      licenseUrl: 'https://planning.hawaii.gov/gis/download-gis-data-expanded/',
      retrievalDate: null, note: 'Approved simplified display snapshot; original retrieval date was not recorded.' });
    break;
  }
  if (!approvedData[name]) throw new Error(`Missing approved display layer: ${name}`);
}
const data = await withIslandPoints({ manifest: islandManifest, directory: islandDirectory, data: approvedData });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'public'), output, { recursive: true });
await copyManifestFiles({ manifest: islandManifest, directory: islandDirectory,
  output: path.join(output, 'state-local/data/island'), pattern: islandFilePattern });
for (const [name, target] of [['04-emergency.html', 'index.html'], ['11-emergency-mobile.html', 'mobile.html']]) {
  const html = await approvedPage({ template: path.join(approved, 'pages', name), assets: path.join(approved, 'src'), data });
  await writeFile(path.join(output, target), html);
}
const sourceFile = path.join(output, 'data/sources.json');
const sources = JSON.parse(await read(sourceFile));
const liveFeeds = LIVE_FEEDS.map(({ id, label, agency, url, staleAfterMs }) => ({ id, label, attribution: agency, sourceUrl: url,
  license: 'public-domain', licenseNote: 'U.S. Government work (17 U.S.C. 105)', staleAfterMinutes: staleAfterMs / 60_000,
  note: 'Real data read live by the visitor\'s browser; not stored, not part of the exercise.' }));
await writeFile(sourceFile, JSON.stringify({ ...sources, displayLayers: receipts, liveFeeds }, null, 2));
console.log('Approved emergency desktop and mobile assembled with verified exercise snapshot.');
