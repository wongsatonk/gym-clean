import { LANDMARK as L } from '../poseTopology';
import { learningFocus } from './learning';
import { COUNTER_DEFAULTS, type ExerciseRule } from './types';
import { ELBOW } from './triplets';

/**
 * Standing dumbbell triceps extension (SPEC M4f wave 1, learning). One dumbbell overhead in both
 * hands (M4f-q9): starts extended overhead, lowers behind the head (toward contracted). The press's
 * wrist-above-shoulder gate on the extended end, so lifting the dumbbell up from hanging arms
 * isn't a rep.
 *
 * Retuned from the synthetic clips (PROGRESS Decision "M4f wave-1 retune from synthetic"), filmed
 * ~40° round from the side toward the front because square side-on the upper arm hides the face:
 * - World angles read the bent end shallow (rendered 15° → 69–83° smoothed) and straight arms at
 *   150–160°, so contracted 95 (was 80) and extended 138 (was 150). Partials turn at 100–108°.
 *   The clips count exactly for extended 136–140 × contracted 90–106; 138 / 95 is the middle.
 * - Visibility 0.4 (§3 default 0.5): with the wrist behind the head the arm reads 0.41–0.49 at
 *   every bottom, so 0.5 hid each turnaround and fast reps failed the minimum leg time.
 */
export const tricepsExtension: ExerciseRule = {
  ...COUNTER_DEFAULTS,
  exerciseId: 'Standing_Dumbbell_Triceps_Extension',
  folder: 'triceps-extension',
  status: 'learning',
  view: 'side',
  limb: 'arm',
  triplets: ELBOW,
  extended: 138,
  contracted: 95,
  minVisibility: 0.4,
  direction: 'decreasing',
  start: 'extended',
  eccentric: 'toContracted',
  sideMode: 'best',
  extendedGate: {
    upper: { left: L.LEFT_WRIST, right: L.RIGHT_WRIST },
    lower: { left: L.LEFT_SHOULDER, right: L.RIGHT_SHOULDER },
  },
  focus: learningFocus(),
  hints: { far: 'Lower it further behind your head.', start: 'Straighten your arms overhead.' },
  countsLine: 'Counts each extension from your elbow angle.',
  placement: {
    view: 'side',
    facing: 'Side-on, arms overhead',
    distanceM: [2, 3],
    heightHint: 'Chest height',
    lines: [
      'Phone at chest height, side-on',
      'Arms overhead, room above the hands',
      'Head to hips in frame, 2–3 m',
    ],
    spoken: 'Stand side-on, 2 to 3 metres from the phone, with room above your hands.',
  },
};
