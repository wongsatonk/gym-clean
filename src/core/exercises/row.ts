import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

export const row: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'One-Arm_Dumbbell_Row',
  folder: 'row',
  view: 'side',
  limb: 'arm',
  triplets: ELBOW,
  extended: 145,
  contracted: 90,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toExtended',
  sideMode: 'best',
};
