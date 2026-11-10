export function assertExerciseProvenance(row) {
  if (row?.data_origin !== 'synthetic_demo' || ![true, 1].includes(row.is_demo)
    || ![true, 1].includes(row.exercise_only) || !row.display_label?.includes('DEMO DATA')) {
    throw new Error('Exercise record is missing its DEMO DATA provenance');
  }
}
