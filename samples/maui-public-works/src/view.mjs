import { cells, element } from '../../../shared/state-local/dom.mjs';
import { STAGES, associatedInspections } from './records.mjs';

const CONDITIONS = { G: 'Good', F: 'Fair', P: 'Poor', exercise_good: 'Good (exercise)',
  exercise_fair: 'Fair (exercise)', exercise_poor: 'Poor (exercise)' };
const date = (value) => new Date(value).toISOString().replace('T', ' ').slice(0, 16);
export const conditionLabel = (row) => CONDITIONS[row.bridge_condition ?? row.condition];
export const stageLabel = (row) => STAGES[row.status] ?? (row.status === 'exercise_open' ? 'Open' : 'Historical inventory');


function recordButton(feature, onSelect) {
  const button = element('button', feature.properties.record_id, { type: 'button', class: 'request-link' });
  button.addEventListener('click', () => onSelect(feature));
  return button;
}

export function renderMetrics(inventory) {
  const { bridges, orders, inspections } = inventory;
  const values = [['Historical NBI bridges', bridges.length], ['NBI poor condition (2025)', bridges.filter(({ properties }) => properties.bridge_condition === 'P').length],
    ['Unclosed exercise orders', orders.filter(({ properties }) => properties.closed === null).length],
    ['Exercise inspections', inspections.length], ['Fictional crews assigned', new Set(orders.map(({ properties }) => properties.crew)).size]];
  document.querySelector('#metrics').replaceChildren(...values.map(([label, value]) => {
    const entry = element('div');
    entry.append(element('dt', label), element('dd', value));
    return entry;
  }));
}

export function renderRows(records, onSelect) {
  document.querySelector('#rows').replaceChildren(...records.map((feature) => {
    const record = feature.properties;
    const row = cells(['', record.facility_carried_007 ?? record.crew, conditionLabel(record), stageLabel(record)]);
    row.firstChild.append(recordButton(feature, onSelect));
    return row;
  }));
}

export function renderBoard(orders, onSelect) {
  document.querySelector('#board').replaceChildren(...Object.entries(STAGES).map(([stage, label]) => {
    const matching = orders.filter(({ properties }) => properties.status === stage);
    const column = element('section', null, { class: 'board-column' });
    const list = element('ol');
    list.append(...matching.map((feature) => {
      const item = element('li');
      const row = feature.properties;
      item.append(recordButton(feature, onSelect), element('p', row.crew), element('p', `Due ${date(row.due)} UTC`));
      return item;
    }));
    column.append(element('h3', `${label} · ${matching.length}`), list);
    if (!matching.length) column.append(element('p', 'No orders in this stage.'));
    return column;
  }));
}

export function renderCrews(inventory) {
  const crews = [...new Set([...inventory.orders, ...inventory.inspections].map(({ properties }) => properties.crew))].sort();
  document.querySelector('#crew-rows').replaceChildren(...crews.map((crew) => cells([crew,
    inventory.orders.filter(({ properties }) => properties.crew === crew && properties.closed === null).length,
    inventory.inspections.filter(({ properties }) => properties.crew === crew).length])));
}

function detailList(entries) {
  const list = element('dl');
  for (const [label, value] of entries) list.append(element('dt', label), element('dd', value ?? 'Not supplied'));
  return list;
}

function bridgeDetails(row) {
  return [element('p', 'REAL DATA · historical NBI inventory, June 20, 2025'), detailList([
    ['Road carried', row.facility_carried_007], ['Feature crossed', row.features_desc_006a],
    ['Bridge condition', conditionLabel(row)], ['Deck / superstructure / substructure / culvert ratings',
      [row.deck_cond_058, row.superstructure_cond_059, row.substructure_cond_060, row.culvert_cond_062].join(' / ')],
    ['Inspection date (source MMYY)', row.date_of_inspect_090], ['Year built (source)', row.year_built_027] ]),
  element('p', 'NBI component ratings use 0–9; N means not applicable. This snapshot is not a current safety assessment. Exercise orders are attached to roads, not to this bridge.')];
}

function exerciseDetails(feature, inventory, onSelect) {
  const row = feature.properties;
  const matches = row.record_type === 'work_order' ? associatedInspections(feature, inventory.inspections)
    : inventory.orders.filter(({ properties }) => properties.asset_id === row.asset_id);
  const related = element('ul');
  related.append(...matches.map((match) => { const item = element('li'); item.append(recordButton(match, onSelect)); return item; }));
  return [element('p', `DEMO DATA · fictional ${row.record_type.replaceAll('_', ' ')}`), detailList([
    ['Stage', stageLabel(row)], ['Condition', conditionLabel(row)], ['Assigned crew', row.crew],
    ['Road anchor asset ID', row.asset_id], ['Opened (UTC)', date(row.created)], ['Due (UTC)', date(row.due)],
    ['Closed (UTC)', row.closed === null ? 'Unclosed at exercise date' : date(row.closed)], ['Exercise date', row.scenario_date] ]),
  element('h3', 'Same road anchor'), related, element('p', matches.length ? 'These records share the exact asset ID; this is not a proximity match.' : 'No related records share this road anchor.')];
}

export function renderDetail(feature, inventory, onSelect) {
  const row = feature.properties;
  document.querySelector('#detail').replaceChildren(element('h2', row.record_id),
    ...(row.kind === 'bridge' ? bridgeDetails(row) : exerciseDetails(feature, inventory, onSelect)));
}
