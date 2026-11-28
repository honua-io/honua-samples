import { countyFieldText, countyFields, countyParcel, countyTmk } from './county-parcel.mjs';
import { mountCountyExports, updateCountyExports } from './county-export-control.mjs';

const descriptor = 'https://demo.honua.io/demo-data/publications/maui-county-parcels/20261117T170941Z/descriptor.json';
const countyLayers = ['county-fill', 'county-line', 'county-selected'];
const snapshotLayers = ['parcels-fill', 'parcels-line', 'parcels-sel'];

export function mountCountyPublication({ root, map, publication }) {
  const state = { root, map, publicationApi: publication ?? null, status: root.querySelector('#countyStatus'), details: root.querySelector('#countyDetails'), publication: null, source: null, loading: null, request: null, sequence: 0 };
  mountCountyExports(state);
  root.querySelector('#countySearch').addEventListener('submit', (event) => {
    event.preventDefault();
    selectCountyParcel(state, root.querySelector('#countyTmk').value);
  });
  const applyToggle = async () => {
    const view = await countyToggle(state);
    state.camera = view.camera;
    if (view.status) state.status.textContent = view.status;
  };
  root.addEventListener('toggle', () => { void applyToggle(); });
  const sharedTmk = new URL(location.href).searchParams.get('countyTmk');
  const openedByShare = sharedTmk !== null && !root.open;
  if (sharedTmk !== null) root.open = true;
  if (root.open && !openedByShare) void applyToggle();
  if (sharedTmk !== null) void selectCountyParcel(state, sharedTmk);
}

function capturedCamera(map) {
  if (!map) return null;
  return { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
}

async function countyToggle(state) {
  if (!state.root.open) {
    cancelSelection(state);
    countyVisibility(state);
    if (state.camera) state.map()?.jumpTo(state.camera);
    return { camera: null };
  }
  const camera = state.camera ?? capturedCamera(state.map());
  try {
    await connectCounty(state);
    if (state.root.open) attachCountyMap(state);
    return { camera };
  } catch {
    return { camera, status: 'County publication unavailable. Close and reopen this panel to retry. Snapshot data remains available.' };
  }
}

async function countyPublicationApi(state) {
  if (state.publicationApi) return state.publicationApi;
  const api = await import('@honua/sdk-js/export');
  return { openPublication: api.openPublication, publicationSource: api.publicationSource };
}

async function connectCounty(state) {
  if (state.source) return;
  if (state.loading) return state.loading;
  const api = await countyPublicationApi(state);
  state.status.textContent = 'Connecting to county publication…';
  state.loading = api.openPublication(descriptor, { signal: AbortSignal.timeout(20000) }).then((publication) => {
    state.publication = publication;
    state.source = api.publicationSource(publication);
    state.status.textContent = 'County publication connected. Enter a TMK or select a county parcel on the map.';
  }).finally(() => { state.loading = null; });
  return state.loading;
}

function cancelSelection(state) {
  state.sequence += 1;
  state.request?.abort();
  state.request = null;
}

async function selectCountyParcel(state, value) {
  cancelSelection(state);
  const sequence = state.sequence;
  state.details.replaceChildren();
  clearCountySelection(state);
  try {
    const tmk = countyTmk(value);
    state.status.textContent = `Looking up county TMK ${tmk}…`;
    await connectCounty(state);
    if (sequence !== state.sequence || !state.root.open) return;
    state.request = new AbortController();
    const answer = await state.source.lookup(tmk, { signal: AbortSignal.any([state.request.signal, AbortSignal.timeout(20000)]) });
    if (sequence !== state.sequence || !state.root.open) return;
    if (!answer.result.features.length) { state.status.textContent = `County TMK ${tmk} was not found in this publication.`; return; }
    const feature = countyParcel(state.publication, answer.result.features[0]);
    if (feature.properties.tmk_txt !== tmk) throw new Error('Parcel identity mismatch.');
    renderCountyDetails(state, feature);
    showCountySelection(state, feature);
    const warning = answer.limit ? ` ${answer.limit.message} Live lookup is not connected in this demo.` : '';
    state.status.textContent = `County TMK ${tmk} · GeoParquet details · captured 17 November 2026.${warning}`;
  } catch (error) {
    if (sequence === state.sequence && state.root.open) state.status.textContent = `County lookup unavailable: ${error.message} Snapshot data remains available.`;
  }
}

function renderCountyDetails(state, feature) {
  state.root.querySelector('#countyTmk').value = feature.properties.tmk_txt;
  for (const [name, value] of Object.entries(feature.properties)) {
    const label = document.createElement('dt'), detail = document.createElement('dd');
    label.textContent = countyFields[name]; detail.textContent = countyFieldText(name, value);
    state.details.append(label, detail);
  }
}

function attachCountyMap(state) {
  const map = state.map();
  if (!map) return;
  if (!map.getLayer('parcels-sel')) { map.once('load', () => { if (state.root.open) attachCountyMap(state); }); return; }
  if (!map.getSource('county-publication')) {
    const display = state.publication.display;
    const attribution = state.publication.descriptor.provenance.attribution;
    map.addSource('county-publication', { type: 'vector', url: `pmtiles://${display.pmtilesUrl}`, promoteId: display.promoteId, minzoom: display.minzoom, maxzoom: display.maxzoom, attribution });
    map.addLayer({ id: 'county-fill', type: 'fill', source: 'county-publication', 'source-layer': display.sourceLayer, paint: { 'fill-color': '#4897de', 'fill-opacity': 0.22 } });
    map.addLayer({ id: 'county-line', type: 'line', source: 'county-publication', 'source-layer': display.sourceLayer, paint: { 'line-color': '#2575be', 'line-width': 1.2 } });
    map.addSource('county-selection', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'county-selected', type: 'line', source: 'county-selection', paint: { 'line-color': '#e88029', 'line-width': 4 } });
    map.on('click', 'county-fill', (event) => {
      if (state.root.open) selectCountyParcel(state, event.features[0]?.properties?.tmk_txt);
    });
    map.on('error', (event) => {
      if (event.sourceId !== 'county-publication') return;
      state.mapFailed = true;
      state.root.querySelector('#countyMapStatus').textContent = 'County map unavailable. The snapshot map remains visible; county TMK search still uses GeoParquet.';
      countyVisibility(state);
      if (state.camera) map.jumpTo(state.camera);
    });
  }
  countyVisibility(state);
  if (state.selection) showCountySelection(state, state.selection);
}

const snapshotVisibility = new WeakMap();

function captureSnapshotVisibility(map) {
  const remembered = {};
  for (const layer of snapshotLayers) {
    if (map.getLayer(layer)) remembered[layer] = map.getLayoutProperty(layer, 'visibility') ?? 'visible';
  }
  return remembered;
}

function setLayerVisibility(map, layer, visibility) {
  if (visibility && map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', visibility);
}

function countyVisibility(state) {
  const map = state.map();
  if (!map) return;
  const showCounty = state.root.open && !state.mapFailed;
  if (showCounty && !snapshotVisibility.has(state)) snapshotVisibility.set(state, captureSnapshotVisibility(map));
  const remembered = snapshotVisibility.get(state);
  for (const layer of countyLayers) setLayerVisibility(map, layer, showCounty ? 'visible' : 'none');
  const hideSnapshot = showCounty && map.getSource('county-publication');
  for (const layer of snapshotLayers) setLayerVisibility(map, layer, hideSnapshot ? 'none' : remembered?.[layer]);
  if (!state.root.open) snapshotVisibility.delete(state);
}

function clearCountySelection(state) {
  state.selection = null;
  updateCountyExports(state);
  state.map()?.getSource('county-selection')?.setData({ type: 'FeatureCollection', features: [] });
}

function showCountySelection(state, feature) {
  state.selection = feature;
  updateCountyExports(state);
  const map = state.map();
  if (state.mapFailed || !map?.getSource('county-selection')) return;
  map.getSource('county-selection').setData(feature);
  map.fitBounds(window.HM.bbox(feature.geometry), { padding: 45, maxZoom: 17 });
}
