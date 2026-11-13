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
