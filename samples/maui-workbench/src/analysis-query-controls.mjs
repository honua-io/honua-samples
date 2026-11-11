import { boundingBoxClause } from './analysis-spatial.mjs';
import { dateRangeClauses } from './analysis-query.mjs';
import { setAnalysisFilter } from './analysis-model.mjs';

const element = (id) => document.getElementById(id);
export const queryControlIds = ['date-start', 'date-end', 'apply-dates', 'west', 'south', 'east', 'north', 'apply-bounds', 'remove-bounds'];

export function restoreQueryControls(name, clauses = []) {
  element('date-form').hidden = name !== 'requests';
  element('date-start').value = clauses.find((clause) => clause.id === 'time-start')?.value ?? '';
  const end = clauses.find((clause) => clause.id === 'time-end')?.value;
  element('date-end').value = end ? new Date(Date.parse(`${end}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) : '';
  const bounds = clauses.find((clause) => clause.id === 'spatial')?.value ?? [];
  ['west', 'south', 'east', 'north'].forEach((id, index) => { element(id).value = bounds[index] ?? ''; });
}

export function bindQueryControls(context) {
  const submit = (form, action) => element(form).addEventListener('submit', (event) => {
    event.preventDefault();
    try { action(context.model()); context.refresh(); }
    catch (error) { element('connection-status').textContent = error.message; }
  });
  submit('date-form', (model) => {
    const clauses = dateRangeClauses(element('date-start').value, element('date-end').value);
    model.registry.remove('time-start'); model.registry.remove('time-end');
    for (const clause of clauses) setAnalysisFilter(model, clause);
  });
  submit('bounds-form', (model) => {
    const values = ['west', 'south', 'east', 'north'].map((id) => element(id).value);
    if (values.some((value) => !value.trim())) throw new Error('Enter all four bounding box coordinates.');
    setAnalysisFilter(model, boundingBoxClause(values.map(Number)));
  });
  element('remove-bounds').addEventListener('click', () => {
    context.model().registry.remove('spatial');
    for (const id of ['west', 'south', 'east', 'north']) element(id).value = '';
    context.refresh();
  });
}
