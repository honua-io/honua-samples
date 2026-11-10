export function assertExerciseProvenance(row) {
  if (row?.data_origin !== 'synthetic_demo' || ![true, 1].includes(row.is_demo)
    || ![true, 1].includes(row.exercise_only) || !row.display_label?.includes('DEMO DATA')) {
    throw new Error('Exercise record is missing its DEMO DATA provenance');
  }
}

export function assertExerciseAnchor(row, source) {
  assertExerciseProvenance(row);
  const anchor = row.anchor_feature_id;
  if (typeof row.record_id !== 'string' || !row.record_id.trim()
    || !['string', 'number'].includes(typeof anchor) || !String(anchor).trim()
    || (typeof anchor === 'number' && !Number.isSafeInteger(anchor))
    || row.anchor_source !== source || row.asset_id !== `${source}:${anchor}`) {
    throw new Error('Record does not match the exercise anchor contract');
  }
}
