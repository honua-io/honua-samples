import { HonuaClient } from '@honua/sdk-js';
import { namedBindings } from '../../../shared/state-local/binding.mjs';
import { collectFeatures } from '../../../shared/state-local/features.mjs';
import { wgs84Geometry } from '../../../shared/state-local/geometry.mjs';
import { emergencyRecord } from './records.mjs';

export const bindings = (search) => namedBindings(search, ['shelter', 'closure']);

async function readLayer(binding, kind) {
  return collectFeatures(new HonuaClient({ baseUrl: binding.baseUrl }), binding, (feature) => {
    const properties = emergencyRecord(feature.attributes, kind);
    const geometry = wgs84Geometry(feature.geometry);
    const point = kind === 'exercise_shelter';
    if (point ? geometry.type !== 'Point' : !['LineString', 'MultiLineString'].includes(geometry.type)) {
      throw new Error('Shelters need school points; closures need road lines');
    }
    return { type: 'Feature', id: properties.record_id, properties, geometry };
  });
}

export async function loadExercise(source) {
  const layers = await Promise.all([readLayer(source.shelter, 'exercise_shelter'), readLayer(source.closure, 'exercise_closure')]);
  const records = layers.flat();
  if (new Set(records.map(({ properties }) => properties.scenario_date)).size > 1) throw new Error('Layers have different exercise dates');
  if (new Set(records.map(({ id }) => id)).size !== records.length) throw new Error('Exercise layers have overlapping record IDs');
  return records;
}
