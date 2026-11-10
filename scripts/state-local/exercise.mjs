import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from '../lib/checksum.mjs';

const recipes = {
  'maui-demo-requests': { anchor: 'maui-roads', department: '311', kind: 'service_request', count: 468 },
  'maui-demo-inspections': { anchor: 'maui-roads', department: 'Public Works', kind: 'inspection' },
  'maui-demo-work-orders': { anchor: 'maui-roads', department: 'Public Works', kind: 'work_order', count: 34 },
  'maui-demo-closures': { anchor: 'maui-roads', department: 'Emergency Management', kind: 'exercise_closure' },
  'maui-demo-shelters': { anchor: 'maui-public-schools', department: 'Emergency Management', kind: 'exercise_shelter' },
};
export const exerciseSources = Object.fromEntries(Object.entries(recipes).map(([name, recipe]) => [name, {
  ...recipe, id: name, synthetic: true, license: 'CC0-1.0',
  fields: ['record_id', 'data_origin', 'is_demo', 'display_label', 'record_type', 'status',
    'exercise_only', 'operational_use', 'anchor_source', 'anchor_feature_id', 'asset_id', 'district', 'category', 'scenario_date', 'created_at', 'due_at', 'closed_at', 'sla_hours', 'crew', 'condition', 'capacity', 'occupancy', 'case_url'],
  url: 'https://github.com/honua-io/honua-samples/blob/trunk/docs/state-local-data.md',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
  attribution: 'Honua fictional exercise records; geometry from Hawaii Statewide GIS Program public-domain sources',
}]));

function details(source, index) {
  const created = new Date(Date.UTC(2026, 7, 10 + index % 84));
  const due = new Date(created.getTime() + 72 * 3_600_000);
  const stage = index % 5;
  return {
    status: source.kind === 'work_order'
      ? ['exercise_new', 'exercise_triaged', 'exercise_scheduled', 'exercise_in_progress', 'exercise_closed'][stage]
      : ['exercise_open', 'exercise_in_progress', 'exercise_closed'][index % 3],
    created_at: created.toISOString(), due_at: due.toISOString(),
    closed_at: (source.kind === 'work_order' ? stage === 4 : index % 3 === 2) ? new Date(created.getTime() + 48 * 3_600_000).toISOString() : null,
    sla_hours: 72, crew: `Demo crew ${1 + index % 4} (fictional)`,
    condition: ['exercise_good', 'exercise_fair', 'exercise_poor'][index % 3],
    ...(source.kind === 'exercise_shelter' ? { capacity: 100 + index * 10, occupancy: 20 + index * 3 } : {}),
    case_url: `https://example.invalid/demo/${source.kind}/${index + 1}`,
  };
}

function exerciseFeature(source, feature, index) {
  const id = `${source.kind}-${index + 1}`;
  return { type: 'Feature', id, geometry: feature.geometry,
    properties: { record_id: id, data_origin: 'synthetic_demo', is_demo: true,
      display_label: 'DEMO DATA — fictional exercise record', record_type: source.kind,
      exercise_only: true, operational_use: 'None. Not a real request, work order, closure or designated shelter.',
      anchor_source: source.anchor, anchor_feature_id: String(feature.id),
      asset_id: `${source.anchor}:${feature.id}`, district: `Demo district ${1 + index % 3} (fictional)`,
      category: ['drainage', 'road_surface', 'accessibility'][index % 3],
      scenario_date: '2026-11-03', ...details(source, index),
    } };
}

async function build(options) {
  const { anchor, source } = options;
  if (!anchor.geojson.features.length) throw new Error('Exercise requires at least one verified anchor');
  const features = Array.from({ length: source.count ?? 24 }, (_, index) =>
    exerciseFeature(source, anchor.geojson.features[index % anchor.geojson.features.length], index));
  return { geojson: { type: 'FeatureCollection', features }, anchorHash: anchor.receipt.cleanSha256 };
}

function provenance(options, built) {
  const { name, source } = options;
  return { source: name, dataset: name, department: source.department, license: source.license,
    licenseUrl: source.licenseUrl, attribution: source.attribution, outputCrs: 'EPSG:4326',
    selection: { kind: 'fictional exercise; deterministic cycling of accepted anchor features; geometry copied, not observed activity' },
    recipeVersion: 3, anchorSource: source.anchor, anchorSha256: built.anchorHash,
    accepted: built.geojson.features.length, rejected: 0, cleanSha256: sha256(JSON.stringify(built.geojson)) };
}

export async function generateExercise(options) {
  const built = await build(options);
  const receipt = provenance(options, built);
  await mkdir(options.directory, { recursive: true });
  await writeFile(path.join(options.directory, `${options.name}.geojson`), JSON.stringify(built.geojson), { flag: 'wx', mode: 0o600 });
  await writeFile(path.join(options.directory, `${options.name}.receipt.json`), JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
  return receipt;
}

export async function readExercise(options) {
  const built = await build(options);
  const receipt = JSON.parse(await readFile(path.join(options.directory, `${options.name}.receipt.json`), 'utf8'));
  const clean = await readFile(path.join(options.directory, `${options.name}.geojson`), 'utf8');
  if (JSON.stringify(receipt) !== JSON.stringify(provenance(options, built)) || clean !== JSON.stringify(built.geojson)) {
    throw new Error('Exercise snapshot or anchor provenance mismatch');
  }
  return { receipt, geojson: built.geojson };
}
