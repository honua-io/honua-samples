import { displaySnapshot } from '../../../shared/state-local/display-snapshot.mjs';
import './dashboard.css';
import { bindings, loadInventory } from './source.mjs';
import { filterFeatures, STAGES } from './records.mjs';
import { renderBoard, renderCrews, renderDetail, renderMetrics, renderRows } from './view.mjs';
import { element } from '../../../shared/state-local/dom.mjs';
import { createInventoryMap } from './map.mjs';
import { updateFeatureMap, fitFeatureMap } from '../../../shared/state-local/map.mjs';

const form = document.querySelector('#filters');
const status = document.querySelector('#load-status');
const refresh = document.querySelector('#refresh');
const dashboard = document.querySelector('#dashboard');
let inventory;
let filtered = [];
let shown = 25;
let view;
let source;

function select(feature) {
  renderDetail(feature, inventory, select);
  const detail = document.querySelector('#detail');
  detail.scrollIntoView({ block: 'nearest' });
  detail.focus({ preventScroll: true });
}

function mapFilters() {
  const dataset = form.elements.dataset.value;
  const bridge = dataset === 'bridges';
  const conditions = bridge ? { G: 'Good', F: 'Fair', P: 'Poor' }
    : { exercise_good: 'Good (exercise)', exercise_fair: 'Fair (exercise)', exercise_poor: 'Poor (exercise)' };
  form.elements.condition.replaceChildren(element('option', 'All conditions', { value: '' }),
    ...Object.entries(conditions).map(([value, label]) => element('option', label, { value })));
  const stages = dataset === 'orders' ? STAGES : { exercise_open: 'Open', exercise_in_progress: 'In progress', exercise_closed: 'Closed' };
  form.elements.status.replaceChildren(element('option', 'All stages', { value: '' }),
    ...Object.entries(stages).map(([value, label]) => element('option', label, { value })));
  form.elements.status.disabled = bridge;
  document.querySelector('#inventory-title').textContent = bridge ? 'Bridge inventory · NBI 2025' : `${dataset === 'orders' ? 'Work orders' : 'Inspections'} · DEMO DATA`;
  const bridgeLegend = inventory?.bridges.some(({ properties }) => properties.data_origin === 'synthetic_validation')
    ? 'Synthetic validation points, not county source records.' : 'Historical bridge points, June 20, 2025.';
  document.querySelector('#map-legend').textContent = `Good: green · Fair: amber · Poor: red. ${bridge ? bridgeLegend : 'Fictional conditions on real road segments.'} No basemap tiles are requested.`;
}

function renderInventory() {
  filtered = filterFeatures(inventory[form.elements.dataset.value], Object.fromEntries(new FormData(form)));
  renderRows(filtered.slice(0, shown), select);
  document.querySelector('#result-count').textContent = `${filtered.length} matching records · showing ${Math.min(shown, filtered.length)}`;
  document.querySelector('#more').hidden = shown >= filtered.length;
  document.querySelector('#detail').replaceChildren(element('h2', 'Record details'),
    element('p', filtered.length ? 'Select a feature on the map or a record in the list.' : 'No records match. Clear filters to restore the inventory.'));
  if (view) { updateFeatureMap(view, filtered); fitFeatureMap(view, filtered); }
}

async function load() {
  refresh.disabled = true;
  dashboard.hidden = true;
  inventory = null;
  filtered = [];
  document.body.dataset.sampleStatus = 'loading';
  status.textContent = 'Checking all three layers, their provenance and every page of records…';
  status.dataset.state = 'loading';
  try {
    inventory = await loadInventory(source);
    const fixtures = inventory.bridges.some(({ properties }) => properties.data_origin === 'synthetic_validation');
    document.querySelector('#bridge-provenance').replaceChildren(element('strong', fixtures ? 'VALIDATION FIXTURES' : 'REAL DATA'),
      document.createTextNode(fixtures ? ' Synthetic NBI-schema bridge points, not county source records.' : ' Historical NBI bridges · June 20, 2025.'));
    mapFilters();
    dashboard.hidden = false;
    if (!view) {
      try { view = createInventoryMap((id) => { const feature = filtered.find((record) => record.id === id); if (feature) select(feature); }); }
      catch { document.querySelector('#map-status').textContent = 'Map unavailable. Use the inventory table to inspect records.'; }
    }
    view?.map.resize();
    renderMetrics(inventory);
    renderBoard(inventory.orders, select);
    renderCrews(inventory);
    shown = 25;
    renderInventory();
    const date = inventory.orders[0]?.properties.scenario_date ?? inventory.inspections[0]?.properties.scenario_date;
    document.querySelector('#scenario').textContent = `${fixtures ? 'Synthetic bridge validation fixtures' : 'Historical bridges: June 20, 2025'}. Maintenance exercise: ${date ?? 'no exercise records'} (UTC).`;
    status.textContent = `Loaded ${inventory.bridges.length} ${fixtures ? 'synthetic bridge fixtures' : 'historical bridges'}, ${inventory.orders.length} fictional orders and ${inventory.inspections.length} fictional inspections.`;
    status.dataset.state = 'ready';
    document.body.dataset.sampleStatus = 'pass';
  } catch (error) {
    inventory = null;
    status.textContent = `Could not verify the inventory. ${error.message}. Check the import receipts, then refresh.`;
    status.dataset.state = 'error';
    document.body.dataset.sampleStatus = 'fail';
  } finally { refresh.disabled = false; }
}

form.addEventListener('submit', (event) => event.preventDefault());
form.addEventListener('input', (event) => {
  if (event.target === form.elements.dataset) mapFilters();
  shown = 25;
  if (inventory) renderInventory();
});
form.addEventListener('reset', () => setTimeout(() => { mapFilters(); shown = 25; if (inventory) renderInventory(); }));
document.querySelector('#more').addEventListener('click', () => { shown += 25; if (inventory) renderInventory(); });
refresh.addEventListener('click', load);
mapFilters();
try {
  source = displaySnapshot ? null : bindings(location.search);
  if (displaySnapshot || source) await load();
  else document.body.dataset.sampleStatus = 'unconfigured';
} catch (error) {
  status.textContent = error.message;
  status.dataset.state = 'error';
  document.body.dataset.sampleStatus = 'fail';
}
