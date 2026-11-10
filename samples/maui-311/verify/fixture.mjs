export function request(index = 0) {
  const closed = index % 3 === 2;
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: [
    [-156.5 + index % 20 * .002, 20.85 + Math.floor(index / 20) * .002],
    [-156.499 + index % 20 * .002, 20.851 + Math.floor(index / 20) * .002]] },
  properties: { record_id: `request-${String(index + 1).padStart(3, '0')}`, record_type: 'service_request',
    data_origin: 'synthetic_demo', is_demo: true, exercise_only: true, display_label: 'DEMO DATA — fictional 311 fixture',
    status: ['exercise_open', 'exercise_in_progress', 'exercise_closed'][index % 3],
    category: ['drainage', 'road_surface', 'accessibility'][index % 3],
    district: `Demo district ${index % 3 + 1} (fictional)`, crew: `Demo crew ${index % 4 + 1} (fictional)`,
    scenario_date: '2026-11-03', opened_at: '2026-10-30T00:00:00.000Z', due_at: '2026-11-02T00:00:00.000Z',
    closed_at: closed ? '2026-11-01T00:00:00.000Z' : null } };
}

export function wireFeature(index) {
  const feature = request(index);
  return { attributes: feature.properties, geometry: { paths: [feature.geometry.coordinates] } };
}
