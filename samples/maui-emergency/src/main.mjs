import './dashboard.css';
import { bindings, loadExercise } from './source.mjs';
import { loadSnapshot } from './snapshot.mjs';
import { loadContext } from './context.mjs';
import { containsPoint, parseLocation, nearestShelter } from './location.mjs';
import { createExerciseMap, showContext } from './map.mjs';
import { filterRecords } from './records.mjs';
import { renderDetail, renderMetrics, renderRows } from './view.mjs';
import { element } from '../../../shared/state-local/dom.mjs';
import { displayUtc } from '../../../shared/state-local/exercise-time.mjs';
import { updateFeatureMap, fitFeatureMap } from '../../../shared/state-local/map.mjs';

const form = document.querySelector('#filters');
const status = document.querySelector('#load-status');
const freshness = document.querySelector('#freshness');
const refresh = document.querySelector('#refresh');
const dashboard = document.querySelector('#dashboard');
let source;
let records = [];
let filtered = [];
let shown = 25;
let view;
let timer;
let loading = false;
let verifiedAt;
let selectedId;
let context;
let checkedPoint;

function select(feature) {
  selectedId = feature.id;
  renderDetail(feature, source);
  const detail = document.querySelector('#detail');
  detail.scrollIntoView({ block: 'nearest' });
  detail.focus({ preventScroll: true });
}

function render() {
  filtered = filterRecords(records, Object.fromEntries(new FormData(form)));
  renderRows(filtered.slice(0, shown), select);
  document.querySelector('#shelter-list').replaceChildren(...filtered.filter(({ properties: p }) => p.record_type === 'exercise_shelter').map((feature) => {
    const p = feature.properties;
    const button = element('button', '', { type: 'button', class: 'shelter-item' });
    button.append(element('strong', p.record_id), element('span', p.anchor_name || p.asset_id), element('span', `${p.status.replace('exercise_', '')} · ${p.occupancy} / ${p.capacity} fictional occupants`));
    const meter = element('progress', '', { max: p.capacity, value: p.occupancy, 'aria-label': `${p.record_id} fictional occupancy` });
    button.append(meter);
    button.addEventListener('click', () => select(feature));
    return button;
  }));
  document.querySelector('#result-count').textContent = `${filtered.length} matching exercise records · showing ${Math.min(shown, filtered.length)}`;
  document.querySelector('#more').hidden = shown >= filtered.length;
  const selected = filtered.find((record) => record.id === selectedId);
  if (selected) renderDetail(selected, source);
  else document.querySelector('#detail').replaceChildren(element('h2', 'Exercise record details'),
    element('p', filtered.length ? 'Select a feature on the map or a record below.' : 'No records match. Clear filters to restore the exercise.'));
  if (view) updateFeatureMap(view, filtered);
}

function showExercise() {
  dashboard.hidden = false;
  if (!view) {
    try { view = createExerciseMap((id) => { const feature = filtered.find((record) => record.id === id); if (feature) select(feature); }); }
    catch { document.querySelector('#map-status').textContent = 'Map unavailable. Use the exercise resources table to inspect records.'; }
  }
  view?.map.resize();
  renderMetrics(records);
  render();
  if (view) showContext(view, context ?? { zones: [], roads: [] });
  if (checkedPoint) checkLocation(checkedPoint);
}

function freshnessText() {
  if (source.snapshot) { freshness.textContent = 'Static exercise snapshot · source update and original school/road retrieval dates are not recorded. Not a live server check. Exercise date: 2026-11-03. Inspect source receipts below.'; return; }
  const last = verifiedAt ? `Last successful Honua check: ${displayUtc(verifiedAt)} UTC.` : 'No successful server check yet.';
  const date = records[0]?.properties.scenario_date;
  freshness.textContent = `${last} ${date ? `Exercise date: ${date} (UTC). ` : ''}Checks every 60 seconds. Check times do not establish source freshness.`;
  freshness.dataset.verifiedAt = verifiedAt ? new Date(verifiedAt).toISOString() : '';
}

async function load() {
  if (loading) return;
  loading = true;
  clearTimeout(timer);
  refresh.disabled = true;
  const preserveView = records.length > 0;
  document.body.dataset.sampleStatus = 'loading';
  status.dataset.state = 'loading';
  status.textContent = 'Checking both layers, exercise labels and every page of records…';
  try {
    const snapshot = source.snapshot ? await loadSnapshot() : null;
    records = snapshot ? snapshot.records : await loadExercise(source);
    context = undefined;
    try { context = snapshot ? snapshot.context : await loadContext(location.search); }
    catch (error) { answer.textContent = `Zone check unavailable: ${error.message}. Check the approved receipts and refresh.`; }
    if (context && !checkedPoint) answer.textContent = `Connected ${context.zones.length} tsunami zone features and ${context.roads.length} road features. Enter coordinates to inspect the geography.`;
    if (!source.snapshot) verifiedAt = Date.now();
    const validation = records.some(({ properties }) => [true, 1].includes(properties.validation_geometry));
    document.querySelectorAll('[data-geometry-source]').forEach((node) => { node.textContent = validation
      ? 'Synthetic validation geometry; not county source locations.' : 'Geometry: Hawaii Statewide GIS Program, public domain.'; });
    showExercise();
    if (!preserveView && view) fitFeatureMap(view, filtered);
    status.textContent = `Loaded ${records.length} fictional exercise records. No operational use.`;
    status.dataset.state = 'ready';
    document.body.dataset.sampleStatus = 'pass';
  } catch (error) {
    records = [];
    if (checkedPoint) document.querySelector('#location-answer').textContent = 'Exercise resources could not be verified. Refresh before checking again.';
    dashboard.hidden = true;
    status.textContent = `Could not verify the exercise. ${error.message}. Check the import receipts, then refresh.`;
    status.dataset.state = 'error';
    document.body.dataset.sampleStatus = 'fail';
  } finally {
    freshnessText();
    refresh.disabled = false;
    loading = false;
    if (!source.snapshot) timer = setTimeout(load, 60_000);
  }
}

form.addEventListener('submit', (event) => event.preventDefault());
form.addEventListener('input', () => { shown = 25; if (records.length) { render(); if (view) fitFeatureMap(view, filtered); } });
form.addEventListener('reset', () => setTimeout(() => { shown = 25; render(); if (view) fitFeatureMap(view, filtered); }));
document.querySelector('#more').addEventListener('click', () => { shown += 25; render(); });
refresh.addEventListener('click', load);
const answer = document.querySelector('#location-answer');
function checkLocation(point) {
  checkedPoint = point;
  if (!context) { answer.textContent = 'Zone check unavailable: no verified tsunami layer is connected. Do not infer that a location is outside a zone.'; return; }
  const matches = context.zones.filter(({ geometry }) => containsPoint(point, geometry));
  const nearest = nearestShelter(point, records);
  answer.textContent = `${matches.length ? `This point intersects mapped ${[...new Set(matches.map(({ properties }) => properties.zone_kind))].join(' and ')} tsunami evacuation zone geography (including boundaries); this is not a safety determination.` : 'No intersection found in the connected zone layer; this is not a safety determination.'} ${nearest ? `Nearest not-closed exercise school anchor: ${nearest.feature.id}, ${nearest.km.toFixed(1)} km straight-line distance. Fictional shelter; no route or travel-time estimate.` : 'No verified exercise shelter candidates.'} Follow current official guidance for actual emergencies.`;
}
document.querySelector('#location-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try { checkLocation(parseLocation(document.querySelector('#coordinates').value)); }
  catch (error) { answer.textContent = error.message; }
});
document.querySelector('#locate').addEventListener('click', () => {
  if (!navigator.geolocation) { answer.textContent = 'Location access unavailable. Enter coordinates instead.'; return; }
  answer.textContent = 'Waiting for location permission…';
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    const value = `${coords.latitude}, ${coords.longitude}`;
    document.querySelector('#coordinates').value = value;
    try { checkLocation(parseLocation(value)); } catch (error) { answer.textContent = error.message; }
  }, () => { answer.textContent = 'Could not access your location. Enter coordinates instead.'; }, { timeout: 10000, maximumAge: 0 });
});

try {
  source = location.search ? bindings(location.search) : { snapshot: true };
  if (source) await load();
  else document.body.dataset.sampleStatus = 'unconfigured';
} catch (error) {
  status.textContent = error.message;
  status.dataset.state = 'error';
  document.body.dataset.sampleStatus = 'fail';
}
