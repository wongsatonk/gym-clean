import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { SHOULDER } from './triplets';

/** Inverted: arms down = small hip–shoulder–elbow angle (extended), raised = large (contracted). */
export const lateralRaise: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Side_Lateral_Raise',
  folder: 'lateral-raise',
  view: 'front',
  limb: 'arm',
  triplets: SHOULDER,
  extended: 25,
  contracted: 75,
  direction: 'increasing',
  start: 'extended',
  eccentric: 'toExtended',
  sideMode: 'both',
};
