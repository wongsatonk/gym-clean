// Which exercises have an M4b/M4d 3D demo: ids only, so the badges and the How-to sheet can ask
// hasDemo() from the main chunk without pulling in the pose math (moves.ts, poses.ts), which loads
// with the 3D chunk. Kept in sync with the DEMOS registry in moves.ts by a test (same ids, same
// order).

/** Exercise ids that have an animated demo, in registry order. */
export const DEMO_IDS: readonly string[] = [
  // Push A
  'Pushups',
  'Seated_Dumbbell_Press',
  'Side_Lateral_Raise',
  // Pull A / Legs A, pose-tracked
  'Dumbbell_Bicep_Curl',
  'One-Arm_Dumbbell_Row',
  'Goblet_Squat',
  // Push A, manual
  'Dumbbell_Bench_Press',
  'Incline_Dumbbell_Press',
  'Standing_Dumbbell_Triceps_Extension',
  // Pull A, manual
  'Hammer_Curls',
  'Reverse_Flyes',
  'Wide-Grip_Lat_Pulldown',
  // Legs A, manual
  'Stiff-Legged_Dumbbell_Deadlift',
  'Dumbbell_Lunges',
  'Lying_Leg_Curls',
  'Standing_Calf_Raises',
  // Push B, manual
  'Dumbbell_Flyes',
  'Dumbbell_Shoulder_Press',
  'Cable_Crossover',
  'Triceps_Pushdown',
  'Bench_Dips',
  // Pull B, manual
  'Bent_Over_Two-Dumbbell_Row',
  'Seated_Cable_Rows',
  'Face_Pull',
  'Incline_Dumbbell_Curl',
  'Concentration_Curls',
  // Legs B, manual
  'Leg_Press',
  'Dumbbell_Step_Ups',
  'Leg_Extensions',
  'Dumbbell_Seated_One-Leg_Calf_Raise',
];

const IDS = new Set(DEMO_IDS);

/** Drives the "3D demo" / "Info" badges and whether the How-to sheet loads the 3D player. */
export function hasDemo(exerciseId: string): boolean {
  return IDS.has(exerciseId);
}
