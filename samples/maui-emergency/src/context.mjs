import { HonuaClient } from '@honua/sdk-js';
import { namedBindings } from '../../../shared/state-local/binding.mjs';
import { collectFeatures } from '../../../shared/state-local/features.mjs';
import { wgs84Geometry } from '../../../shared/state-local/geometry.mjs';
import { zoneGeometry } from './location.mjs';

export async function loadContext(search) {
  const bindings = namedBindings(search, ['tsunami', 'roads']);
  if (!bindings) return null;
  const [zones, roads] = await Promise.all(['tsunami', 'roads'].map((name) => {
    const binding = bindings[name];
    return collectFeatures(new HonuaClient({ baseUrl: binding.baseUrl }), binding, (feature) => {
      const geometry = name === 'tsunami' ? zoneGeometry(feature.geometry) : wgs84Geometry(feature.geometry);
      if (name === 'roads' && !['LineString', 'MultiLineString'].includes(geometry.type)) throw new Error('Road context must contain lines');
      return { type: 'Feature', id: feature.attributes.objectid, properties: feature.attributes, geometry };
    });
  }));
  if (!zones.length) throw new Error('The connected zone layer is empty');
  return { zones, roads };
}
