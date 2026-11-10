import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createFeatureMap } from '../../../shared/state-local/map.mjs';

maplibregl.setWorkerUrl(workerUrl);

export function createExerciseMap(onSelect) {
  const status = document.querySelector('#map-status');
  return createFeatureMap({ library: maplibregl, onSelect, status,
    color: ['match', ['get', 'record_type'], 'exercise_shelter', '#0d807b', '#a86408'],
    attribution: 'Hawaii Statewide GIS Program · public domain. Exercise: Honua · CC0.',
    onError: () => { status.textContent = 'Map unavailable. Use the exercise resources table to inspect records.'; } });
}
