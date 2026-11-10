import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createFeatureMap } from '../../../shared/state-local/map.mjs';

maplibregl.setWorkerUrl(workerUrl);

export function createExerciseMap(onSelect) {
  const status = document.querySelector('#map-status');
  const view = createFeatureMap({ library: maplibregl, onSelect, status, color: 'transparent',
    attribution: 'See connected source disclosures below. Exercise: Honua · CC0.',
    onError: () => { status.textContent = 'Map unavailable. Use the exercise resources table to inspect records.'; } });
  view.repaint((map, token) => {
    const colors = ['match', ['get', 'record_type'], 'exercise_shelter', token('--c-accent'), token('--c-warn')];
    map.setPaintProperty('record-points', 'circle-color', colors);
    map.setPaintProperty('record-lines', 'line-color', colors);
  });
  return view;
}

export function showContext(view, context) {
  const map = view.map;
  const update = () => {
    for (const [id, features] of [['context-zones', context.zones], ['context-roads', context.roads]]) {
      const data = { type: 'FeatureCollection', features };
      if (map.getSource(id)) map.getSource(id).setData(data);
      else map.addSource(id, { type: 'geojson', data });
    }
    if (map.getLayer('context-zones')) return;
    map.addLayer({ id: 'context-zones', type: 'fill', source: 'context-zones', paint: { 'fill-opacity': .25 } }, 'record-lines');
    map.addLayer({ id: 'context-roads', type: 'line', source: 'context-roads', paint: { 'line-width': 1.5 } }, 'record-lines');
    view.repaint((target, token) => {
      target.setPaintProperty('context-zones', 'fill-color', ['match', ['get', 'zone_kind'], 'extreme', token('--hz-tsux'), token('--hz-tsu')]);
      target.setPaintProperty('context-roads', 'line-color', token('--c-text-2'));
    });
  };
  if (map.getSource('records')) update();
  else map.once('load', update);
}
