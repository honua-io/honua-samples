import * as maplibregl from 'maplibre-gl';

export function createRequestMap(onSelect) {
  const map = new maplibregl.Map({ container: 'map', center: [-156.4, 20.85], zoom: 9,
    style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef1ec' } }] },
    attributionControl: false });
  map.addControl(new maplibregl.NavigationControl(), 'top-left');
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Hawaii Statewide GIS Program · Public domain geometry; Honua CC0 exercise records' }));
  map.on('error', () => { document.querySelector('#map-status').textContent = 'Map unavailable. The request list and downloads remain available.'; });
  map.on('load', () => {
    map.addSource('requests', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'request-lines', type: 'line', source: 'requests', filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': statusColor(), 'line-width': 5, 'line-opacity': .85 } });
    map.addLayer({ id: 'request-points', type: 'circle', source: 'requests', filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': statusColor(), 'circle-radius': 7, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
    for (const layer of ['request-lines', 'request-points']) {
      map.on('click', layer, (event) => onSelect(event.features[0].properties.record_id));
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    }
  });
  return map;
}

function statusColor() {
  return ['match', ['get', 'status'], 'exercise_open', '#b2591e', 'exercise_in_progress', '#2564a1', '#397c58'];
}

export function updateMap(map, records) {
  const update = () => {
    map.getSource('requests').setData({ type: 'FeatureCollection', features: records });
    if (!records.length) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const { geometry } of records) {
      const positions = geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates.flat();
      for (const position of positions) bounds.extend(position);
    }
    map.fitBounds(bounds, { padding: 36, maxZoom: 14, duration: 0 });
    map.once('idle', () => {
      document.querySelector('#map-status').textContent = `${records.length} exercise requests mapped. Select a road or point to inspect a request.`;
    });
  };
  if (map.getSource('requests')) update();
  else map.once('load', update);
}
