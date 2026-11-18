import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

export const row: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'One-Arm_Dumbbell_Row',
  folder: 'row',
  status: 'tuned',
  view: 'side',
  limb: 'arm',
  triplets: ELBOW,
  extended: 145,
  contracted: 90,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toExtended',
  sideMode: 'best',
  // M13b task 8 (his 2026-11-17 row set): count only while bent over. Standing, walking or picking
  // up the dumbbell in front of the phone counted reps. Bent over the bench reads 90–115° at the
  // hip (real clip 01), standing 152–171°; 130 also keeps clip 04's crouch silent.
  maxHipAngleDeg: 130,
  // A 300–500 ms wrist visibility dip while bent over no longer flashes "Step into frame".
  // minVisibility stays 0.5: 0.3 (task 2) counted a set-up wiggle on real clip 03.
  trackingHoldMs: 500,
  // Body swing: off until real row fixtures pass (M5 Decision).
  focus: {
    rushedLowering: true,
    shrinkingRange: true,
    stalled: true,
    outOfFrame: true,
    lowFps: true,
    bodySwing: false,
  },
  hints: { far: 'Pull your elbow higher.', start: 'Let the arm hang straight.' },
  // M13b task 9: at bench height the pose was found on 97% of frames, on the floor 52–66% (task
  // 2), and the hinge gate needs the hips and knees in view. Either arm (the session says which).
  placement: {
    view: 'side',
    facing: 'Side-on, working arm toward the phone',
    distanceM: [2, 3],
    heightHint: 'Bench height',
    lines: [
      'Phone at bench height, side-on',
      'Working arm faces the phone',
      'Not on the floor: whole body in view',
    ],
    spoken:
      'Put the phone at bench height, not on the floor, 2 to 3 metres away, whole body in view.',
  },
};
