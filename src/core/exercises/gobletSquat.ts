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
  // M5 focus rules only (SPEC M5 lists no form rule for the squat).
  focus: {
    rushedLowering: true,
    shrinkingRange: true,
    stalled: true,
    outOfFrame: true,
    lowFps: true,
  },
  hints: { far: 'Sit deeper.', start: 'Stand all the way up.' },
  placement: {
    view: 'side',
    facing: 'Side-on',
    distanceM: [2, 3],
    heightHint: 'Hip height',
    lines: [
      'Phone at hip height, side-on',
      'One side faces the phone',
      'Hips to feet in frame, 2–3 m',
    ],
    spoken: 'Stand side-on, 2 to 3 metres from the phone, with hips to feet in view.',
  },
};
