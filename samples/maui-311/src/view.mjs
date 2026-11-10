import { STATUS_LABELS, TYPE_LABELS, summarize, weeklyTrend } from './records.mjs';

export function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== null) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
const percent = (value) => value === null ? 'No closures' : `${Math.round(value * 100)}%`;
const date = (value) => new Date(value).toISOString().replace('T', ' ').slice(0, 16);

export function renderMetrics(records) {
  const totals = summarize(records);
  const values = [['Open requests', totals.open], ['New on exercise date', totals.today],
    ['Median days to close', totals.medianDays?.toFixed(1) ?? 'No closures'],
    ['Closed within SLA', percent(totals.withinSla)], ['Overdue open requests', totals.overdue]];
  document.querySelector('#metrics').replaceChildren(...values.map(([label, value]) => {
    const item = element('div', null);
    item.append(element('dt', label), element('dd', value));
    return item;
  }));
}

function cells(values) {
  const tr = element('tr', null);
  tr.append(...values.map((value) => element('td', value)));
  return tr;
}

export function renderAnalysis(records, asOf) {
  const trend = asOf === null ? [] : weeklyTrend(records, asOf);
  document.querySelector('#trend').replaceChildren(...trend.map((week) => cells([week.date, week.opened, week.closed])));
  document.querySelector('#sla').replaceChildren(...Object.entries(TYPE_LABELS).map(([type, label]) => {
    const total = summarize(records.filter(({ properties }) => properties.category === type));
    return cells([label, total.closed, percent(total.withinSla)]);
  }));
}

export function renderRows(records, onSelect) {
  document.querySelector('#rows').replaceChildren(...records.map(({ properties: row }) => {
    const tr = cells(['', TYPE_LABELS[row.category], STATUS_LABELS[row.status], row.district, date(row.created), date(row.due)]);
    const button = element('button', row.record_id, { type: 'button', class: 'request-link', 'aria-label': `Inspect ${row.record_id}` });
    button.addEventListener('click', () => onSelect(row.record_id));
    tr.firstChild.append(button);
    return tr;
  }));
}

function slaLabel(row) {
  if (row.closed !== null) return row.closed > row.due ? 'Closed after due time' : 'Closed within due time';
  return row.due < row.asOf ? 'Overdue' : 'Not due';
}

export function renderDetail(feature) {
  const row = feature.properties;
  const details = element('dl', null);
  for (const [label, value] of [['Status', STATUS_LABELS[row.status]], ['Request type', TYPE_LABELS[row.category]],
    ['Exercise district', row.district], ['Assigned exercise crew', row.crew],
    ['SLA at exercise date', slaLabel(row)]]) {
    details.append(element('dt', label), element('dd', value));
  }
  const timeline = element('ol', null);
  for (const [label, value] of [['Created', row.created], ['Due', row.due], ['Closed', row.closed]]) {
    if (value === null) continue;
    const item = element('li', label);
    item.append(element('time', `${date(value)} UTC`, { datetime: new Date(value).toISOString() }));
    timeline.append(item);
  }
  document.querySelector('#detail').replaceChildren(element('h2', row.record_id), element('p', 'DEMO DATA · fictional service request'),
    details, element('h3', 'Exercise timeline'), timeline, element('p', 'No notes, photos or reporter information are included in this exercise.'));
}
