import { learningFocus } from './learning';
import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

/**
 * Concentration curls (SPEC M4f wave 1, learning). Seated, elbow braced on the inner thigh, phone
 * about 3/4 from the working arm's side; the camera counts the arm nearest the phone and reps are
 * per arm (M4f-q2). Extended 145, not 150: the braced arm rarely locks out.
 *
 * Contracted 85 (was 70; PROGRESS Decision "M4f wave-1 retune from synthetic"): the 3/4 view reads
 * the curled end shallow (rendered 15° → 61–72° smoothed) and a fast rep bottomed at 72. Partials
 * turn at 115–120°. The clips count exactly for contracted 74–100 at extended 143–147; a lower
 * extended fails because a pose glitch at the top hides most of the lowering's timing.
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
  contracted: 85,
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
