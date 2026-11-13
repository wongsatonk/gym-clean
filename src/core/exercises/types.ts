// Per-exercise rep-counting rules as data (SPEC §2 M4 table, §3). A rep counter is generic over
// ExerciseRule: it never branches on the exercise id.
import type { Side, SidePair, Triplet } from '../angles';

export type { Side, SidePair, Triplet };

export type ExerciseRule = {
  /** Id in exercises.json / program.json. */
  exerciseId: string;
  /** Folder under fixtures/landmarks/ and fixtures/synthetic/. */
  folder: string;
  /** Camera view the user is asked to film from. */
  view: 'side' | 'front';
  /** For UI labels ("Right arm" / "Left leg"). */
  limb: 'arm' | 'leg';
  /** Joint angle landmarks per side; the angle is measured at the middle landmark. */
  triplets: SidePair<Triplet>;
  /** Threshold (deg) of the "extended" end. Reached = past it in the extended direction. */
  extended: number;
  /** Threshold (deg) of the "contracted" end. Reached = past it in the contracted direction. */
  contracted: number;
  /**
   * How the angle moves going from extended to contracted. `decreasing` (elbow/knee flexion):
   * extended means angle > extended, contracted means angle < contracted. `increasing`
   * (lateral raise): extended means angle < extended, contracted means angle > contracted.
   */
  direction: 'decreasing' | 'increasing';
  /** Where every rep starts and ends (the TOP state). The far end is the other one. */
  start: 'extended' | 'contracted';
  /** Which movement is the lowering (eccentric) phase. */
  eccentric: 'toExtended' | 'toContracted';
  /**
   * `best`: track the side with higher mean visibility (side views; far side is occluded).
   * `both`: track both sides when both pass the visibility gate, else fall back to the
   * visible one (front views).
   */
  sideMode: 'best' | 'both';
  /**
   * Optional: the extended band only counts while landmark `upper` is above `lower` in the
   * image (smaller normalized y). Press: wrist above shoulder, so hanging arms aren't "extended".
   */
  extendedGate?: { upper: SidePair<number>; lower: SidePair<number> };
  /** EMA smoothing factor for the angle (SPEC §3: 0.4). */
  emaAlpha: number;
  /** Hysteresis (deg): leave a band only once past its threshold by this much (SPEC §3: 10). */
  hysteresisDeg: number;
  /** Minimum time in each phase (SPEC §3: 250 ms). */
  minPhaseMs: number;
  /** Frames where any used landmark is below this visibility are ignored (SPEC §3: 0.5). */
  minVisibility: number;
  /**
   * A turnaround counts as a partial only if the smoothed angle got at least this far (deg)
   * past the start threshold, toward the far end, without reaching the far threshold.
   */
  minPartialDepthDeg: number;
};

/** SPEC §3 counter defaults shared by every rule; a rule may override any of them. */
export const COUNTER_DEFAULTS = {
  emaAlpha: 0.4,
  hysteresisDeg: 10,
  minPhaseMs: 250,
  minVisibility: 0.5,
  minPartialDepthDeg: 20,
} as const satisfies Partial<ExerciseRule>;
