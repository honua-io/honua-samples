import { cells, element } from '../../../shared/state-local/dom.mjs';
import { displayUtc } from '../../../shared/state-local/exercise-time.mjs';
import { exerciseSummary, STAGES } from './records.mjs';

export function renderMetrics(records) {
  const summary = exerciseSummary(records);
  const metrics = [ ['Exercise shelters', summary.shelters], ['Not closed (fictional)', summary.openShelters],
    ['Capacity (not closed)', summary.capacity], ['Occupants (not closed)', summary.occupancy], ['Unclosed exercise closures', summary.unclosedClosures] ];
  document.querySelector('#metrics').replaceChildren(...metrics.map(([label, value]) => {
    const item = element('div');
    item.append(element('dt', label), element('dd', value.toLocaleString('en-US')));
    return item;
  }));
}

export function renderRows(records, select) {
  const rows = document.querySelector('#rows');
  const focusedId = rows.contains(document.activeElement) ? document.activeElement.dataset.recordId : undefined;
  rows.replaceChildren(...records.map((feature) => {
    const row = feature.properties;
    const record = cells(['', row.asset_id, STAGES[row.status], row.record_type === 'exercise_shelter' ? `${row.occupancy} / ${row.capacity} · DEMO DATA` : 'Not applicable']);
    const button = element('button', row.record_id, { type: 'button', class: 'request-link' });
    button.dataset.recordId = row.record_id;
    button.addEventListener('click', () => select(feature));
    record.firstChild.append(button);
    return record;
  }));
  if (focusedId) [...rows.querySelectorAll('button')].find((button) => button.dataset.recordId === focusedId)?.focus({ preventScroll: true });
}

export function renderDetail(feature, source) {
  const row = feature.properties;
  const shelter = row.record_type === 'exercise_shelter';
  const binding = source[shelter ? 'shelter' : 'closure'];
  const details = element('dl');
  const values = [ ['Status', STAGES[row.status]], ['Source anchor', row.asset_id],
    ['Exercise date (UTC)', row.scenario_date], ['Exercise opened (UTC)', displayUtc(row.opened_at)],
    ['Exercise due (UTC)', displayUtc(row.due_at)], ['Exercise closed (UTC)', row.closed_at ? displayUtc(row.closed_at) : 'Not closed'] ];
  if (shelter) values.push(['Fictional occupancy / capacity', `${row.occupancy} / ${row.capacity}`]);
  for (const [label, value] of values) details.append(element('dt', label), element('dd', value));
  const url = `${binding.baseUrl}/rest/services/${binding.serviceId}/FeatureServer/${binding.layerId}`;
  const link = element('a', 'Inspect the anonymous source layer', { href: url, target: '_blank', rel: 'noopener' });
  document.querySelector('#detail').replaceChildren(element('h2', row.record_id), element('p', 'DEMO DATA · fictional exercise record'), details,
    element('p', shelter ? 'The school is a geographic anchor, not a designated shelter.' : 'The road is a geographic anchor, not an actual closure.'), link);
}
