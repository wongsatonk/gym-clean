// Angle-based rep counter (SPEC §3). Pure: frames in, RepEvents out; time comes from frame.t.
// Generic over ExerciseRule — never branches on the exercise id.
//
// Angles are mapped to an "oriented" scale o where extended is always the high end:
//   o = angle (direction 'decreasing') or -angle ('increasing').
// Bands: extended = o > E (and the rule's extended gate holds), contracted = o < C, with E > C.
// A band is left only once past its threshold by the hysteresis (o < E - h / o > C + h).
// TOP is the rule's start band, BOTTOM the far band (named after SPEC's state names).
import { frameAngle, pickSide, tripletVisibility, type Side } from './angles';
import { extendedGatePasses, type ExerciseRule } from './exercises';
import type { LandmarkFrame, RepEvent } from './types';

/**
 * `setup`: not yet settled at the start position (nothing counts). `top`: at the start band.
 * `down`: left the start band, heading to the far end. `bottom`: at the far band. `up`: heading
 * back to the start. "Down"/"up" follow SPEC §3 naming, not the physical direction.
 */
export type RepPhase = 'setup' | 'top' | 'down' | 'bottom' | 'up';

/** Which limb the angle comes from: one side, or the average of both (front views). */
export type TrackedSide = Side | 'both';

export type RepCounter = {
  /** Feed one frame (in time order). Returns the events it completed (usually none). */
  push(frame: LandmarkFrame): RepEvent[];
  readonly reps: number;
  readonly partials: number;
  readonly phase: RepPhase;
  /** Side used for the last tracked frame; null before any. */
  readonly side: TrackedSide | null;
  /** False when the last frame failed the visibility gate ("Step into frame"). */
  readonly tracking: boolean;
  /** Smoothed joint angle in degrees; null before the first tracked frame. */
  readonly angle: number | null;
  /** Back to the initial state (counts 0, phase setup, side unlocked). */
  reset(): void;
};

/** Frames used to choose the better-visible side while in setup ('best' side mode). */
const SIDE_WINDOW = 15;
/** After a gap longer than this (no tracked frames), the EMA restarts from the raw angle. */
const RESEED_GAP_MS = 500;

type Reading = { angle: number; side: TrackedSide; gate: boolean };

export function createRepCounter(rule: ExerciseRule): RepCounter {
  const sign = rule.direction === 'decreasing' ? 1 : -1;
  const E = sign * rule.extended;
  const C = sign * rule.contracted;
  const h = rule.hysteresisDeg;
  const startExtended = rule.start === 'extended';
  // Progress toward the far end: +1 means growing o goes toward far (start contracted).
  const farSign = startExtended ? -1 : 1;
  const startThresholdProgress = farSign * (startExtended ? E : C);
  // The out leg (start → far) moves toward `far`; is that the lowering?
  const far = startExtended ? 'contracted' : 'extended';
  const eccentricIsOut = (rule.eccentric === 'toExtended' ? 'extended' : 'contracted') === far;

  const inExtended = (o: number, gate: boolean) => o > E && gate;
  const inContracted = (o: number) => o < C;
  const leftExtended = (o: number) => o < E - h;
  const leftContracted = (o: number) => o > C + h;
  const inStart = (o: number, gate: boolean) =>
    startExtended ? inExtended(o, gate) : inContracted(o);
  const leftStart = (o: number) => (startExtended ? leftExtended(o) : leftContracted(o));
  const inFar = (o: number, gate: boolean) =>
    startExtended ? inContracted(o) : inExtended(o, gate);
  const leftFar = (o: number) => (startExtended ? leftContracted(o) : leftExtended(o));

  let reps = 0;
  let partials = 0;
  let phase: RepPhase = 'setup';
  let side: TrackedSide | null = null;
  let lockedSide: Side | null = null;
  let window: LandmarkFrame[] = [];
  let tracking = false;
  let ema: number | null = null;
  let lastTrackedT = -Infinity;
  /** Time of the last frame pushed (tracked or not), to detect a stream restart. */
  let lastFrameT = -Infinity;
  let settleSince: number | null = null;
  // Rep bookkeeping (times in ms, angles smoothed degrees).
  let lastInStartT = 0;
  /** Most start-ward smoothed angle of the current stay in the start band (range of motion). */
  let startExtremeAngle = 0;
  let departStartT = 0;
  let arriveFarT = 0;
  let lastInFarT = 0;
  let departFarT = 0;
  let extremeProgress = -Infinity;
  let extremeT = 0;
  let minAngle = Infinity;
  let maxAngle = -Infinity;
  /** Reached the far angle while the extended gate failed (press: arms hanging), so no partial. */
  let offPath = false;

  /** Forget the limb's position (back to setup, side unlocked) but keep the counts. */
  function restartTracking(): void {
    phase = 'setup';
    side = null;
    lockedSide = null;
    window = [];
    tracking = false;
    ema = null;
    lastTrackedT = -Infinity;
    lastFrameT = -Infinity;
    settleSince = null;
  }

  function reset(): void {
    reps = 0;
    partials = 0;
    restartTracking();
  }

  function readSide(frame: LandmarkFrame, s: Side): number | null {
    // Written as !(v >= min) so a NaN visibility fails the gate.
    if (!(tripletVisibility(frame, rule.triplets[s]) >= rule.minVisibility)) return null;
    return frameAngle(frame, rule.triplets[s]);
  }

  /** Angle + side for this frame, or null when the visibility gate fails. */
  function read(frame: LandmarkFrame): Reading | null {
    if (rule.sideMode === 'both') {
      const l = readSide(frame, 'left');
      const r = readSide(frame, 'right');
      if (l !== null && r !== null) {
        const gate =
          extendedGatePasses(rule, frame, 'left') && extendedGatePasses(rule, frame, 'right');
        return { angle: (l + r) / 2, side: 'both', gate };
      }
      if (l !== null)
        return { angle: l, side: 'left', gate: extendedGatePasses(rule, frame, 'left') };
      if (r !== null)
        return { angle: r, side: 'right', gate: extendedGatePasses(rule, frame, 'right') };
      return null;
    }
    let s = lockedSide;
    if (s === null) {
      window.push(frame);
      if (window.length > SIDE_WINDOW) window.shift();
      s = pickSide(window, rule.triplets);
      // Switching sides in setup: the old smoothed angle and settle time belong to the other arm.
      if (side !== null && side !== s) {
        ema = null;
        settleSince = null;
      }
    }
    const a = readSide(frame, s);
    if (a === null) return null;
    return { angle: a, side: s, gate: extendedGatePasses(rule, frame, s) };
  }

  function enterStart(t: number, a: number): void {
    phase = 'top';
    lastInStartT = t;
    startExtremeAngle = a;
  }

  function track(a: number): void {
    if (a < minAngle) minAngle = a;
    if (a > maxAngle) maxAngle = a;
  }

  function emit(type: RepEvent['type'], outMs: number, backMs: number, t: number): RepEvent {
    const index = type === 'rep' ? ++reps : ++partials;
    return {
      type,
      index,
      eccentricMs: Math.round(eccentricIsOut ? outMs : backMs),
      concentricMs: Math.round(eccentricIsOut ? backMs : outMs),
      minAngle,
      maxAngle,
      t,
    };
  }

  function push(frame: LandmarkFrame): RepEvent[] {
    const t = frame.t;
    // Time went backwards (camera switch / stream restart re-zeroes t): start tracking afresh.
    if (t < lastFrameT) restartTracking();
    lastFrameT = t;
    const r = read(frame);
    if (r === null) {
      tracking = false;
      settleSince = null; // settling needs an unbroken run of tracked frames
      return [];
    }
    tracking = true;
    side = r.side;
    if (ema === null || t - lastTrackedT > RESEED_GAP_MS) {
      ema = r.angle;
      settleSince = null;
    } else ema += rule.emaAlpha * (r.angle - ema);
    lastTrackedT = t;
    const a = ema;
    const o = sign * a;
    const events: RepEvent[] = [];

    switch (phase) {
      case 'setup': {
        if (inStart(o, r.gate)) {
          settleSince ??= t;
          if (t - settleSince >= rule.minPhaseMs) {
            if (r.side !== 'both') lockedSide = r.side;
            enterStart(t, a);
          }
        } else if (leftStart(o)) {
          settleSince = null;
        }
        break;
      }
      case 'top': {
        if (inStart(o, r.gate)) {
          lastInStartT = t;
          if (farSign * sign * (a - startExtremeAngle) < 0) startExtremeAngle = a;
        } else if (leftStart(o)) {
          phase = 'down';
          departStartT = lastInStartT;
          minAngle = Math.min(startExtremeAngle, a);
          maxAngle = Math.max(startExtremeAngle, a);
          extremeProgress = farSign * o;
          extremeT = t;
          offPath = false;
        }
        break;
      }
      case 'down': {
        track(a);
        if (farSign * o > extremeProgress) {
          extremeProgress = farSign * o;
          extremeT = t;
        }
        if (inFar(o, r.gate)) {
          phase = 'bottom';
          arriveFarT = t;
          lastInFarT = t;
        } else if (inFar(o, true)) {
          offPath = true;
        } else if (inStart(o, r.gate)) {
          // Turned around before the far band: a partial if it went deep enough and wasn't rushed.
          const depth = extremeProgress - startThresholdProgress;
          const outMs = extremeT - departStartT;
          const backMs = t - extremeT;
          if (
            !offPath &&
            depth >= rule.minPartialDepthDeg &&
            outMs >= rule.minPhaseMs &&
            backMs >= rule.minPhaseMs
          )
            events.push(emit('partial', outMs, backMs, t));
          enterStart(t, a);
        }
        break;
      }
      case 'bottom': {
        track(a);
        if (inFar(o, r.gate)) lastInFarT = t;
        else if (leftFar(o)) {
          phase = 'up';
          departFarT = lastInFarT;
        }
        break;
      }
      case 'up': {
        track(a);
        if (inFar(o, r.gate)) {
          phase = 'bottom';
          lastInFarT = t;
        } else if (inStart(o, r.gate)) {
          const outMs = arriveFarT - departStartT;
          const backMs = t - departFarT;
          if (outMs >= rule.minPhaseMs && backMs >= rule.minPhaseMs)
            events.push(emit('rep', outMs, backMs, t));
          enterStart(t, a);
        }
        break;
      }
    }
    return events;
  }

  return {
    push,
    reset,
    get reps() {
      return reps;
    },
    get partials() {
      return partials;
    },
    get phase() {
      return phase;
    },
    get side() {
      return side;
    },
    get tracking() {
      return tracking;
    },
    get angle() {
      return ema;
    },
  };
}
