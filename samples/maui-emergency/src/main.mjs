import './dashboard.css';
import { bindings, loadExercise } from './source.mjs';
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
    const validation = records.some(({ properties }) => properties.validation_geometry === true);
    document.querySelectorAll('[data-geometry-source]').forEach((node) => { node.textContent = validation
      ? 'Synthetic validation geometry; not county source locations.' : 'Geometry: Hawaii Statewide GIS Program, public domain.'; });
    showExercise({ fit: !preserveView });
    status.textContent = `Loaded ${records.length} fictional exercise records. No operational use.`;
    status.dataset.state = 'ready';
    document.body.dataset.sampleStatus = 'pass';
  } catch (error) {
    records = [];
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
try {
  source = bindings(location.search);
  if (source) await load();
  else document.body.dataset.sampleStatus = 'unconfigured';
} catch (error) {
  status.textContent = error.message;
  status.dataset.state = 'error';
  document.body.dataset.sampleStatus = 'fail';
}
