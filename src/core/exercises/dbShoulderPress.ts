import { LANDMARK as L } from '../poseTopology';
import { learningFocus } from './learning';
import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

/**
 * Dumbbell shoulder press (SPEC M4f wave 1, learning). The seated-press convention: dumbbells
 * start at the shoulders (contracted) and the first press counts (Decision 2026-11-13, answer 2).
 * Image-plane angles and the wrist-above-shoulder gate, as the tuned seated press.
 */
export const dbShoulderPress: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Dumbbell_Shoulder_Press',
  folder: 'db-shoulder-press',
  status: 'learning',
  view: 'front',
  limb: 'arm',
  triplets: ELBOW,
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
  focus: learningFocus(),
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
