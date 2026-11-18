import { learningFocus } from './learning';
import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

/**
 * Bent-over two-dumbbell row (SPEC M4f wave 1, learning). Hinged, both arms row together; the
 * side view counts the near arm (M4f-q1). Starting values from the tuned one-arm row. If standing
 * up between sets makes phantom reps on real data, a posture gate is the fallback (SPEC).
 */
export const bentOverRow: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Bent_Over_Two-Dumbbell_Row',
  folder: 'bent-over-row',
  status: 'learning',
  view: 'side',
  limb: 'arm',
  triplets: ELBOW,
  extended: 145,
  contracted: 90,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toExtended',
  sideMode: 'best',
  focus: learningFocus(),
  hints: { far: 'Pull your elbows higher.', start: 'Let the arms hang straight.' },
  placement: {
    view: 'side',
    facing: 'Side-on, hinged with your side to the phone',
    distanceM: [2, 3],
    heightHint: 'Hip height',
    lines: [
      'Phone at hip height, side-on',
      'Hinge with your side to the phone',
      'Shoulders to hands in frame, 2–3 m',
    ],
    spoken: 'Stand side-on, 2 to 3 metres from the phone, with your hinged back and arms in view.',
  },
};
