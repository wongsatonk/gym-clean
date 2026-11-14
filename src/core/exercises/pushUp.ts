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
  // Head-on also needs a straight body line: plank 159–178° vs sitting / getting up 37–121°.
  otherView: {
    view: 'front',
    sideMode: 'both',
    extended: 150,
    contracted: 125,
    minHipAngleDeg: 140,
    // Head-on ranges vary 39–78° rep to rep; hips sag is never judged from the front.
    focus: { shrinkingRange: false },
  },
  viewYawDeg: { frontBelow: 40, sideAbove: 50 },
  // Hips sag: off until real side-view push-up fixtures pass (M5 Decision).
  focus: {
    rushedLowering: true,
    shrinkingRange: true,
    stalled: true,
    outOfFrame: true,
    lowFps: true,
    hipSag: false,
  },
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
