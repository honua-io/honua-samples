import { emergencyRecord } from './records.mjs';
import { wgs84Geometry } from '../../../shared/state-local/geometry.mjs';
import { zoneGeometry } from './location.mjs';

export async function loadSnapshot() {
  const response = await fetch('./data/snapshot.json');
  if (!response.ok) throw new Error('Snapshot is unavailable');
  const data = await response.json();
  if (data.format !== 'honua.emergency.snapshot.v1' || !data.records?.length || !data.context?.zones?.length) throw new Error('Invalid exercise snapshot');
  const records = data.records.map((feature) => ({ ...feature,
    properties: emergencyRecord(feature.properties, feature.properties.record_type), geometry: wgs84Geometry(feature.geometry) }));
  const zones = data.context.zones.map((feature) => {
    if (!['regular', 'extreme'].includes(feature.properties.zone_kind)) throw new Error('Unknown zone classification');
    return { ...feature, geometry: zoneGeometry(feature.geometry) };
  });
  const roads = data.context.roads.map((feature) => ({ ...feature, geometry: wgs84Geometry(feature.geometry) }));
  return { records, context: { zones, roads } };
}
