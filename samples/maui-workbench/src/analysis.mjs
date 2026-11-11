import './analysis.css';
import { bindSelectionExplanation } from './analysis-selection.mjs';
import { describeFeatureTableCount } from '@honua/app-platform/web-components';
import { analysisBindings, openAnalysisSource, createAnalysisModel, analysisQuery,
  queryAnalysisMap, queryStatusChart, setAnalysisFilter, MAP_LIMIT } from './analysis-model.mjs';
import { createAnalysisMap } from './analysis-map.mjs';
import { collectAnalysisExport, encodeAnalysisExport } from './analysis-export.mjs';
import { createAnalysisShareUrl, parseAnalysisShare } from './analysis-share.mjs';
import { previewAnalysisCql2 } from './analysis-query.mjs';
import { bindQueryControls, queryControlIds, restoreQueryControls } from './analysis-query-controls.mjs';

const element = (id) => document.getElementById(id);
const status = element('connection-status');
let model;
let bindings;
let revision = 0;
let active;
let unsubscribe;
let exportSnapshot;
const explanation = bindSelectionExplanation({ model: () => model,
  button: element('explain-selection'), output: element('selection-explanation') });
const map = createAnalysisMap((id) => {
  if (model) model.table.select(model.table.keysForTargets([{ sourceId: model.source.descriptor.id, id }]), { replace: true });
}, element('measurement'));

function setControlsState(state) {
  if (state !== 'ready') map.cancelSketch();
  element('sketch').inert = state !== 'ready';
  for (const id of ['explain-selection', 'catalog', 'field', 'operator', 'value', 'apply', 'clear', 'export-csv', 'export-geojson', 'share', ...queryControlIds]) {
    element(id).disabled = state !== 'ready';
  }
}

function clearResults() {
  explanation.invalidate();
  element('share-output').hidden = true;
  map.update({ type: 'FeatureCollection', features: [] });
  element('map-status').textContent = 'Loading matching records…';
  element('chart-filters').replaceChildren();
  element('status-chart').chartModel = { id: 'status', title: 'Requests by status', kind: 'bar', status: 'loading' };
}

function bindTable(next) {
  element('feature-table').table = next.table;
  unsubscribe = next.table.subscribe((snapshot) => {
    if (model !== next) return;
    if (snapshot.state === 'error') { showError(snapshot.error ?? new Error('Table page validation failed.')); return; }
    explanation.invalidate();
    const targets = next.table.selectionTargets();
    map.select(targets.map((target) => target.id));
    element('selection-status').textContent = `${describeFeatureTableCount(snapshot.count)} · ${snapshot.selection.length} selected`;
  });
}

element('feature-table').addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !model) return;
  const cell = event.composedPath().find((node) => node.getAttribute?.('role') === 'gridcell');
  const row = cell?.closest('tr[data-row-key]');
  if (!row) return;
  event.preventDefault();
  const rowKey = row.dataset.rowKey;
  const field = cell.dataset.field;
  model.table.setFocus({ rowKey, field });
  model.table.select([rowKey], { replace: true });
  element('feature-table').shadowRoot.querySelector(
    `tr[data-row-key="${CSS.escape(rowKey)}"] [data-field="${CSS.escape(field)}"]`,
  )?.focus();
}, { capture: true });

function resetAnalysis() {
  active?.abort();
  unsubscribe?.();
  model?.table.dispose();
  model = null;
  map.setArea(undefined);
  element('feature-table').table = undefined;
  clearResults();
  setControlsState('busy');
}

async function chooseCatalog(restored) {
  const current = ++revision;
  resetAnalysis();
  active = new AbortController();
  try {
    const name = element('catalog').value;
    const handle = await openAnalysisSource(bindings[name], name);
    if (current !== revision) return;
    model = createAnalysisModel(handle);
    await map.bindSketch({ source: handle.source, element: element('sketch'), measurement: element('measurement'),
      onGeometry(clause) {
        if (model?.source !== handle.source) return;
        setAnalysisFilter(model, clause);
        restoreQueryControls(name, model.registry.snapshot.clauses);
        describeFilters();
        void refreshAnalysis();
      },
      onError(error) { status.textContent = error.message; },
    });
    if (current !== revision) return;
    for (const clause of restored?.clauses ?? []) setAnalysisFilter(model, {
      ...clause, owner: clause.id === 'chart-status' ? 'status-chart' : 'query',
    });
    element('field').replaceChildren(...handle.catalog.fields.map((field) => new Option(field, field)));
    element('value').value = '';
    restoreQueryControls(name, restored?.clauses);
    const fieldFilter = restored?.clauses.find((clause) => clause.id === 'query');
    if (fieldFilter) {
      element('field').value = fieldFilter.field;
      element('operator').value = fieldFilter.operator;
      element('value').value = fieldFilter.value;
    }
    describeFilters();
    element('source-link').textContent = handle.endpoint;
    bindTable(model);
    await refreshAnalysis(restored?.presentation);
  } catch (error) { if (current === revision) showError(error); }
}

async function refreshAnalysis(presentation) {
  const current = ++revision;
  exportSnapshot = undefined;
  active?.abort();
  active = new AbortController();
  const signal = active.signal;
  const next = model;
  clearResults();
  setControlsState('busy');
  element('export-status').textContent = '';
  try {
    const [result, chart, table] = await Promise.all([queryAnalysisMap(next, { signal }),
      queryStatusChart(next, { signal }), next.table.setFilters(next.registry.snapshot)]);
    if (current !== revision) return;
    if (!['ready', 'partial'].includes(table.state) || !['ready', 'partial'].includes(next.table.snapshot.state)) throw new Error('The feature table could not complete this query. Clear filters and retry.');
    element('feature-table').table = next.table;
    map.update(result.collection);
    if (presentation) {
      next.table.select(next.table.keysForTargets(presentation.selection.map((id) => ({
        sourceId: next.source.descriptor.id, id,
      }))), { replace: true });
      if (presentation.camera) map.restoreCamera(presentation.camera);
    }
    const count = result.collection.features.length;
    element('map-status').textContent = result.partial
      ? `First ${count} matching records mapped (limit ${MAP_LIMIT}). Use the table for remaining records.`
      : `${count} matching records mapped.`;
    renderChart(chart);
    status.textContent = `${next.catalog.label} connected. Filters apply to the map, table and exports.`;
    setControlsState('ready');
  } catch (error) { if (current === revision) showError(error); }
}

function renderChart(data) {
  element('status-chart').chartModel = { id: 'status', title: 'Requests by status', kind: 'bar',
    status: data ? 'ready' : 'unsupported', data: data ?? [], message: 'Status counts apply to the 311 layer.' };
  element('chart-status').textContent = data
    ? 'Counts include all matching records before the status-chart filter. Select a status below to filter other views.'
    : 'Parcel status counts are not applicable. Use the field filter to explore parcel attributes.';
  for (const datum of data ?? []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${datum.label} · ${datum.value}`;
    const selected = model.registry.snapshot.clauses.some((clause) => clause.id === 'chart-status' && clause.value === datum.label);
    button.setAttribute('aria-pressed', String(selected));
    button.addEventListener('click', () => {
      if (selected) model.registry.remove('chart-status');
      else setAnalysisFilter(model, { id: 'chart-status', field: 'status', operator: '=', value: datum.label, owner: 'status-chart' });
      describeFilters();
      void refreshAnalysis();
    });
    element('chart-filters').append(button);
  }
}

function describeClause(clause) {
  if (clause.id !== 'spatial') return `${clause.field} ${clause.operator} ${clause.value}`;
  if (Array.isArray(clause.value)) return `Intersects bounding box ${clause.value.join(', ')}`;
  return `Intersects drawn polygon (${clause.value.coordinates[0].length - 1} vertices)`;
}

function describeFilters() {
  map.setArea(model.registry.snapshot.clauses.find((clause) => clause.id === 'spatial')?.value);
  element('filter-summary').textContent = model.registry.snapshot.clauses
    .map(describeClause).join(' AND ') || 'No filters applied.';
  try { element('cql2-preview').textContent = previewAnalysisCql2(model.registry.snapshot.clauses); }
  catch { element('cql2-preview').textContent = 'CQL2 preview unavailable for this filter. The map, table and exports still use the active GeoServices query.'; }
}

function showError(error) {
  explanation.invalidate();
  revision += 1;
  active?.abort();
  exportSnapshot = undefined;
  setControlsState('busy');
  element('feature-table').table = undefined;
  map.update({ type: 'FeatureCollection', features: [] });
  status.textContent = `Could not finish the query: ${error.message} Clear filters or reconnect to retry.`;
  element('map-status').textContent = 'No completed map result. Retry before using these records.';
  element('status-chart').chartModel = { id: 'status', title: 'Requests by status', kind: 'bar', status: 'error', message: error.message };
  element('clear').disabled = !model;
  element('catalog').disabled = !bindings;
}

element('catalog').addEventListener('change', () => { void chooseCatalog(); });
element('query-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const field = element('field').value;
    const raw = element('value').value;
    const numeric = ['gisacres', 'taxacres'].includes(field);
    if (numeric && !Number.isFinite(Number(raw))) throw new Error('Enter a finite acreage value.');
    setAnalysisFilter(model, { id: 'query', field, operator: element('operator').value, value: numeric ? Number(raw) : raw });
    describeFilters();
    void refreshAnalysis();
  } catch (error) { status.textContent = error.message; }
});
element('clear').addEventListener('click', () => {
  model.registry.replace({ version: 1, clauses: [] });
  restoreQueryControls(element('catalog').value);
  describeFilters();
  void refreshAnalysis();
});
bindQueryControls({ model: () => model, refresh: () => { describeFilters(); void refreshAnalysis(); } });

async function download(format) {
  const current = revision;
  const next = model;
  setControlsState('busy');
  element('export-status').textContent = 'Collecting bounded, filtered records…';
  try {
    const collection = exportSnapshot ?? await collectAnalysisExport(next, analysisQuery(next), active.signal);
    if (current !== revision) return;
    exportSnapshot = collection;
    const content = encodeAnalysisExport(collection, next.columns, format);
    if (new TextEncoder().encode(content).byteLength > 8 * 1024 * 1024) throw new Error('Encoded export exceeds 8 MiB. Narrow the filter.');
    const url = URL.createObjectURL(new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/geo+json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `maui-${element('catalog').value}.${format}`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    element('export-status').textContent = `${collection.features.length} matching records exported as ${format.toUpperCase()}.`;
  } catch (error) { if (current === revision) element('export-status').textContent = error.message; }
  finally { if (current === revision) setControlsState('ready'); }
}

for (const format of ['csv', 'geojson']) element(`export-${format}`).addEventListener('click', () => { void download(format); });
element('share').addEventListener('click', () => {
  try {
    element('share-url').value = createAnalysisShareUrl(location.href, {
      catalog: element('catalog').value, clauses: model.registry.snapshot.clauses,
      presentation: { selection: model.table.selectionTargets().map((target) => target.id), camera: map.camera() },
    });
    element('share-output').hidden = false;
    element('share-url').focus();
    element('share-url').select();
  } catch (error) { status.textContent = error.message; }
});
function restoreAnalysis() {
  try {
    const restored = parseAnalysisShare(location.hash);
    element('catalog').value = restored?.catalog ?? 'requests';
    if (bindings) void chooseCatalog(restored);
  } catch (error) {
    ++revision;
    resetAnalysis();
    status.textContent = error.message;
    element('map-status').textContent = 'No completed map result. Open a valid share link to retry.';
  }
}

document.querySelector('.skip').addEventListener('click', (event) => {
  event.preventDefault();
  element('main').focus();
});
window.addEventListener('hashchange', restoreAnalysis);
try { bindings = analysisBindings(location.search); restoreAnalysis(); }
catch (error) { status.textContent = error.message; }
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  active?.abort(); unsubscribe?.(); model?.table.dispose(); map.dispose();
});

element('depth-link').search = location.search;
