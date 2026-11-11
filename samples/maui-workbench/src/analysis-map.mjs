import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createLatestSketchBinding } from './analysis-sketch-binding.mjs';
import { createAnalysisSketch } from './analysis-sketch.mjs';

maplibregl.setWorkerUrl(workerUrl);

const empty = () => ({ type: 'FeatureCollection', features: [] });

export function createAnalysisMap(onSelect, measurement) {
  const map = new maplibregl.Map({ container: 'map', center: [-156.4, 20.85], zoom: 9, maxPitch: 60,
    style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background',
      paint: { 'background-color': '#eef1ec' } }] }, attributionControl: false });
  map.addControl(new maplibregl.NavigationControl());
  map.addControl(new maplibregl.AttributionControl({ customAttribution: 'County of Maui · DEMO DATA operations' }));
  measurement.map = map;
  let area;
  let loaded;
  const ready = new Promise((resolve) => { loaded = resolve; });
  const sketches = createLatestSketchBinding({ ready,
    create: (context) => createAnalysisSketch(map, { ...context, measurement }) });
  const selectRecord = (id) => { if (measurement.mode === 'off' && !sketches.drawing) onSelect(id); };
  let collection = empty();
  let selected = [];
  let camera;
  const position = () => {
    if (camera) map.jumpTo({ center: camera.slice(0, 2), zoom: camera[2], bearing: camera[3], pitch: camera[4] });
    else fitFeatures(map, collection);
  };
  const sync = () => {
    if (!map.getSource('records')) return;
    map.getSource('area').setData({ type: 'FeatureCollection', features: area ? [{ type: 'Feature', properties: {}, geometry: area }] : [] });
    map.getSource('records').setData(collection);
    map.getSource('selected').setData({ type: 'FeatureCollection',
      features: collection.features.filter((feature) => selected.includes(String(feature.id))) });
  };
  const theme = () => {
    if (map.getLayer('background')) map.setPaintProperty('background', 'background-color',
      getComputedStyle(document.documentElement).getPropertyValue('--map-land').trim() || '#eef1ec');
  };
  const observer = new MutationObserver(theme);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  map.on('load', () => { addLayers(map, selectRecord); theme(); sync(); position(); loaded(); });
  map.on('idle', () => {
    if (!map.getSource('records')) return;
    const visible = new Set(map.queryRenderedFeatures({ layers: ['records-fill', 'records-line', 'records-point'] })
      .map((feature) => feature.id)).size;
    map.getContainer().setAttribute('aria-label', `Map showing ${visible} matching county records in current view.`);
  });
  return { bindSketch(context) { return sketches.bind(context); },
    cancelSketch() { sketches.cancel(); },
    setArea(value) { area = Array.isArray(value) ? boundsGeometry(value) : value; sync(); },
    update(data) { collection = data; camera = undefined; sync(); fitFeatures(map, data); },
    restoreCamera(value) { camera = value; position(); },
    camera() { const center = map.getCenter().wrap(); return [center.lng, center.lat, map.getZoom(), map.getBearing(), map.getPitch()]; },
    select(ids) { selected = ids.map(String); sync(); },
    dispose() { sketches.dispose(); observer.disconnect(); measurement.map = undefined; map.remove(); } };
}

function addLayers(map, onSelect) {
  for (const source of ['area', 'records', 'selected']) {
    map.addSource(source, { type: 'geojson', data: empty() });
    const color = { records: '#276965', area: '#6659a6', selected: '#b86116' }[source];
    map.addLayer({ id: `${source}-fill`, type: 'fill', source,
      filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': .3 } });
    map.addLayer({ id: `${source}-line`, type: 'line', source,
      filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': color, 'line-width': source === 'selected' ? 4 : 1.5 } });
    map.addLayer({ id: `${source}-point`, type: 'circle', source,
      filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': color,
        'circle-radius': source === 'selected' ? 9 : 6, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
  }
  for (const layer of ['records-fill', 'records-line', 'records-point']) {
    map.on('click', layer, (event) => onSelect(event.features[0].id));
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }
}

function fitFeatures(map, collection) {
  const bounds = new maplibregl.LngLatBounds();
  const extend = (value) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number') bounds.extend(value);
    else value.forEach(extend);
  };
  for (const feature of collection.features) extend(feature.geometry?.coordinates);
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 32, maxZoom: 15, duration: 0 });
}

function boundsGeometry([west, south, east, north]) {
  return { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
}
