import { learningFocus } from './learning';
import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

/**
 * Incline dumbbell curl (SPEC M4f wave 1, learning). Reclined on the bench, both arms curl
 * together; the side view counts the near arm (M4f-q1). Starting values from the tuned curl.
 */
export const inclineCurl: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Incline_Dumbbell_Curl',
  folder: 'incline-curl',
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
  hints: { far: 'Curl higher.', start: 'Lower all the way down.' },
  placement: {
    view: 'side',
    facing: 'Side-on, curling arm toward the phone',
    distanceM: [2, 3],
    heightHint: 'Bench height',
    lines: [
      'Phone at bench height, side-on',
      'Curling arm faces the phone',
      'Shoulder to hand in frame, 2–3 m',
    ],
    spoken: 'Put the phone at bench height, 2 to 3 metres away, side-on, with your arm in view.',
  },
};
