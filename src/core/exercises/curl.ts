import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

export const curl: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Dumbbell_Bicep_Curl',
  folder: 'curl',
  view: 'side',
  limb: 'arm',
  triplets: ELBOW,
  extended: 150,
  contracted: 70,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toExtended',
  sideMode: 'best',
};
