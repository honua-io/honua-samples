// Convert approved, already staged display data; never fetch or infer operational conditions.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from '../lib/checksum.mjs';
import { exerciseSources, generateExercise } from './exercise.mjs';
const [schoolsPath, roadsPath, zonesPath, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: emergency-snapshot.mjs schools.geojson roads.cjson zones.geojson output');
const raw = await Promise.all([schoolsPath, roadsPath, zonesPath].map((file) => readFile(file, 'utf8')));
const [schools, compact, zones] = raw.map(JSON.parse);
function line(values) {
  let x = 0, y = 0;
  const points = [];
  for (let i = 0; i < values.length; i += 2) { x += values[i]; y += values[i + 1]; points.push([x / 1e5, y / 1e5]); }
  return points;
}
const roads = { type: 'FeatureCollection', features: compact.g.map((lines, i) => ({
  type: 'Feature', id: `display-road-${i + 1}`, properties: Object.fromEntries(compact.k.map((key, j) => [key, compact.p[i][j]])),
  geometry: { type: 'MultiLineString', coordinates: lines.map(line) },
})) };
schools.features.forEach((feature, i) => { feature.id = `display-school-${i + 1}`; });
const licenseUrl = 'https://planning.hawaii.gov/gis/download-gis-data-expanded/';
const endpoints = ['Infrastructure/MapServer/7', 'Transportation/MapServer/5', 'Hazards/MapServer/11'];
const receipts = raw.map((text, i) => ({ sourceUrl: `https://geodata.hawaii.gov/arcgis/rest/services/${endpoints[i]}`,
  license: 'public-domain', licenseUrl, attribution: 'Hawaii Statewide GIS Program', inputSha256: sha256(text),
  sourceUpdatedAt: null, retrievalDate: null,
  note: i < 2 ? 'Approved Kahului/Wailuku mockup display snapshot; simplified geometry, display IDs are not source object IDs. Original retrieval date was not recorded.' : 'Accepted county source snapshot; source receipt retained separately.',
}));
await mkdir(output, { recursive: true });
const records = [];
for (const [name, geojson, receipt] of [['maui-demo-shelters', schools, receipts[0]], ['maui-demo-closures', roads, receipts[1]]]) {
  const source = { ...exerciseSources[name], ...(name === 'maui-demo-shelters' ? { count: schools.features.length } : {}) };
  await generateExercise({ name, source, directory: output, anchor: { geojson, receipt: { cleanSha256: receipt.inputSha256 } } });
  const generated = JSON.parse(await readFile(path.join(output, `${name}.geojson`), 'utf8'));
  for (const feature of generated.features) {
    feature.properties.geometry_source = licenseUrl;
    feature.properties.anchor_name = geojson.features.find((anchor) => String(anchor.id) === feature.properties.anchor_feature_id)?.properties.name;
    records.push(feature);
  }
}
const acceptedZones = zones.features.filter(({ properties: p }) => ['Tsunami Evacuation Zone', 'Extreme Tsunami Evacuation Zone'].includes(p.zone_type))
  .map((feature) => ({ ...feature, properties: { ...feature.properties, zone_kind: feature.properties.zone_type.startsWith('Extreme') ? 'extreme' : 'regular' } }));
if (!acceptedZones.length || !roads.features.length || !schools.features.length) throw new Error('Snapshot inputs must be nonempty');
const snapshot = { format: 'honua.emergency.snapshot.v1', mode: 'static exercise', records, context: { zones: acceptedZones, roads: roads.features }, sources: receipts };
await writeFile(path.join(output, 'snapshot.json'), JSON.stringify(snapshot));
await writeFile(path.join(output, 'sources.json'), JSON.stringify({ ...snapshot, records: undefined, context: undefined,
  snapshotSha256: sha256(JSON.stringify(snapshot)), exerciseLicense: 'CC0-1.0',
  exerciseLicenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
  exerciseRecipe: 'Deterministic fictional records; repeated school/road anchors are not distinct facilities or observed activity.' }, null, 2));
