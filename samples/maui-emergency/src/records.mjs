import { assertExerciseProvenance } from '../../../shared/state-local/exercise-provenance.mjs';
import { exerciseTimeline } from '../../../shared/state-local/exercise-time.mjs';

export const STAGES = { exercise_open: 'Open (exercise)', exercise_in_progress: 'In progress (exercise)', exercise_closed: 'Closed (exercise)' };
const ANCHORS = { exercise_shelter: 'maui-public-schools', exercise_closure: 'maui-roads' };

export function emergencyRecord(row, kind) {
  assertExerciseProvenance(row);
  const anchor = row.anchor_feature_id;
  if (row.record_type !== kind || !Object.hasOwn(ANCHORS, kind) || !Object.hasOwn(STAGES, row.status)
    || typeof row.record_id !== 'string' || !row.record_id.trim()
    || !['string', 'number'].includes(typeof anchor) || !String(anchor).trim()
    || (typeof anchor === 'number' && !Number.isSafeInteger(anchor))
    || row.anchor_source !== ANCHORS[kind] || row.asset_id !== `${ANCHORS[kind]}:${anchor}`) {
    throw new Error('Record does not match the emergency exercise contract');
  }
  if (kind === 'exercise_shelter' && (!Number.isSafeInteger(row.capacity) || row.capacity <= 0
    || !Number.isSafeInteger(row.occupancy) || row.occupancy < 0 || row.occupancy > row.capacity)) {
    throw new Error('Exercise shelter needs valid fictional capacity and occupancy');
  }
  return { ...row, ...exerciseTimeline(row) };
}

export function filterRecords(records, filters) {
  const needle = filters.search.trim().toLowerCase();
  return records.filter(({ properties: row }) => (!filters.kind || row.record_type === filters.kind)
    && (!filters.status || row.status === filters.status)
    && (!needle || `${row.record_id} ${row.asset_id}`.toLowerCase().includes(needle)));
}

export function exerciseSummary(records) {
  const shelters = records.filter(({ properties: row }) => row.record_type === 'exercise_shelter');
  const available = shelters.filter(({ properties: row }) => row.status !== 'exercise_closed');
  return { shelters: shelters.length, openShelters: available.length,
    capacity: available.reduce((sum, { properties: row }) => sum + row.capacity, 0),
    occupancy: available.reduce((sum, { properties: row }) => sum + row.occupancy, 0),
    unclosedClosures: records.filter(({ properties: row }) => row.record_type === 'exercise_closure' && row.status !== 'exercise_closed').length };
}
