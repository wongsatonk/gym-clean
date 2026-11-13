import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

export const curl: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Dumbbell_Bicep_Curl',
  folder: 'curl',
  view: 'side',
  limb: 'arm',
  triplets: ELBOW,
  extended: 150,
  contracted: 70,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toExtended',
  sideMode: 'best',
  hints: { far: 'Curl higher.', start: 'Straighten your arm at the bottom.' },
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
