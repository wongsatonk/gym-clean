// Angle-based rep counter (SPEC §3). Pure: frames in, RepEvents out; time comes from frame.t.
// Generic over ExerciseRule — never branches on the exercise id.
//
// Angles are mapped to an "oriented" scale o where extended is always the high end:
//   o = angle (direction 'decreasing') or -angle ('increasing').
// Bands: extended = o > E (and the rule's extended gate holds), contracted = o < C, with E > C.
// A band is left only once past its threshold by the hysteresis (o < E - h / o > C + h).
// TOP is the rule's start band, BOTTOM the far band (named after SPEC's state names).
//
// Partials (M4c) carry a reason: `far` = turned around before the far band; `start` = came back
// from the far band but turned toward it again before re-entering the start band. Both need the
// turnaround at least minPartialDepthDeg past the threshold it left, and the minimum leg times.
// One attempt gives at most one partial: after a `start` partial, a return to the start band
// without reaching far finishes that attempt (no extra `far` partial).
//
// Real-data options (Push A log, 2026-11-13), all rule data: `angleSpace: 'image'` measures in
// the image plane with the video aspect estimated from the pose; `maxTorsoLeanDeg` drops frames
// (and the attempt in progress) once the torso leans away from its posture at the settle;
// `otherView` swaps in thresholds for the other camera view, judged while settling.
import {
  angleBetweenDeg,
  frameAngle,
  hipAngleDeg,
  pickSide,
  torsoDirection,
  shoulderYawDeg,
  tripletVisibility,
  type Side,
  type Vec3,
} from './angles';
import { createAspectEstimator } from './aspect';
import { extendedGatePasses, type ExerciseRule, type MissReason } from './exercises';
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
  /**
   * The rule this counter uses (thresholds for the gauge, hints, placement): the rule passed in,
   * or it merged with its `otherView` thresholds while the camera sees that view.
   */
  readonly rule: ExerciseRule;
  /** The current rep has reached the far band (phase bottom/up): the gauge target is met. */
  readonly reachedFar: boolean;
  /**
   * Which end the latest event missed: the reason of the last partial, or null once a rep is
   * counted (and before any event). Drives the amber gauge line.
   */
  readonly lastMiss: MissReason | null;
  /** The most recent partial event (kept across later reps); null before any. */
  readonly lastPartial: RepEvent | null;
  /** Back to the initial state (counts 0, phase setup, side unlocked, no last miss). */
  reset(): void;
};

/** Frames used to choose the better-visible side while in setup ('best' side mode). */
const SIDE_WINDOW = 15;
/** After a gap longer than this (no tracked frames), the EMA restarts from the raw angle. */
const RESEED_GAP_MS = 500;
/** View cut-offs (mean shoulder-line yaw, deg) when a rule with otherView doesn't set them. */
const DEFAULT_VIEW_YAW = { frontBelow: 40, sideAbove: 50 } as const;
/** After the posture gate has failed this long without a break, re-take the reference posture. */
const LEAN_RELOCK_MS = 3000;

type Reading = { angle: number; side: TrackedSide; gate: boolean };

export function createRepCounter(rule: ExerciseRule): RepCounter {
  const sign = rule.direction === 'decreasing' ? 1 : -1;
  const h = rule.hysteresisDeg;
  const startExtended = rule.start === 'extended';
  // Progress toward the far end: +1 means growing o goes toward far (start contracted).
  const farSign = startExtended ? -1 : 1;
  // The out leg (start → far) moves toward `far`; is that the lowering?
  const far = startExtended ? 'contracted' : 'extended';
  const eccentricIsOut = (rule.eccentric === 'toExtended' ? 'extended' : 'contracted') === far;
  /** The rule merged with its other-view thresholds (null if it has none). */
  const variant: ExerciseRule | null = rule.otherView ? { ...rule, ...rule.otherView } : null;

  // Thresholds of the active rule (the rule, or its other-view variant once that view is seen).
  let active = rule;
  let E = 0;
  let C = 0;
  let startThresholdProgress = 0;
  let farThresholdProgress = 0;
  function applyRule(r: ExerciseRule): void {
    active = r;
    E = sign * r.extended;
    C = sign * r.contracted;
    startThresholdProgress = farSign * (startExtended ? E : C);
    farThresholdProgress = farSign * (startExtended ? C : E);
  }
  applyRule(rule);

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
  /**
   * Movement clock (ms): advances only between consecutive tracked frames, so hidden time
   * (gated frames, or a stall over RESEED_GAP_MS) never counts as movement. Leg times use it.
   */
  let clock = 0;
  /** Whether the previous frame pushed was tracked (no gap since lastTrackedT). */
  let prevTracked = false;
  // Rep bookkeeping (leg times on the movement clock in ms, angles smoothed degrees).
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
  /** In 'up': most start-ward progress of this return and when (movement clock). */
  let returnProgress = Infinity;
  let returnT = 0;
  /** In 'up': when (movement clock) the angle last went past the hysteresis back toward far. */
  let turnSince: number | null = null;
  /**
   * The rep in progress started at a `start` partial's turnaround. If it goes back to the start
   * band without reaching far, that is the same attempt finishing, not a second (`far`) miss.
   */
  let fromStartPartial = false;
  let lastMiss: MissReason | null = null;
  let lastPartial: RepEvent | null = null;
  /** Video aspect from the pose, for image-plane angles (rule.angleSpace 'image'). */
  const aspect = createAspectEstimator();
  /** Torso direction at the settle, for the posture gate (rule.maxTorsoLeanDeg). */
  let refTorso: Vec3 | null = null;
  /** Since when (frame t) the posture gate has failed without a break; null while it passes. */
  let leanFailSince: number | null = null;
  /** Since when the raw angle has been in the start band while the posture gate fails. */
  let leanStartSince: number | null = null;
  /** Recent shoulder-line yaws while settling, to judge the camera view (rule.otherView). */
  let yaws: number[] = [];

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
    prevTracked = false;
    aspect.reset(); // a restarted stream may be another camera
    refTorso = null;
    leanFailSince = null;
    leanStartSince = null;
    yaws = [];
    applyRule(rule);
  }

  /**
   * While settling: which view does the camera see? Mean shoulder-line yaw over the recent
   * frames below `frontBelow` = front, above `sideAbove` = side, in between = keep the current
   * view (dead band against flip-flopping). Switching thresholds restarts the settle.
   */
  function judgeView(frame: LandmarkFrame): void {
    if (!variant) return;
    const yaw = shoulderYawDeg(frame);
    if (yaw === null) return;
    yaws.push(yaw);
    if (yaws.length > SIDE_WINDOW) yaws.shift();
    const mean = yaws.reduce((sum, y) => sum + y, 0) / yaws.length;
    const cut = rule.viewYawDeg ?? DEFAULT_VIEW_YAW;
    const seen = mean < cut.frontBelow ? 'front' : mean > cut.sideAbove ? 'side' : active.view;
    const target = seen === rule.view ? rule : variant;
    if (target === active) return;
    applyRule(target);
    ema = null;
    settleSince = null;
    side = null;
    lockedSide = null;
  }

  function reset(): void {
    reps = 0;
    partials = 0;
    lastMiss = null;
    lastPartial = null;
    restartTracking();
  }

  function readSide(frame: LandmarkFrame, s: Side): number | null {
    // Written as !(v >= min) so a NaN visibility fails the gate.
    if (!(tripletVisibility(frame, rule.triplets[s]) >= rule.minVisibility)) return null;
    if (rule.angleSpace === 'image')
      return frameAngle(frame, rule.triplets[s], { space: 'image', aspect: aspect.value ?? 1 });
    return frameAngle(frame, rule.triplets[s]);
  }

  /** False when the active rule's body-line gate (minHipAngleDeg) fails for this frame. */
  function bodyLineOk(frame: LandmarkFrame): boolean {
    if (active.minHipAngleDeg === undefined) return true;
    const hip = hipAngleDeg(frame, rule.minVisibility); // null = unknown: passes
    return hip === null || hip >= active.minHipAngleDeg;
  }

  /** False when the torso has turned past rule.maxTorsoLeanDeg from its direction at settle. */
  function postureOk(frame: LandmarkFrame): boolean {
    if (rule.maxTorsoLeanDeg === undefined || refTorso === null) return true;
    const d = torsoDirection(frame);
    return d === null || angleBetweenDeg(d, refTorso) <= rule.maxTorsoLeanDeg;
  }

  /**
   * Angle + side for this frame, or null when the visibility or posture gate fails.
   * Posture gate: leaving the posture (bending to pick up or put down the weights) drops the
   * attempt in progress: back to setup, counts, side and reference posture kept. If the gate
   * keeps failing (phone knocked or re-seated, so "upright" now reads as a lean), the reference
   * is re-taken once the arms hold the start band for minPhaseMs, or after LEAN_RELOCK_MS.
   */
  function read(frame: LandmarkFrame): Reading | null {
    if (rule.angleSpace === 'image') aspect.push(frame);
    if (phase === 'setup') judgeView(frame);
    if (!bodyLineOk(frame)) {
      // Not in the exercise's body position (sitting, kneeling up): no attempt in progress.
      phase = 'setup';
      settleSince = null;
      return null;
    }
    const r = readAngle(frame);
    if (postureOk(frame)) {
      leanFailSince = null;
      leanStartSince = null;
      return r;
    }
    const t = frame.t;
    leanFailSince ??= t;
    if (r !== null && inStart(sign * r.angle, r.gate)) leanStartSince ??= t;
    else leanStartSince = null;
    if (
      t - leanFailSince >= LEAN_RELOCK_MS ||
      (leanStartSince !== null && t - leanStartSince >= rule.minPhaseMs)
    ) {
      refTorso = torsoDirection(frame);
      leanFailSince = null;
      leanStartSince = null;
      return r;
    }
    phase = 'setup';
    settleSince = null;
    return null;
  }

  /** Angle + side for this frame from the visible limb(s), or null when visibility fails. */
  function readAngle(frame: LandmarkFrame): Reading | null {
    if (active.sideMode === 'both') {
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
    fromStartPartial = false;
    lastInStartT = t;
    startExtremeAngle = a;
  }

  function track(a: number): void {
    if (a < minAngle) minAngle = a;
    if (a > maxAngle) maxAngle = a;
  }

  /**
   * Minimum time check (legs on the movement clock): each leg must take at least minPhaseMs / 2
   * and the out-and-back pair at least 2 × minPhaseMs (dwell at the far end is not movement).
   * Rejects glitches and jitter-fast swings, but keeps a real rep with a fast (~0.45 s) lowering,
   * which M5 coaches instead.
   */
  function rushed(outMs: number, backMs: number): boolean {
    const leg = rule.minPhaseMs / 2;
    return outMs < leg || backMs < leg || outMs + backMs < 2 * rule.minPhaseMs;
  }

  function emit(type: RepEvent['type'], outMs: number, backMs: number, t: number): RepEvent {
    const index = type === 'rep' ? ++reps : ++partials;
    if (type === 'rep') lastMiss = null;
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

  /** A partial with its reason and how far (smoothed degrees, ≥ 0, 0.1° steps) it fell short. */
  function emitPartial(
    reason: MissReason,
    shortBy: number,
    outMs: number,
    backMs: number,
    t: number,
  ): RepEvent {
    const ev: RepEvent = {
      ...emit('partial', outMs, backMs, t),
      reason,
      shortByDeg: Math.round(Math.max(0, shortBy) * 10) / 10,
    };
    lastMiss = reason;
    lastPartial = ev;
    return ev;
  }

  /** Start a rep in progress from the current point, heading to the far end (phase 'down'). */
  function startDown(departT: number, ct: number, a: number, startAngle: number): void {
    phase = 'down';
    departStartT = departT;
    minAngle = Math.min(startAngle, a);
    maxAngle = Math.max(startAngle, a);
    extremeProgress = farSign * sign * a;
    extremeT = ct;
    offPath = false;
  }

  function startUp(ct: number, o: number): void {
    phase = 'up';
    departFarT = lastInFarT;
    returnProgress = farSign * o;
    returnT = ct;
    turnSince = null;
  }

  function push(frame: LandmarkFrame): RepEvent[] {
    const t = frame.t;
    // Time went backwards (camera switch / stream restart re-zeroes t): start tracking afresh.
    if (t < lastFrameT) restartTracking();
    lastFrameT = t;
    const r = read(frame);
    if (r === null) {
      tracking = false;
      prevTracked = false;
      settleSince = null; // settling needs an unbroken run of tracked frames
      return [];
    }
    const gap = !prevTracked || t - lastTrackedT > RESEED_GAP_MS;
    if (!gap) clock += t - lastTrackedT;
    prevTracked = true;
    tracking = true;
    side = r.side;
    if (ema === null || t - lastTrackedT > RESEED_GAP_MS) {
      ema = r.angle;
      settleSince = null;
    } else ema += rule.emaAlpha * (r.angle - ema);
    lastTrackedT = t;
    const a = ema;
    const ct = clock;
    const o = sign * a;
    const events: RepEvent[] = [];

    switch (phase) {
      case 'setup': {
        if (inStart(o, r.gate)) {
          settleSince ??= t;
          if (t - settleSince >= rule.minPhaseMs) {
            if (r.side !== 'both') lockedSide = r.side;
            if (rule.maxTorsoLeanDeg !== undefined) refTorso = torsoDirection(frame);
            enterStart(ct, a);
          }
        } else if (leftStart(o)) {
          settleSince = null;
        }
        break;
      }
      case 'top': {
        if (inStart(o, r.gate)) {
          lastInStartT = ct;
          if (farSign * sign * (a - startExtremeAngle) < 0) startExtremeAngle = a;
        } else if (leftStart(o)) {
          startDown(lastInStartT, ct, a, startExtremeAngle);
        }
        break;
      }
      case 'down': {
        track(a);
        if (farSign * o > extremeProgress) {
          extremeProgress = farSign * o;
          extremeT = ct;
        }
        if (inFar(o, r.gate)) {
          phase = 'bottom';
          fromStartPartial = false;
          arriveFarT = ct;
          lastInFarT = ct;
        } else if (inFar(o, true)) {
          offPath = true;
        } else if (inStart(o, r.gate)) {
          // Turned around before the far band: a partial if it went deep enough and wasn't rushed.
          const depth = extremeProgress - startThresholdProgress;
          const outMs = extremeT - departStartT;
          const backMs = ct - extremeT;
          if (
            !fromStartPartial &&
            !offPath &&
            depth >= rule.minPartialDepthDeg &&
            !rushed(outMs, backMs)
          )
            events.push(
              emitPartial('far', farThresholdProgress - extremeProgress, outMs, backMs, t),
            );
          enterStart(ct, a);
        }
        break;
      }
      case 'bottom': {
        track(a);
        if (inFar(o, r.gate)) lastInFarT = ct;
        else if (leftFar(o)) startUp(ct, o);
        break;
      }
      case 'up': {
        track(a);
        if (inFar(o, r.gate)) {
          phase = 'bottom';
          lastInFarT = ct;
        } else if (inStart(o, r.gate)) {
          const outMs = arriveFarT - departStartT;
          const backMs = ct - departFarT;
          if (!rushed(outMs, backMs)) events.push(emit('rep', outMs, backMs, t));
          enterStart(ct, a);
        } else {
          const p = farSign * o;
          if (p < returnProgress) {
            returnProgress = p;
            returnT = ct;
            turnSince = null;
          } else if (p <= returnProgress + h) {
            turnSince = null;
          } else {
            // Turned toward the far end again without reaching the start band. Confirmed once the
            // turn has held past the hysteresis for one minimum leg (rejects 1–2 frame pose
            // glitches). A `start` partial if the return came far enough back and wasn't rushed;
            // otherwise ignore the wobble (stay in 'up', keeping the rep's timing).
            turnSince ??= ct;
            const back = farThresholdProgress - returnProgress;
            const outMs = arriveFarT - departStartT;
            const backMs = returnT - departFarT;
            if (
              ct - turnSince >= rule.minPhaseMs / 2 &&
              back >= rule.minPartialDepthDeg &&
              !rushed(outMs, backMs)
            ) {
              events.push(
                emitPartial('start', returnProgress - startThresholdProgress, outMs, backMs, t),
              );
              // Tracking continues as a new rep in progress, departing from the turnaround.
              const turnAngle = farSign * sign * returnProgress;
              startDown(returnT, ct, a, turnAngle);
              extremeProgress = p;
              fromStartPartial = true;
            }
          }
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
    get rule() {
      return active;
    },
    get reachedFar() {
      return phase === 'bottom' || phase === 'up';
    },
    get lastMiss() {
      return lastMiss;
    },
    get lastPartial() {
      return lastPartial;
    },
  };
}
