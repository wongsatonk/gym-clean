import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

export const pushUp: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Pushups',
  folder: 'push-up',
  view: 'side',
  limb: 'arm',
  triplets: ELBOW,
  extended: 150,
  contracted: 95,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toContracted',
  sideMode: 'best',
  // Head-on (phone in front, on the floor): both elbows are visible, and the world elbow angle
  // bottoms out at 93–118° smoothed on 11 clean push-ups (Push A log). Tops stay 157–171°.
  otherView: { view: 'front', sideMode: 'both', extended: 150, contracted: 125 },
  hints: { far: 'Go lower.', start: 'Push all the way up.' },
  placement: {
    view: 'side',
    facing: 'Side-on',
    distanceM: [2.5, 3],
    heightHint: 'Floor',
    lines: [
      'Phone on the floor, side-on',
      'One side faces the phone',
      'Whole body in frame, 2.5–3 m',
    ],
    spoken: 'Put the phone on the floor beside you, 2.5 to 3 metres away, whole body in view.',
  },
};
