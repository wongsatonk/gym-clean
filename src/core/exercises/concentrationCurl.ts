import { learningFocus } from './learning';
import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

/**
 * Concentration curls (SPEC M4f wave 1, learning). Seated, elbow braced on the inner thigh, phone
 * about 3/4 from the working arm's side; the camera counts the arm nearest the phone and reps are
 * per arm (M4f-q2). Extended 145, not 150: the braced arm rarely locks out.
 */
export const concentrationCurl: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Concentration_Curls',
  folder: 'concentration-curl',
  status: 'learning',
  view: 'side',
  limb: 'arm',
  triplets: ELBOW,
  extended: 145,
  contracted: 70,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toExtended',
  sideMode: 'best',
  focus: learningFocus(),
  hints: { far: 'Curl up to your shoulder.', start: 'Lower until your arm is straight.' },
  placement: {
    view: 'side',
    facing: 'Turned a little toward the phone, working arm nearest',
    distanceM: [2, 3],
    heightHint: 'Seat height',
    lines: [
      'Phone at seat height, 2–3 m',
      'Working arm nearest the phone',
      'Turn a little toward the phone',
    ],
    spoken: 'Sit 2 to 3 metres from the phone, turned a little toward it, working arm nearest.',
  },
};
