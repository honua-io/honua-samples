import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createFeatureMap } from '../../../shared/state-local/map.mjs';

maplibregl.setWorkerUrl(workerUrl);

export function createExerciseMap(onSelect) {
  const status = document.querySelector('#map-status');
  const tokens = () => getComputedStyle(document.documentElement);
  const color = (name) => tokens().getPropertyValue(name).trim();
  const view = createFeatureMap({ library: maplibregl, onSelect, status,
    color: ['match', ['get', 'record_type'], 'exercise_shelter', color('--c-accent'), color('--hz-tsu')],
    attribution: 'See geometry source disclosure below. Exercise: Honua · CC0.',
    onError: () => { status.textContent = 'Map unavailable. Use the exercise resources table to inspect records.'; } });
  const paint = () => {
    if (!view.map.getLayer('record-points')) return;
    const colors = ['match', ['get', 'record_type'], 'exercise_shelter', color('--c-accent'), color('--hz-tsu')];
    view.map.setPaintProperty('record-points', 'circle-color', colors);
    view.map.setPaintProperty('record-points', 'circle-stroke-color', color('--c-surface'));
    view.map.setPaintProperty('record-lines', 'line-color', colors);
  };
  view.map.on('load', paint);
  document.addEventListener('honua:theme', paint);
  return view;
}

export function showContext(view, context) {
  const map = view.map;
  const paint = () => {
    const tokens = getComputedStyle(document.documentElement);
    const color = (name) => tokens.getPropertyValue(name).trim();
    map.setPaintProperty('context-zones', 'fill-color', color('--hz-tsu'));
    map.setPaintProperty('context-roads', 'line-color', color('--map-road-casing'));
  };
  const update = () => {
    if (!map.getSource('context-zones')) {
      for (const [id, features] of [['context-zones', context.zones], ['context-roads', context.roads]]) {
        map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features } });
      }
      map.addLayer({ id: 'context-zones', type: 'fill', source: 'context-zones', paint: { 'fill-opacity': .25 } }, 'record-lines');
      map.addLayer({ id: 'context-roads', type: 'line', source: 'context-roads', paint: { 'line-width': 1.5 } }, 'record-lines');
      document.addEventListener('honua:theme', paint);
    }
    paint();
  };
  if (map.getSource('records')) update();
  else map.once('load', update);
}
