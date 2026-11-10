import './dashboard.css';
import { bindings, loadExercise } from './source.mjs';
import { loadContext } from './context.mjs';
import { containsPoint, parseLocation, nearestShelter } from './location.mjs';
import { showContext } from './map.mjs';
import { filterRecords } from './records.mjs';
import { renderDetail, renderMetrics, renderRows } from './view.mjs';
import { element } from '../../../shared/state-local/dom.mjs';
import { displayUtc } from '../../../shared/state-local/exercise-time.mjs';
import { createExerciseMap } from './map.mjs';
import { updateFeatureMap } from '../../../shared/state-local/map.mjs';

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

function render(options = {}) {
  filtered = filterRecords(records, Object.fromEntries(new FormData(form)));
  renderRows(filtered.slice(0, shown), select);
  document.querySelector('#shelter-list').replaceChildren(...filtered.filter(({ properties: p }) => p.record_type === 'exercise_shelter').map((feature) => {
    const p = feature.properties;
    const button = element('button', '', { type: 'button', class: 'shelter-item' });
    button.append(element('strong', p.record_id), element('span', p.asset_id), element('span', `${p.status.replace('exercise_', '')} · ${p.occupancy} / ${p.capacity} fictional occupants`));
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
  if (view) updateFeatureMap(view, filtered, options);
}

function showExercise(options) {
  dashboard.hidden = false;
  if (!view) {
    try { view = createExerciseMap((id) => { const feature = filtered.find((record) => record.id === id); if (feature) select(feature); }); }
    catch { document.querySelector('#map-status').textContent = 'Map unavailable. Use the exercise resources table to inspect records.'; }
  }
  view?.map.resize();
  renderMetrics(records);
  render(options);
  if (context && view) showContext(view, context);
  if (checkedPoint) checkLocation(checkedPoint);
}

function freshnessText() {
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
    records = await loadExercise(source);
    verifiedAt = Date.now();
    const validation = records.some(({ properties }) => [true, 1].includes(properties.validation_geometry));
    document.querySelectorAll('[data-geometry-source]').forEach((node) => { node.textContent = validation
      ? 'Synthetic validation geometry; not county source locations.' : 'Geometry: Hawaii Statewide GIS Program, public domain.'; });
    showExercise({ fit: !preserveView });
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
    timer = setTimeout(load, 60_000);
  }
}

form.addEventListener('submit', (event) => event.preventDefault());
form.addEventListener('input', () => { shown = 25; if (records.length) render(); });
form.addEventListener('reset', () => setTimeout(() => { shown = 25; render(); }));
document.querySelector('#more').addEventListener('click', () => { shown += 25; render(); });
refresh.addEventListener('click', load);
const answer = document.querySelector('#location-answer');
function checkLocation(point) {
  checkedPoint = point;
  if (!context) { answer.textContent = 'Zone check unavailable: no verified tsunami layer is connected. Do not infer that a location is outside a zone.'; return; }
  const matches = context.zones.filter(({ geometry }) => containsPoint(point, geometry));
  const nearest = nearestShelter(point, records);
  answer.textContent = `${matches.length ? 'This point intersects a mapped tsunami zone (including boundaries).' : 'No intersection found in the connected zone layer; this is not a safety determination.'} ${nearest ? `Nearest not-closed exercise school anchor: ${nearest.feature.id}, ${nearest.km.toFixed(1)} km straight-line distance. Fictional shelter; no route or travel-time estimate.` : 'No verified exercise shelter candidates.'} Follow current official guidance for actual emergencies.`;
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
  context = await loadContext(location.search);
  if (context) answer.textContent = `Connected ${context.zones.length} tsunami zone features and ${context.roads.length} road features. Enter coordinates to inspect the geography.`;
} catch (error) { answer.textContent = `Zone check unavailable: ${error.message}. Check the approved receipts and reload.`; }

try {
  source = bindings(location.search);
  if (source) await load();
  else document.body.dataset.sampleStatus = 'unconfigured';
} catch (error) {
  status.textContent = error.message;
  status.dataset.state = 'error';
  document.body.dataset.sampleStatus = 'fail';
}
