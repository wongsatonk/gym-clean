import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { SHOULDER } from './triplets';

/** Inverted: arms down = small hip–shoulder–elbow angle (extended), raised = large (contracted). */
export const lateralRaise: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Side_Lateral_Raise',
  folder: 'lateral-raise',
  view: 'front',
  limb: 'arm',
  triplets: SHOULDER,
  extended: 25,
  contracted: 75,
  direction: 'increasing',
  start: 'extended',
  eccentric: 'toExtended',
  sideMode: 'both',
  // Push A log: bending to pick up / put down the dumbbells leaned 50–131° from the settle;
  // while raising, the torso stayed within 18° of it.
  maxTorsoLeanDeg: 35,
  // Arms out of sync / raise too high: on after task 7's replay of the 4 real clips (PROGRESS
  // Decision "M5 task 7 replay"): 0 fires over 80 real reps; largest held |L − R| 10.4° (line
  // 20°), real peaks ≤ 109.2° (line 120°), the one real one-arm swing reads > 20°.
  focus: {
    rushedLowering: true,
    shrinkingRange: true,
    stalled: true,
    outOfFrame: true,
    lowFps: true,
    armsOutOfSync: true,
    raiseTooHigh: true,
  },
  hints: { far: 'Raise to shoulder height.', start: 'Lower your arms fully.' },
  placement: {
    view: 'front',
    facing: 'Facing the phone',
    distanceM: [2, 3],
    heightHint: 'Chest height',
    lines: [
      'Phone in front of you, chest height',
      'Both arms and hips in frame',
      'Leave room beside your hands',
    ],
    spoken: 'Face the phone at chest height, 2 to 3 metres away, with room beside your hands.',
  },
};
