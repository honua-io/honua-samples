import maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createFeatureMap } from '../../../shared/state-local/map.mjs';

maplibregl.setWorkerUrl(workerUrl);

export function createInventoryMap(onSelect) {
  const status = document.querySelector('#map-status');
  return createFeatureMap({ library: maplibregl, onSelect, status,
    color: ['match', ['coalesce', ['get', 'bridge_condition'], ['get', 'condition']],
      'G', '#21813c', 'exercise_good', '#21813c', 'F', '#a86408', 'exercise_fair', '#a86408', '#be3e34'],
    attribution: 'FHWA NBI / Hawaii Statewide GIS Program · public domain. Exercise: Honua · CC0.',
    onError: () => { status.textContent = 'Map unavailable. Use the inventory table to inspect records.'; } });
}
