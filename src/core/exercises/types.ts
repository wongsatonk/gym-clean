// Per-exercise rep-counting rules as data (SPEC §2 M4 table, §3). A rep counter is generic over
// ExerciseRule: it never branches on the exercise id.
import type { Side, SidePair, Triplet } from '../angles';

export type { Side, SidePair, Triplet };

/** Why a partial missed (RepEvent.reason): the far end or the return to the start. */
export type MissReason = 'far' | 'start';

/** Short coaching hint per partial reason (≤ 6 words, shown and spoken; never medical). */
export type CoachHints = Record<MissReason, string>;

/** Where to put the phone so the camera sees the joints this rule measures (M4c). */
export type PhonePlacement = {
  /** Same as the rule's view. */
  view: 'side' | 'front';
  /** How the body faces the phone, e.g. "Side-on" / "Facing the phone". */
  facing: string;
  /** Phone-to-body distance range in metres. */
  distanceM: readonly [min: number, max: number];
  /** Phone height, e.g. "Floor" / "Chest height". */
  heightHint: string;
  /** 1–3 short lines (≤ 8 words each) shown on the camera page. */
  lines: readonly string[];
  /** One sentence spoken when the camera opens. */
  spoken: string;
};

/**
 * Thresholds for the camera view the rule was not written for. The counter switches to them
 * when it sees that view while settling (world shoulder line: across the image = front,
 * pointing at the camera = side). Hints and placement stay the rule's own.
 */
export type ViewVariant = Pick<ExerciseRule, 'view' | 'sideMode' | 'extended' | 'contracted'>;

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
  /**
   * Where the joint angle is measured (default `world`: 3D world landmarks when the frame has
   * them, else 2D). `image`: always the 2D image plane, with normalized x scaled by the video
   * aspect estimated from the pose (core/aspect.ts). For front-view movements in the camera's
   * plane, where the world model's depth guess compresses the angle (seated press, 2026-11-13
   * Push A log: world tops 124–137° vs image 147–161° on the same reps).
   */
  angleSpace?: 'world' | 'image';
  /**
   * Optional posture gate (deg): once the counter has settled, frames where the torso
   * (hip midpoint → shoulder midpoint, world 3D) has turned more than this from its direction at
   * the settle are not tracked, like a visibility miss. Measured relative to the settle, so phone
   * pitch doesn't matter. Lateral raise: bending over to pick up or put down the dumbbells opens
   * the shoulder angle like a raise (Push A log: phantom rep at the start of 3 of 4 sets).
   */
  maxTorsoLeanDeg?: number;
  /**
   * Optional thresholds for the other camera view (see ViewVariant). Push-up: filmed head-on,
   * the world elbow angle bottoms out at 93–118° instead of < 95° (Push A log, 2026-11-13).
   */
  otherView?: ViewVariant;
  /**
   * View cut-offs for otherView (mean world shoulder-line yaw while settling, deg): front below
   * `frontBelow`, side above `sideAbove`, in between keep the current view. Default 40 / 50.
   * The Push A log read 0–10° head-on; the synthetic side clips 49–89°.
   */
  viewYawDeg?: { frontBelow: number; sideAbove: number };
  /** EMA smoothing factor for the angle (SPEC §3: 0.4). */
  emaAlpha: number;
  /** Hysteresis (deg): leave a band only once past its threshold by this much (SPEC §3: 10). */
  hysteresisDeg: number;
  /**
   * Minimum movement time per phase (SPEC §3: 250 ms). Legs are timed on visible frames only
   * (hidden time is not movement): each moving leg must take at least half of this and the
   * out-and-back pair at least 2 × this (dwell at the far end excluded). The initial settle at
   * the start position needs at least this.
   */
  minPhaseMs: number;
  /** Frames where any used landmark is below this visibility are ignored (SPEC §3: 0.5). */
  minVisibility: number;
  /**
   * A turnaround counts as a partial only if the smoothed angle got at least this far (deg)
   * past the start threshold, toward the far end, without reaching the far threshold. The same
   * depth applies to a `start` partial: the return must get at least this far back from the far
   * threshold before it turns toward the far end again.
   */
  minPartialDepthDeg: number;
  /** Coaching hint per partial reason (M4c). */
  hints: CoachHints;
  /** Phone placement guidance for this exercise's view (M4c). */
  placement: PhonePlacement;
};

/** SPEC §3 counter defaults shared by every rule; a rule may override any of them. */
export const COUNTER_DEFAULTS = {
  emaAlpha: 0.4,
  hysteresisDeg: 10,
  minPhaseMs: 250,
  minVisibility: 0.5,
  minPartialDepthDeg: 15,
} as const satisfies Partial<ExerciseRule>;
