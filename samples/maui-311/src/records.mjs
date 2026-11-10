export const STATUS_LABELS = {
  exercise_open: 'Open', exercise_in_progress: 'In progress', exercise_closed: 'Closed',
};
export const TYPE_LABELS = {
  drainage: 'Drainage', road_surface: 'Road surface', accessibility: 'Accessibility',
};
const DAY_MS = 86_400_000;
const CSV_FIELDS = ['record_id', 'category', 'status', 'district', 'crew', 'opened_at', 'due_at',
  'closed_at', 'scenario_date', 'data_origin', 'is_demo', 'exercise_only', 'display_label'];

function timestamp(value, field) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Math.abs(value) > 8.64e15) throw new Error(`Exercise record has an invalid ${field}`);
    return value;
  }
  const parsed = Date.parse(value);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value.slice(0, 10)) throw new Error(`Exercise record has an invalid ${field}`);
  return parsed;
}

function contractFields(row) {
  return Object.fromEntries(CSV_FIELDS.map((field) => [field, row[field]]));
}

export function validateRecord(attributes) {
  const row = attributes;
  assertExerciseProvenance(row);
  if (row.record_type !== 'service_request' || !Object.hasOwn(STATUS_LABELS, row.status) || !Object.hasOwn(TYPE_LABELS, row.category)
    || typeof row.record_id !== 'string' || !row.record_id || !/^Demo district [1-3] \(fictional\)$/.test(row.district)
    || !/^Demo crew [1-4] \(fictional\)$/.test(row.crew)) {
    throw new Error('Exercise record does not match the 311 exercise contract');
  }
  const created = timestamp(row.opened_at, 'creation time');
  const due = timestamp(row.due_at, 'due time');
  const closed = row.closed_at == null ? null : timestamp(row.closed_at, 'closure time');
  if (due < created || (closed !== null && closed < created)
    || (row.status === 'exercise_closed') !== (closed !== null)) throw new Error('Exercise record has an inconsistent timeline');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.scenario_date ?? '')) throw new Error('Exercise record is missing its scenario date');
  const asOf = timestamp(`${row.scenario_date}T23:59:59.999Z`, 'scenario date');
  if (created > asOf || (closed !== null && closed > asOf)) throw new Error('Exercise record extends beyond its scenario date');
  return { ...contractFields(row),
    opened_at: new Date(created).toISOString(), due_at: new Date(due).toISOString(),
    closed_at: closed === null ? null : new Date(closed).toISOString(), created, due, closed, asOf };
}

export function selectRecords(records, filters) {
  const needle = filters.search.trim().toLowerCase();
  return records.filter(({ properties: row }) => (!filters.status || row.status === filters.status)
    && (!filters.category || row.category === filters.category) && (!filters.district || row.district === filters.district)
    && (!needle || `${row.record_id} ${row.crew}`.toLowerCase().includes(needle)));
}

export function summarize(records) {
  const rows = records.map((feature) => feature.properties);
  const unresolved = rows.filter((row) => row.closed === null);
  const closed = rows.filter((row) => row.closed !== null);
  const durations = closed.map((row) => (row.closed - row.created) / DAY_MS).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const median = durations.length ? (durations[middle] + durations[Math.ceil(durations.length / 2) - 1]) / 2 : null;
  return { total: rows.length, unresolved: unresolved.length, closed: closed.length,
    overdue: unresolved.filter((row) => row.due < row.asOf).length,
    createdOnScenarioDate: rows.filter((row) => row.created >= row.asOf - DAY_MS + 1).length,
    medianDays: median, withinSla: closed.length ? closed.filter((row) => row.closed <= row.due).length / closed.length : null };
}

export function weeklyTrend(records, asOf) {
  const end = Date.parse(new Date(asOf).toISOString().slice(0, 10)) + DAY_MS;
  return Array.from({ length: 12 }, (_, index) => {
    const start = end - (12 - index) * 7 * DAY_MS;
    const stop = start + 7 * DAY_MS;
    const within = (value) => value !== null && value >= start && value < stop;
    return { date: new Date(start).toISOString().slice(0, 10),
      opened: records.filter(({ properties: row }) => within(row.created)).length,
      closed: records.filter(({ properties: row }) => within(row.closed)).length };
  });
}

export function exportGeojson(records) {
  return { type: 'FeatureCollection', name: 'DEMO DATA — fictional 311 exercise requests',
    features: records.map(({ properties, geometry }) => ({ type: 'Feature', geometry,
      properties: contractFields(properties) })) };
}

function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportCsv(records) {
  return [CSV_FIELDS.join(','), ...records.map(({ properties }) => CSV_FIELDS.map((key) => csvCell(properties[key])).join(','))].join('\r\n');
}
import { assertExerciseProvenance } from '../../../scripts/state-local/exercise-provenance.mjs';

