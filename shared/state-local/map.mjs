import { positions } from './geometry.mjs';

export function createFeatureMap(options) {
  const { library, onSelect, color, attribution } = options;
  const map = new library.Map({ container: 'map', center: [-156.4, 20.85], zoom: 9,
    style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef1ec' } }] },
    attributionControl: false });
  map.addControl(new library.NavigationControl(), 'top-left');
  map.addControl(new library.AttributionControl({ compact: true, customAttribution: attribution }));
  map.on('error', options.onError);
  map.on('load', () => {
    map.addSource('records', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'record-lines', type: 'line', source: 'records', filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': color, 'line-width': 5, 'line-opacity': .85 } });
    map.addLayer({ id: 'record-points', type: 'circle', source: 'records', filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': color, 'circle-radius': 7, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
    for (const layer of ['record-lines', 'record-points']) {
      map.on('click', layer, (event) => onSelect(event.features[0].id));
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    }
  });
  return { map, library, status: options.status };
}

export function updateFeatureMap(view, records) {
  const { map, library, status } = view;
  const update = () => {
    map.getSource('records').setData({ type: 'FeatureCollection', features: records });
    if (!records.length) { status.textContent = 'No records match these filters.'; return; }
    const bounds = new library.LngLatBounds();
    for (const { geometry } of records) for (const position of positions(geometry)) bounds.extend(position);
    map.fitBounds(bounds, { padding: 36, maxZoom: 14, duration: 0 });
    map.once('idle', () => { status.textContent = `${records.length} records mapped. Select a feature or use the table.`; });
  };
  if (map.getSource('records')) update();
  else map.once('load', update);
}
