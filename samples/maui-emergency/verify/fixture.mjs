export function exerciseFeature(index = 0, kind = 'exercise_shelter') {
  const shelter = kind === 'exercise_shelter';
  const anchor = shelter ? 'maui-public-schools' : 'maui-roads';
  const point = [-156.5 + index % 20 * .002, 20.85 + Math.floor(index / 20) * .002];
  const status = ['exercise_open', 'exercise_in_progress', 'exercise_closed'][index % 3];
  return { type: 'Feature', id: `${kind}-${index + 1}`,
    geometry: shelter ? { type: 'Point', coordinates: point } : { type: 'LineString', coordinates: [point, [point[0] + .001, point[1] + .001]] },
    properties: { record_id: `${kind}-${index + 1}`, record_type: kind, status,
      validation_geometry: true, data_origin: 'synthetic_demo', is_demo: true, exercise_only: true, display_label: 'DEMO DATA — fictional preparedness fixture',
      anchor_source: anchor, anchor_feature_id: index + 1, asset_id: `${anchor}:${index + 1}`,
      scenario_date: '2026-11-03', opened_at: '2026-10-30T00:00:00.000Z', due_at: '2026-11-02T00:00:00.000Z',
      closed_at: status === 'exercise_closed' ? '2026-11-01T00:00:00.000Z' : null,
      ...(shelter ? { capacity: 100, occupancy: 20 } : {}) } };
}
