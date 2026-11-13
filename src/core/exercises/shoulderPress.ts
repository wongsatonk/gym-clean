import { LANDMARK as L } from '../poseTopology';
import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

/** Seated DB press: starts with dumbbells at the shoulders (contracted), presses up. */
export const shoulderPress: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Seated_Dumbbell_Press',
  folder: 'shoulder-press',
  view: 'front',
  limb: 'arm',
  triplets: ELBOW,
  extended: 155,
  contracted: 100,
  direction: 'decreasing',
  start: 'contracted',
  eccentric: 'toContracted',
  sideMode: 'both',
  extendedGate: {
    upper: { left: L.LEFT_WRIST, right: L.RIGHT_WRIST },
    lower: { left: L.LEFT_SHOULDER, right: L.RIGHT_SHOULDER },
  },
};
