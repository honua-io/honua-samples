import { operations, publicUrl, validateManifest, runAnalysis, exportCsv, exportGeoJson } from './workbench-analytics.mjs';
import { download } from './download.mjs';
import { element } from './dom.mjs';

const panel = document.querySelector('#serverAnalysis');
const status = panel.querySelector('[role=status]');
const output = panel.querySelector('[data-results]');
const select = panel.querySelector('select');
const run = panel.querySelector('[data-run]');
let manifest, result, map = document.querySelector('#map').honuaAnalysisMap;

function updateMap() {
  if (!map) return;
  const data = result?.collection ?? { type: 'FeatureCollection', features: [] };
  if (map.getSource('server-analysis')) { map.getSource('server-analysis').setData(data); return; }
  map.addSource('server-analysis', { type: 'geojson', data });
  map.addLayer({ id: 'server-analysis-fill', type: 'fill', source: 'server-analysis', filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#007e87', 'fill-opacity': 0.35 } });
  map.addLayer({ id: 'server-analysis-line', type: 'line', source: 'server-analysis', filter: ['!=', ['geometry-type'], 'Point'],
    paint: { 'line-color': '#007e87', 'line-width': 2 } });
  map.addLayer({ id: 'server-analysis-point', type: 'circle', source: 'server-analysis', filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-color': '#007e87', 'circle-radius': 6, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } });
}

function renderTable() {
  const definition = operations[result.key];
  const table = element('table', null);
  table.setAttribute('aria-label', `${definition.title} server result`);
  const head = element('tr', null);
  head.append(element('th', definition.label), element('th', definition.value));
  const thead = element('thead', null);
  thead.append(head);
  table.append(thead);
  const body = element('tbody', null);
  for (const row of result.rows) {
    const tr = element('tr', null);
    tr.append(element('td', row.label), element('td', String(row.value)));
    body.append(tr);
  }
  table.append(body);
  const scroll = element('div', null);
  scroll.style.cssText = 'max-height:240px;overflow:auto';
  scroll.append(table);
  output.append(scroll);
}

function renderAgent() {
  if (!result.agent) {
    output.append(element('p', result.agentError ? `Agent chart unavailable: ${result.agentError}` : 'Agent chart unavailable: no recorded agent execution was published for this response.'));
    return;
  }
  const agent = result.agent;
  output.append(element('h3', agent.chart.title), element('p', `Recorded agent answer · ${agent.provider} / ${agent.model} · ${agent.createdAt}`),
    element('p', `Question: ${agent.question}`));
  const chart = element('div', null);
  chart.setAttribute('aria-label', 'Recorded agent chart; values verified against the server table');
  const max = Math.max(1, ...agent.chart.series.map((row) => row.value));
  for (const row of agent.chart.series) {
    const bar = element('div', `${row.label}: ${row.value}`);
    bar.style.cssText = `border-left:4px solid #007e87;margin:4px 0;padding:4px;background:linear-gradient(to right, #007e8733 ${row.value / max * 100}%, transparent 0)`;
    chart.append(bar);
  }
  output.append(chart);
}

function renderResult() {
  output.replaceChildren();
  const provenance = element('details', null);
  provenance.append(element('summary', 'Dataset and request provenance'), element('pre', JSON.stringify({ dataset: result.dataset,
    request: result.request, responseSha256: result.sha256, serverImage: result.serverImage ?? null }, null, 2)));
  provenance.style.cssText = 'overflow-wrap:anywhere;white-space:normal';
  provenance.querySelector('pre').style.cssText = 'white-space:pre-wrap;font-size:11px';
  output.append(provenance);
  renderTable();
  renderAgent();
  const actions = element('div', null);
  for (const format of ['CSV', 'GeoJSON']) {
    const button = element('button', `Export analysis ${format}`);
    button.type = 'button';
    button.className = 'btn sm';
    button.addEventListener('click', () => download(`maui-${result.key}.${format === 'CSV' ? 'csv' : 'geojson'}`,
      format === 'CSV' ? exportCsv(result) : exportGeoJson(result), format.toLowerCase()));
    actions.append(button);
  }
  output.append(actions);
}

async function execute() {
  run.disabled = true;
  result = undefined;
  output.replaceChildren();
  updateMap();
  status.textContent = 'Running server analysis…';
  try {
    result = await runAnalysis(manifest, select.value, { base: location.href });
    status.textContent = `${result.mode} · ${manifest.dataset.name} · ${result.createdAt} · ${result.rows.length} result rows. Compatibility API analysis.`;
    renderResult();
    updateMap();
  } catch (error) { status.textContent = error.message; }
  finally { run.disabled = false; }
}

async function initialize() {
  try {
    const response = await fetch(publicUrl('/state-local/data/analysis/manifest.json', location.href), { credentials: 'omit' });
    if (!response.ok) throw new Error(`Server analysis manifest unavailable: HTTP ${response.status}.`);
    const published = await response.json();
    if (published === null) throw new Error('Server analysis is not published yet. No recorded or live results are available.');
    manifest = validateManifest(published);
    for (const option of select.options) option.disabled = !manifest.operations[option.value];
    const first = Array.from(select.options).find((option) => !option.disabled);
    if (!first) throw new Error('No server operations have been published for this dataset.');
    select.value = first.value;
    run.disabled = false;
    status.textContent = `${manifest.dataset.name} · Select an operation to load a real server result.`;
  } catch (error) { status.textContent = error.message; }
}

document.addEventListener('honua:workbench-map', (event) => { map = event.detail; updateMap(); });
run.addEventListener('click', execute);
initialize();
