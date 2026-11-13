import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

export const row: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'One-Arm_Dumbbell_Row',
  folder: 'row',
  view: 'side',
  limb: 'arm',
  triplets: ELBOW,
  extended: 145,
  contracted: 90,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toExtended',
  sideMode: 'best',
  hints: { far: 'Pull your elbow higher.', start: 'Let the arm hang straight.' },
  placement: {
    view: 'side',
    facing: 'Side-on, rowing arm toward the phone',
    distanceM: [2, 3],
    heightHint: 'Bench height',
    lines: [
      'Phone at bench height, side-on',
      'Rowing arm faces the phone',
      'Shoulder to hand in frame, 2–3 m',
    ],
    spoken: 'Put the phone at bench height, 2 to 3 metres away, with your rowing arm facing it.',
  },
};
