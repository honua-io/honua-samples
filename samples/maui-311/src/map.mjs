import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createFeatureMap, updateFeatureMap, fitFeatureMap } from '../../../shared/state-local/map.mjs';

maplibregl.setWorkerUrl(workerUrl);
const views = new WeakMap();
export function mapUnavailable() {
  document.querySelector('#map-status').textContent = 'Map unavailable. The request list and downloads remain available.';
}

export function createRequestMap(onSelect) {
  const status = document.querySelector('#map-status');
  const view = createFeatureMap({ library: maplibregl, onSelect, status, onError: mapUnavailable,
    attribution: 'Hawaii Statewide GIS Program · Public domain geometry; Honua CC0 exercise records',
    color: ['match', ['get', 'status'], 'exercise_open', '#b2591e', 'exercise_in_progress', '#2564a1', '#397c58'] });
  views.set(view.map, view);
  return view.map;
}

export function updateMap(map, records) {
  const view = views.get(map);
  const status = view.status;
  updateFeatureMap(view, records);
  fitFeatureMap(view, records);
  const describe = () => { status.textContent = records.length
    ? `${records.length} exercise requests mapped. Select a road or point to inspect a request.` : 'No requests match these filters.'; };
  if (map.getSource('records')) map.once('idle', describe);
  else map.once('load', () => map.once('idle', describe));
}
