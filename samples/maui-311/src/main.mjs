import './dashboard.css';
import { loadRequests, sourceBinding } from './source.mjs';
import { exportCsv, exportGeojson, selectRecords } from './records.mjs';
import { element, renderAnalysis, renderDetail, renderMetrics, renderRows } from './view.mjs';
import { createRequestMap, mapUnavailable, updateMap } from './map.mjs';
import { bindFeed } from './feed-view.mjs';

const form = document.querySelector('#filters');
const refresh = document.querySelector('#refresh');
const status = document.querySelector('#load-status');
let records = [];
let filtered = [];
let shown = 25;
let map;
let binding;
let setFeedRecords;

function select(id) {
  const feature = filtered.find(({ properties }) => properties.record_id === id);
  if (feature) renderDetail(feature);
}

function render() {
  filtered = selectRecords(records, Object.fromEntries(new FormData(form)));
  renderMetrics(filtered);
  renderAnalysis(filtered, records[0]?.properties.asOf ?? null);
  renderRows(filtered.slice(0, shown), select);
  document.querySelector('#more').hidden = shown >= filtered.length;
  document.querySelector('#result-count').textContent = `${filtered.length} matching requests · showing ${Math.min(shown, filtered.length)}`;
  document.querySelector('#detail').replaceChildren(element('h2', 'Request details'), element('p', filtered.length
    ? 'Select a request on the map or in the list to inspect its exercise timeline and crew.' : 'No requests match these filters. Clear filters to restore the exercise.'));
  if (map) updateMap(map, filtered);
  document.querySelector('#csv').disabled = !filtered.length;
  document.querySelector('#geojson').disabled = !filtered.length;
}

async function refreshData() {
  refresh.disabled = true;
  status.dataset.state = 'loading';
  status.textContent = 'Loading and checking every page of the exercise layer…';
  document.querySelector('#dashboard').hidden = true;
  document.body.dataset.sampleStatus = 'loading';
  setFeedRecords([]);
  try {
    records = await loadRequests(binding);
    setFeedRecords(records);
    document.querySelector('#dashboard').hidden = false;
    if (!map) {
      try { map = createRequestMap(select); } catch {
        mapUnavailable();
      }
    }
    map?.resize();
    shown = 25;
    render();
    const asOf = records[0]?.properties.scenario_date;
    document.querySelector('#scenario').textContent = asOf ? `Fictional requests · exercise date ${asOf} (UTC). Metrics use this date, not today.` : 'The connected exercise layer contains no requests.';
    status.textContent = `Loaded ${records.length} exercise requests. Refresh checks the source again; this is not a live county service.`;
    status.dataset.state = 'ready';
    document.body.dataset.sampleStatus = 'pass';
  } catch (error) {
    records = [];
    filtered = [];
    status.textContent = `Could not load exercise requests. ${error.message}. Use Refresh data to retry.`;
    status.dataset.state = 'error';
    document.body.dataset.sampleStatus = 'fail';
  } finally {
    refresh.disabled = false;
  }
}

function download(format) {
  const contents = format === 'csv' ? exportCsv(filtered) : JSON.stringify(exportGeojson(filtered));
  const blob = new Blob([contents], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const link = element('a', null, { href: url, download: `DEMO-DATA-maui-311.${format}` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

form.addEventListener('submit', (event) => event.preventDefault());
form.addEventListener('input', () => { shown = 25; render(); });
form.addEventListener('reset', () => setTimeout(() => { shown = 25; render(); }));
document.querySelector('#more').addEventListener('click', () => { shown += 25; render(); });
document.querySelector('#csv').addEventListener('click', () => download('csv'));
document.querySelector('#geojson').addEventListener('click', () => download('geojson'));
refresh.addEventListener('click', refreshData);
try {
  binding = sourceBinding(location.search);
  if (binding) {
    setFeedRecords = bindFeed(binding);
    const endpoint = new URL(`/rest/services/${binding.serviceId}/FeatureServer/${binding.layerId}`, binding.baseUrl);
    document.querySelector('#source-link').append(element('a', 'Inspect the connected FeatureServer layer', { href: endpoint.href }));
    await refreshData();
  } else document.body.dataset.sampleStatus = 'unconfigured';
} catch (error) {
  status.textContent = error.message;
  status.dataset.state = 'error';
  document.body.dataset.sampleStatus = 'fail';
}
