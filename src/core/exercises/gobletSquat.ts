import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { KNEE } from './triplets';

export const gobletSquat: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Goblet_Squat',
  folder: 'goblet-squat',
  view: 'side',
  limb: 'leg',
  triplets: KNEE,
  extended: 160,
  contracted: 100,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toContracted',
  sideMode: 'best',
};
