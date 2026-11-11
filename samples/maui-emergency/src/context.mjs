import { HonuaClient } from '@honua/sdk-js';
import { namedBindings } from '../../../shared/state-local/binding.mjs';
import { collectFeatures } from '../../../shared/state-local/features.mjs';
import { wgs84Geometry } from '../../../shared/state-local/geometry.mjs';
import { zoneGeometry } from './location.mjs';

export function contextFeature(feature, name) {
  const attributes = feature.attributes;
  const encoded = attributes.properties;
  const properties = typeof encoded === 'string' ? JSON.parse(encoded) : encoded ?? attributes;
  const geometry = name === 'tsunami' ? zoneGeometry(feature.geometry) : wgs84Geometry(feature.geometry);
  if (name === 'roads' && !['LineString', 'MultiLineString'].includes(geometry.type)) throw new Error('Road context must contain lines');
  if (name === 'tsunami') {
    const kinds = { 'Tsunami Evacuation Zone': 'regular', 'Extreme Tsunami Evacuation Zone': 'extreme' };
    const kind = kinds[properties.zone_type];
    if (!kind) throw new Error('Unknown tsunami zone classification');
    return { type: 'Feature', id: attributes.objectid ?? attributes.OBJECTID ?? attributes.id, properties: { ...properties, zone_kind: kind }, geometry };
  }
  return { type: 'Feature', id: attributes.objectid ?? attributes.OBJECTID ?? attributes.id, properties, geometry };
}

export async function loadContext(search) {
  const bindings = namedBindings(search, ['tsunami', 'roads']);
  if (!bindings) return null;
  const [zones, roads] = await Promise.all(['tsunami', 'roads'].map((name) => {
    const binding = bindings[name];
    return collectFeatures(new HonuaClient({ baseUrl: binding.baseUrl }), binding, (feature) => contextFeature(feature, name));
  }));
  if (!zones.length) throw new Error('The connected zone layer is empty');
  return { zones, roads };
}
