export function exerciseFeature(index = 0, kind = 'work_order') {
  const status = kind === 'inspection' ? ['exercise_open', 'exercise_in_progress', 'exercise_closed'][index % 3]
    : ['exercise_new', 'exercise_triaged', 'exercise_scheduled', 'exercise_in_progress', 'exercise_closed'][index % 5];
  return { type: 'Feature', id: `${kind}-${index + 1}`, geometry: { type: 'LineString', coordinates: [
    [-156.5 + index % 20 * .002, 20.85 + Math.floor(index / 20) * .002],
    [-156.499 + index % 20 * .002, 20.851 + Math.floor(index / 20) * .002]] },
  properties: { record_id: `${kind}-${index + 1}`, record_type: kind, status,
    data_origin: 'synthetic_demo', is_demo: true, exercise_only: true, display_label: 'DEMO DATA — fictional maintenance fixture',
    anchor_source: 'maui-roads', anchor_feature_id: index % 8 + 1, asset_id: `maui-roads:${index % 8 + 1}`,
    condition: ['exercise_good', 'exercise_fair', 'exercise_poor'][index % 3], crew: `Demo crew ${index % 4 + 1} (fictional)`,
    scenario_date: '2026-11-03', opened_at: '2026-10-30T00:00:00.000Z', due_at: '2026-11-02T00:00:00.000Z',
    closed_at: status === 'exercise_closed' ? '2026-11-01T00:00:00.000Z' : null } };
}

export function bridgeFeature(index = 0) {
  return { type: 'Feature', id: `bridge-${index + 1}`, geometry: { type: 'Point', coordinates: [-156.5 + index * .002, 20.85] },
    properties: { data_origin: 'synthetic_validation', structure_number_008: `fixture-${index + 1}`, county_code_003: '009', facility_carried_007: 'Fixture roadway',
      features_desc_006a: 'Fixture crossing', bridge_condition: ['G', 'F', 'P'][index % 3],
      deck_cond_058: '7', superstructure_cond_059: '7', substructure_cond_060: '6', culvert_cond_062: 'N',
      date_of_inspect_090: '0625', year_built_027: '1990' } };
}
