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
  // Image-plane angles (see angleSpace): real reps top out at 147–161° smoothed and sit at
  // 51–65° at the shoulders (Push A log, 2026-11-13); synthetic partials turn at 136–139°.
  angleSpace: 'image',
  extended: 143,
  contracted: 80,
  direction: 'decreasing',
  start: 'contracted',
  eccentric: 'toContracted',
  sideMode: 'both',
  extendedGate: {
    upper: { left: L.LEFT_WRIST, right: L.RIGHT_WRIST },
    lower: { left: L.LEFT_SHOULDER, right: L.RIGHT_SHOULDER },
  },
  hints: { far: 'Press all the way up.', start: 'Lower the weights to your shoulders.' },
  placement: {
    view: 'front',
    facing: 'Facing the phone',
    distanceM: [2, 3],
    heightHint: 'Chest height',
    lines: [
      'Phone in front of you, chest height',
      'Both arms and hips in frame',
      'Leave room above your hands',
    ],
    spoken: 'Face the phone at chest height, 2 to 3 metres away, with room above your hands.',
  },
};
