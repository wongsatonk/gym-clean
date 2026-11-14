import { LANDMARK as L } from '../poseTopology';
import { learningFocus } from './learning';
import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

/**
 * Standing dumbbell triceps extension (SPEC M4f wave 1, learning). One dumbbell overhead in both
 * hands (M4f-q9): starts extended overhead, lowers behind the head (toward contracted). The press's
 * wrist-above-shoulder gate on the extended end, so lifting the dumbbell up from hanging arms
 * isn't a rep.
 */
export const tricepsExtension: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Standing_Dumbbell_Triceps_Extension',
  folder: 'triceps-extension',
  status: 'learning',
  view: 'side',
  limb: 'arm',
  triplets: ELBOW,
  extended: 150,
  contracted: 80,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toContracted',
  sideMode: 'best',
  extendedGate: {
    upper: { left: L.LEFT_WRIST, right: L.RIGHT_WRIST },
    lower: { left: L.LEFT_SHOULDER, right: L.RIGHT_SHOULDER },
  },
  focus: learningFocus(),
  hints: { far: 'Lower it further behind your head.', start: 'Straighten your arms overhead.' },
  placement: {
    view: 'side',
    facing: 'Side-on, arms overhead',
    distanceM: [2, 3],
    heightHint: 'Chest height',
    lines: [
      'Phone at chest height, side-on',
      'Arms overhead, room above the hands',
      'Head to hips in frame, 2–3 m',
    ],
    spoken: 'Stand side-on, 2 to 3 metres from the phone, with room above your hands.',
  },
};
