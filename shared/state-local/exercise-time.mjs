export function timestamp(value, field) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Math.abs(value) > 8.64e15) throw new Error(`Exercise record has an invalid ${field}`);
    return value;
  }
  const parsed = Date.parse(value);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value.slice(0, 10)) throw new Error(`Exercise record has an invalid ${field}`);
  return parsed;
}


export function exerciseTimeline(row) {
  const created = timestamp(row.opened_at, 'creation time');
  const due = timestamp(row.due_at, 'due time');
  const closed = row.closed_at == null ? null : timestamp(row.closed_at, 'closure time');
  if (due < created || (closed !== null && closed < created)
    || (row.status === 'exercise_closed') !== (closed !== null)) throw new Error('Exercise record has an inconsistent timeline');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.scenario_date ?? '')) throw new Error('Exercise record is missing its scenario date');
  const asOf = timestamp(`${row.scenario_date}T23:59:59.999Z`, 'scenario date');
  if (created > asOf || (closed !== null && closed > asOf)) throw new Error('Exercise record extends beyond its scenario date');
  return { created, due, closed, asOf, opened_at: new Date(created).toISOString(),
    due_at: new Date(due).toISOString(), closed_at: closed === null ? null : new Date(closed).toISOString() };
}
