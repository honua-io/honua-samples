import { assertExerciseProvenance } from '../../../shared/state-local/exercise-provenance.mjs';
import { exerciseTimeline } from '../../../shared/state-local/exercise-time.mjs';

export const STAGES = { exercise_new: 'New', exercise_triaged: 'Triaged', exercise_scheduled: 'Scheduled',
  exercise_in_progress: 'In progress', exercise_closed: 'Closed' };
const INSPECTION_STAGES = ['exercise_open', 'exercise_in_progress', 'exercise_closed'];
const CONDITIONS = ['exercise_good', 'exercise_fair', 'exercise_poor'];

export function exerciseRecord(row) {
  assertExerciseProvenance(row);
  const validStatus = row.record_type === 'work_order' ? Object.hasOwn(STAGES, row.status)
    : row.record_type === 'inspection' && INSPECTION_STAGES.includes(row.status);
  if (!validStatus || typeof row.record_id !== 'string' || !row.record_id.trim()
    || !['string', 'number'].includes(typeof row.anchor_feature_id) || !String(row.anchor_feature_id).trim()
    || (typeof row.anchor_feature_id === 'number' && !Number.isSafeInteger(row.anchor_feature_id))
    || row.anchor_source !== 'maui-roads'
    || row.asset_id !== `maui-roads:${row.anchor_feature_id}` || !CONDITIONS.includes(row.condition)
    || !/^Demo crew [1-4] \(fictional\)$/.test(row.crew)) {
    throw new Error('Record does not match the public works exercise contract');
  }
  return { ...row, ...exerciseTimeline(row) };
}

export function bridgeRecord(row) {
  const rating = (value) => /^[0-9N]$/.test(String(value));
  if (String(row.county_code_003).padStart(3, '0') !== '009' || !row.structure_number_008
    || !['G', 'F', 'P'].includes(row.bridge_condition)
    || !['deck_cond_058', 'superstructure_cond_059', 'substructure_cond_060', 'culvert_cond_062'].every((key) => rating(row[key]))) {
    throw new Error('Bridge does not match the Maui NBI inventory contract');
  }
  return { ...row, record_id: String(row.structure_number_008), kind: 'bridge' };
}

export function associatedInspections(order, inspections) {
  return inspections.filter(({ properties }) => properties.asset_id === order.properties.asset_id);
}

export function filterFeatures(records, filters) {
  const needle = filters.search.trim().toLowerCase();
  return records.filter(({ properties: row }) => (!filters.status || row.status === filters.status)
    && (!filters.condition || row.condition === filters.condition || row.bridge_condition === filters.condition)
    && (!needle || [row.record_id, row.facility_carried_007, row.features_desc_006a, row.crew].join(' ').toLowerCase().includes(needle)));
}
