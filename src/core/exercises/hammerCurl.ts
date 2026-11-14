import { learningFocus } from './learning';
import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

/**
 * Hammer curls (SPEC M4f wave 1, learning). Both arms curl together; the side view counts the
 * near arm (M4f-q1). Starting values from the tuned curl.
 */
export const hammerCurl: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Hammer_Curls',
  folder: 'hammer-curl',
  status: 'learning',
  view: 'side',
  limb: 'arm',
  triplets: ELBOW,
  extended: 150,
  contracted: 70,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toExtended',
  sideMode: 'best',
  focus: learningFocus(),
  hints: { far: 'Curl to shoulder height.', start: 'Straighten your arm at the bottom.' },
  placement: {
    view: 'side',
    facing: 'Side-on, curling arm toward the phone',
    distanceM: [2, 3],
    heightHint: 'Waist height',
    lines: [
      'Phone at waist height, side-on',
      'Curling arm faces the phone',
      'Shoulder to hand in frame, 2–3 m',
    ],
    spoken: 'Stand side-on, 2 to 3 metres from the phone, with your curling arm in view.',
  },
};
