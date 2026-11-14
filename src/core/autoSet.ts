// Hands-free sets (SPEC M5c): a pure state machine that turns the rep counter's per-frame output
// into auto start / auto stop / idle-close actions. No DOM, no clock: every time is passed in, on
// the camera frame clock (the caller converts to wall time).
//
// States: 'off' (no exercise / summary / manual exercise) → 'rest' ⇄ 'set' → 'pending' (Undo
// window) → commit → 'rest', 'set' → 'held' (a break inside the set) → continueSet() → 'set' or
// nextSet() / confirm() / idle → commit, and 'closed' (idle close; terminal, the camera is stopped).
//
// Breaks (SPEC M5c "Breaks inside a set: tap to continue"): inside a set with ≥ stopMinReps reps,
// a posture / body-line gate failing for breakGateSec while present, or nobody in frame for
// awaySec, puts the set on hold instead of stopping it. While held nothing is counted, nothing
// starts and nothing is saved until a tap (or an idle limit). Gated (posture / body-line) frames
// reset the still and stalled clocks, so a sit-down can't turn into a still stop first. The gate
// clock restarts on a re-tracked frame; visibility-gated and no-pose frames neither restart it nor
// start it (a visibility failure is never a break). A pending Undo window is unaffected.
//
// The Undo window delays the save: `stopPending` is only a proposal; `commit` (when the window
// expires, or on confirm()) is when the caller dispatches SET_DONE, backdated to `endedAt`.
// Counts are frozen at the proposal (a partial in the window isn't saved) unless it is cancelled.
// If an attempt leaves the start band during the window, the commit waits for it to end: a counted
// rep cancels ("Keep going."), a return to the band without one commits then.
//
// Caller contract:
// - push() every camera tick, including frames with no pose (tracking false, present false);
//   away stops, idle closes and window expiry only happen inside push().
// - After a `start` action, dispatch START_SET (now = at) synchronously, before any
//   setSession({ phase: 'rest' }) call; otherwise the started set is dropped as a manual Set done.
// - If the frame clock restarts (t goes back ≥ 100 ms; smaller steps back are ignored), stored times are rebased onto the new clock as
//   if no time passed, and the stop/idle timers restart from the first new frame.
import type { RepPhase, UntrackedReason } from './repCounter';
import type { LandmarkFrame, RepEvent } from './types';

/** All thresholds are data (SPEC M5c defaults); retuned from the developer log. */
export type AutoSetConfig = {
  /** Counted reps in rest that start a set. */
  startReps: number;
  /** Each of those reps must complete within this many seconds of the previous one. */
  startWindowSec: number;
  /** Rest must have run this long before reps can start a set. */
  armAfterSec: number;
  /**
   * After an auto stop, rest also stays unarmed until this long after the commit (walking to the
   * rack / picking the dumbbells up right after "Set done" mustn't start a set).
   */
  armAfterAutoStopSec: number;
  /** A set never auto-stops with fewer reps than this. */
  stopMinReps: number;
  /** `still`: in the start band (or setup), no event, no phase change, for this long. */
  stillSec: number;
  /** Break (hold) `away`: no person in frame for this long, inside a set with ≥ stopMinReps reps. */
  awaySec: number;
  /**
   * Break (hold) on a posture / body-line gate (sitting down, bending over) failing continuously
   * for this long while the person is in frame. Longer than a 1–3 s bend to the rack, shorter than
   * the real 16 s sit of a push-up rest-pause.
   */
  breakGateSec: number;
  /** `stalled`: outside the start band, no event, no phase change, for this long. */
  stalledSec: number;
  /** Undo window length; nothing is committed before it ends. */
  undoSec: number;
  /** After a cancelled stop, the set's still time is stillSec × this. */
  undoStillFactor: number;
  /** Idle close: no tracked person for this long. */
  idleNoPersonSec: number;
  /** Idle close: no counted rep for this long. */
  idleNoRepSec: number;
  /**
   * The smoothed angle moving more than this from where it settled counts as movement for the
   * still timer (a slow start into the next rep while the counter is still in its start band).
   * Bigger than the ±5° jitter seen in real logs.
   */
  stillMoveDeg: number;
};

export const AUTO_SET_DEFAULTS: Readonly<AutoSetConfig> = Object.freeze({
  startReps: 2,
  startWindowSec: 8,
  armAfterSec: 10,
  armAfterAutoStopSec: 5,
  stopMinReps: 2,
  stillSec: 6,
  awaySec: 3,
  breakGateSec: 5,
  stalledSec: 10,
  undoSec: 5,
  undoStillFactor: 2,
  idleNoPersonSec: 180,
  idleNoRepSec: 600,
  stillMoveDeg: 15,
});

export type AutoStopReason = 'still' | 'stalled';
/** Why a set went on hold: the counter's gate reason, or nobody in frame. */
export type AutoHoldReason = 'posture' | 'bodyLine' | 'away';
export type AutoCancelReason = 'undo' | 'rep' | 'paused';
export type AutoCloseReason = 'noPerson' | 'noRep';

export type AutoSetAction =
  /** Start the set, backdated: `at` = when the first of the starting reps left the start band. */
  | { type: 'start'; at: number; reps: number; partials: number }
  /** Say "Set done. N reps." and show Undo until `until`; don't save yet. */
  | {
      type: 'stopPending';
      reason: AutoStopReason;
      reps: number;
      partials: number;
      /** End of the set's last rep/partial: the backdated SET_DONE time. */
      endedAt: number;
      until: number;
    }
  /** The pending stop is off ("Keep going."); the set continues with the same counts. */
  | { type: 'stopCancelled'; reason: AutoCancelReason }
  /**
   * A break inside the set: freeze the shown count, show Continue set / Start next set (Save set)
   * and say "Set on hold. Tap to continue." Nothing is saved; `endedAt` is the backdated end.
   */
  | {
      type: 'hold';
      reason: AutoHoldReason;
      reps: number;
      partials: number;
      endedAt: number;
    }
  /** Continue set was tapped: the set runs on with the same counts. */
  | { type: 'holdEnded'; how: 'continue' }
  /** Save now: SET_DONE with now = endedAt. */
  | { type: 'commit'; endedAt: number; reps: number; partials: number }
  /** Stop the camera ("Camera off."). Terminal. */
  | { type: 'close'; reason: AutoCloseReason };

export type AutoSetState = 'off' | 'rest' | 'set' | 'pending' | 'held' | 'closed';

export type AutoSetSession = {
  phase: 'exercise' | 'rest' | 'other';
  paused: boolean;
  /** How long the current rest has run at `t` (ignored outside rest). */
  restElapsedMs: number;
};

/**
 * One camera frame, after the rep counter has seen it. Push one for every camera tick, including
 * ticks with no pose (tracking false, present false), or away / idle / commit never fire.
 */
export type AutoSetInput = {
  t: number;
  /** The counter's visibility gate passed on this frame. */
  tracking: boolean;
  /**
   * A person is in frame (see personInFrame), whatever the counter's gates say. A posture /
   * body-line gate failure (sitting down, kneeling) makes tracking false but keeps present true,
   * so it never counts as `away` or idle `noPerson`. Defaults to `tracking`, or true when
   * `untracked` is posture / bodyLine (the counter saw a pose).
   */
  present?: boolean;
  /**
   * The counter's `untracked` reason on this frame. `posture` / `bodyLine` while present feed the
   * break gate (and reset the still / stalled clocks); `visibility` is never a break. Omitted =
   * unknown: no gate break (the M5c behaviour).
   */
  untracked?: UntrackedReason | null;
  phase: RepPhase;
  /** The counter's smoothed angle (optional; enables the still-movement check). */
  angle?: number | null;
  /** Events the counter returned for this frame. */
  events: readonly RepEvent[];
};

export type AutoSet = {
  /** Tell the machine the session phase (call on every dispatch and when (un)pausing). */
  setSession(session: AutoSetSession, t: number): AutoSetAction[];
  /** Feed one frame per camera tick (in time order; see AutoSetInput). */
  push(input: AutoSetInput): AutoSetAction[];
  /** Undo tapped: cancels a pending stop. */
  undo(t: number): AutoSetAction[];
  /**
   * Set done tapped during the window, or Save set / Set done while held: commit at once (same
   * backdated end, frozen counts).
   */
  confirm(t: number): AutoSetAction[];
  /** Continue set tapped while held: `holdEnded`, back to the set with fresh stop timers. */
  continueSet(t: number): AutoSetAction[];
  /**
   * Start next set (or Save set) tapped while held: `commit` (backdated endedAt, frozen counts).
   * The caller dispatches SET_DONE { now: endedAt }, then START_SET for the next set.
   */
  nextSet(t: number): AutoSetAction[];
  readonly state: AutoSetState;
  /** End of the Undo window (frame clock), or null when no stop is pending. */
  readonly pendingUntil: number | null;
  /** Counts of the current set (frozen while held; zero outside a set). */
  readonly counts: { reps: number; partials: number };
};

/** Landmarks at or above this visibility count toward presence. */
const PRESENT_VISIBILITY = 0.5;
/** A pose with at least this many visible landmarks (of 33) is a person in frame. */
const PRESENT_MIN_LANDMARKS = 8;

/**
 * Whether the landmarker sees a person in this frame, independent of any exercise gate: at least
 * 8 landmarks with visibility ≥ 0.5 (a seated or partly cropped body still counts; an empty pose
 * or a few stray points don't).
 */
export function personInFrame(frame: LandmarkFrame): boolean {
  let n = 0;
  for (const l of frame.landmarks) if (l.visibility >= PRESENT_VISIBILITY) n++;
  return n >= PRESENT_MIN_LANDMARKS;
}

/** A backwards step in t this big or bigger is a stream restart; smaller ones are jitter. */
const RESTART_REGRESSION_MS = 100;

const START_BAND: ReadonlySet<RepPhase> = new Set<RepPhase>(['top', 'setup']);

export function createAutoSet(config: AutoSetConfig = AUTO_SET_DEFAULTS): AutoSet {
  const ms = (sec: number) => sec * 1000;

  let state: AutoSetState = 'off';
  let paused = false;
  /** Latest t seen (push or setSession), to detect a frame-clock restart. */
  let lastT: number | null = null;
  /** Last frame with a person in frame (away / noPerson). */
  let lastPresentT = -Infinity;
  /**
   * Last resume from Pause. Backdated times never go before it: the reducer doesn't record
   * pauses inside a set, so a backdate into the pause would count it as set time.
   */
  let resumeT = -Infinity;
  let lastRepT = -Infinity;
  /** Idle timers never count from before this (open, resume, clock restart). */
  let idleFloor = -Infinity;

  // Counter phase bookkeeping.
  let prevPhase: RepPhase | null = null;
  /** Last tracked frame in the start band ('top'), and the latest departure from it. */
  let lastTopT: number | null = null;
  let departT: number | null = null;

  // Rest: candidate reps (completed after arming, not paused) and partials, for the start.
  let armAt = Infinity;
  /** After an auto stop: commit + armAfterAutoStopSec; armAt never goes below it. */
  let armFloor = -Infinity;
  /** When rest began here: reps that left the start band before it belong to the set. */
  let restEnteredAt = -Infinity;
  let restReps: { t: number; departT: number }[] = [];
  let restPartials: number[] = [];

  // Set.
  let reps = 0;
  let partials = 0;
  let lastEventT: number | null = null;
  /** Last event or counter phase change (still + stalled timers). */
  let activityT = -Infinity;
  /** Last time the angle moved past stillMoveDeg from its anchor (still timer only). */
  let movedT = -Infinity;
  let anchorAngle: number | null = null;
  /** Stop timers never count from before this (set start, resume, cancel, clock restart). */
  let stopFloor = -Infinity;
  let stillFactor = 1;
  /** First frame of the current posture / body-line gate run (null = not gated). */
  let gateSince: number | null = null;

  // Pending stop (Undo window).
  let pendingUntil: number | null = null;
  let pendingEndedAt = 0;
  /** Counts frozen at the proposal. */
  let pendingReps = 0;
  let pendingPartials = 0;
  /** The counter left the start band during the window: an attempt is in progress. */
  let attemptInWindow = false;

  function see(t: number): void {
    if (lastT === null) idleFloor = t;
    else if (t <= lastT - RESTART_REGRESSION_MS) rebase(t - lastT, t);
    else if (t < lastT) return; // out-of-order timestamp jitter: keep the clock as it was
    lastT = t;
  }

  /**
   * Frame clock restarted (new t0): move every stored time onto the new clock as if no time
   * passed, forget the phase history, and restart the stop/idle timers at `t`.
   */
  function rebase(shift: number, t: number): void {
    lastPresentT += shift;
    resumeT += shift;
    lastRepT += shift;
    armAt += shift;
    armFloor += shift;
    restEnteredAt += shift;
    if (lastEventT !== null) lastEventT += shift;
    activityT += shift;
    movedT += shift;
    if (pendingUntil !== null) pendingUntil += shift;
    if (gateSince !== null) gateSince += shift;
    pendingEndedAt += shift;
    restReps = restReps.map((r) => ({ t: r.t + shift, departT: r.departT + shift }));
    restPartials = restPartials.map((p) => p + shift);
    prevPhase = null;
    lastTopT = null;
    departT = null;
    anchorAngle = null;
    stopFloor = t;
    idleFloor = t;
  }

  /** Enter rest at `t`, the rest having run `restElapsedMs` already. */
  function enterRest(t: number, restElapsedMs: number): void {
    state = 'rest';
    pendingUntil = null;
    reps = 0;
    partials = 0;
    restReps = [];
    restPartials = [];
    restEnteredAt = t;
    armFloor = -Infinity;
    armAt = t - restElapsedMs + ms(config.armAfterSec);
  }

  function enterSet(t: number, startReps: number, startPartials: number, lastEvT: number | null) {
    state = 'set';
    reps = startReps;
    partials = startPartials;
    lastEventT = lastEvT;
    activityT = t;
    movedT = t;
    anchorAngle = null;
    stopFloor = t;
    stillFactor = 1;
    gateSince = null;
    pendingUntil = null;
  }

  function cancel(t: number, reason: AutoCancelReason): AutoSetAction[] {
    state = 'set';
    pendingUntil = null;
    // A pause isn't "Keep going": only Undo / a rep double the still time.
    if (reason !== 'paused') stillFactor = config.undoStillFactor;
    stopFloor = t;
    return [{ type: 'stopCancelled', reason }];
  }

  function commit(t: number): AutoSetAction[] {
    const end = pendingEndedAt;
    const action: AutoSetAction = {
      type: 'commit',
      endedAt: end,
      reps: pendingReps,
      partials: pendingPartials,
    };
    // The rest started at the backdated end; the caller's setSession refines it.
    enterRest(t, t - end);
    armFloor = t + ms(config.armAfterAutoStopSec);
    armAt = Math.max(armAt, armFloor);
    return [action];
  }

  function setSession(session: AutoSetSession, t: number): AutoSetAction[] {
    see(t);
    if (state === 'closed') return [];
    const out: AutoSetAction[] = [];
    const wasPaused = paused;
    paused = session.paused;
    if (session.phase === 'other') {
      state = 'off';
      pendingUntil = null;
      return out;
    }
    if (session.phase === 'rest') {
      if (state !== 'rest') enterRest(t, session.restElapsedMs);
      else armAt = Math.max(t - session.restElapsedMs + ms(config.armAfterSec), armFloor);
      if (paused) {
        restReps = [];
        restPartials = [];
      }
    } else {
      // exercise
      // 'held' stays held (a tap decides); pausing it only stops the idle limits.
      if (state === 'off' || state === 'rest') enterSet(t, 0, 0, null);
      if (paused && state === 'pending') out.push(...cancel(t, 'paused'));
    }
    if (wasPaused && !paused) {
      stopFloor = t;
      idleFloor = t;
      resumeT = t;
    }
    return out;
  }

  function idle(t: number): AutoSetAction[] {
    let reason: AutoCloseReason | null = null;
    if (t - Math.max(lastPresentT, idleFloor) >= ms(config.idleNoPersonSec)) reason = 'noPerson';
    else if (t - Math.max(lastRepT, idleFloor) >= ms(config.idleNoRepSec)) reason = 'noRep';
    if (reason === null) return [];
    state = 'closed';
    pendingUntil = null;
    return [{ type: 'close', reason }];
  }

  function restFrame(input: AutoSetInput): AutoSetAction[] {
    const { t } = input;
    for (const ev of input.events) {
      if (paused || ev.t < armAt) continue;
      if (ev.type === 'partial') {
        restPartials.push(ev.t);
        continue;
      }
      const depart = departT ?? ev.t - ev.eccentricMs - ev.concentricMs;
      // Left the start band before rest began here: the end of the last set, not a new one.
      if (depart < restEnteredAt) continue;
      const last = restReps[restReps.length - 1];
      if (last && ev.t - last.t > ms(config.startWindowSec)) restReps = [];
      restReps.push({ t: ev.t, departT: depart });
      if (restReps.length >= config.startReps) {
        const first = restReps[restReps.length - config.startReps];
        if (first === undefined) continue;
        const between = restPartials.filter((p) => p >= first.departT && p <= ev.t).length;
        const at = Math.max(first.departT, resumeT);
        enterSet(t, config.startReps, between, ev.t);
        lastRepT = ev.t;
        return [{ type: 'start', at, reps: config.startReps, partials: between }];
      }
    }
    // Keep the partial list short (only partials after the oldest candidate's departure matter).
    const oldest = restReps[0]?.departT ?? t - ms(config.startWindowSec) * 2;
    restPartials = restPartials.filter((p) => p >= oldest);
    if (paused) return [];
    return idle(t);
  }

  /** In the window: cancel on a rep; commit at expiry unless an attempt is still in progress. */
  function pendingFrame(input: AutoSetInput, repSeen: boolean): AutoSetAction[] {
    const { t } = input;
    if (repSeen) return cancel(t, 'rep');
    if (pendingUntil === null || t < pendingUntil || paused) return [];
    if (!attemptInWindow || START_BAND.has(input.phase)) return commit(t);
    // Held for an attempt in progress; give up on it like a stop would (away / stalled), and
    // never hold past pendingUntil + stalledSec (a counter flapping between phases).
    if (t >= pendingUntil + ms(config.stalledSec)) return commit(t);
    const since = Math.max(activityT, pendingUntil);
    if (t - Math.max(lastPresentT, pendingUntil) >= ms(config.awaySec)) return commit(t);
    if (t - since >= ms(config.stalledSec)) return commit(t);
    return [];
  }

  function setFrame(input: AutoSetInput, phaseChanged: boolean): AutoSetAction[] {
    const { t } = input;
    let repSeen = false;
    for (const ev of input.events) {
      if (ev.type === 'rep') {
        reps++;
        repSeen = true;
      } else partials++;
      lastEventT = ev.t;
      activityT = t;
    }
    if (phaseChanged) activityT = t;
    // Gate run: a gated frame starts or extends it, a re-tracked frame ends it; visibility-gated
    // and no-pose frames leave it as it is. Gated frames reset the still / stalled clocks.
    const gated = gatedFrame(input);
    if (gated) {
      gateSince ??= t;
      activityT = t;
    } else if (input.tracking) gateSince = null;
    if (activityT === t) anchorAngle = null;
    const angle = input.angle;
    if (input.tracking && typeof angle === 'number' && Number.isFinite(angle)) {
      if (anchorAngle === null) anchorAngle = angle;
      else if (Math.abs(angle - anchorAngle) > config.stillMoveDeg) {
        anchorAngle = angle;
        movedT = t;
      }
    }

    if (state === 'pending') {
      if (phaseChanged && !START_BAND.has(input.phase)) attemptInWindow = true;
      return pendingFrame(input, repSeen);
    }
    if (paused) return [];

    if (reps >= config.stopMinReps && lastEventT !== null) {
      let hold: AutoHoldReason | null = null;
      if (t - Math.max(lastPresentT, stopFloor) >= ms(config.awaySec)) hold = 'away';
      else if (
        gated &&
        gateSince !== null &&
        t - Math.max(gateSince, stopFloor) >= ms(config.breakGateSec) &&
        (input.untracked === 'posture' || input.untracked === 'bodyLine')
      )
        hold = input.untracked;
      if (hold !== null) {
        state = 'held';
        pendingEndedAt = Math.max(lastEventT, resumeT);
        pendingReps = reps;
        pendingPartials = partials;
        return [{ type: 'hold', reason: hold, reps, partials, endedAt: pendingEndedAt }];
      }
      let reason: AutoStopReason | null = null;
      const since = Math.max(activityT, stopFloor);
      if (START_BAND.has(input.phase)) {
        if (t - Math.max(since, movedT) >= ms(config.stillSec * stillFactor)) reason = 'still';
      } else if (t - since >= ms(config.stalledSec)) reason = 'stalled';
      if (reason !== null) {
        state = 'pending';
        pendingUntil = t + ms(config.undoSec);
        pendingEndedAt = Math.max(lastEventT, resumeT);
        pendingReps = reps;
        pendingPartials = partials;
        attemptInWindow = false;
        return [
          {
            type: 'stopPending',
            reason,
            reps,
            partials,
            endedAt: pendingEndedAt,
            until: pendingUntil,
          },
        ];
      }
    }
    return idle(t);
  }

  /** A posture / body-line gate failure with the person in frame (a break candidate). */
  function gatedFrame(input: AutoSetInput): boolean {
    return (
      (input.untracked === 'posture' || input.untracked === 'bodyLine') && presentIn(input)
    );
  }

  function presentIn(input: AutoSetInput): boolean {
    return (
      input.present ??
      (input.tracking || input.untracked === 'posture' || input.untracked === 'bodyLine')
    );
  }

  function push(input: AutoSetInput): AutoSetAction[] {
    const { t } = input;
    see(t);
    if (presentIn(input)) lastPresentT = t;
    for (const ev of input.events) if (ev.type === 'rep') lastRepT = Math.max(lastRepT, ev.t);
    const phaseChanged = prevPhase !== null && prevPhase !== input.phase;
    if (prevPhase === 'top' && input.phase !== 'top' && lastTopT !== null) departT = lastTopT;
    if (input.phase === 'top' && input.tracking) lastTopT = t;
    prevPhase = input.phase;

    if (state === 'rest') return restFrame(input);
    if (state === 'set' || state === 'pending') return setFrame(input, phaseChanged);
    if (state === 'held') return heldFrame(input);
    return [];
  }

  /** While held: nothing counts or starts; only the idle limits (commit, then close). */
  function heldFrame(input: AutoSetInput): AutoSetAction[] {
    if (paused) return [];
    const closed = idle(input.t);
    if (closed.length === 0) return [];
    const saved = holdCommit();
    state = 'closed';
    return [...saved, ...closed];
  }

  /** Save the held set: frozen counts, backdated end; the machine goes to rest. */
  function holdCommit(): AutoSetAction[] {
    const end = pendingEndedAt;
    const action: AutoSetAction = {
      type: 'commit',
      endedAt: end,
      reps: pendingReps,
      partials: pendingPartials,
    };
    enterRest(lastT ?? end, (lastT ?? end) - end);
    return [action];
  }

  function undo(t: number): AutoSetAction[] {
    see(t);
    if (state !== 'pending') return [];
    return cancel(t, 'undo');
  }

  function confirm(t: number): AutoSetAction[] {
    see(t);
    if (state === 'held') return holdCommit();
    if (state !== 'pending') return [];
    return commit(t);
  }

  function continueSet(t: number): AutoSetAction[] {
    see(t);
    if (state !== 'held') return [];
    // Same counts and last event; every stop / break clock starts again at the tap.
    enterSet(t, pendingReps, pendingPartials, lastEventT);
    return [{ type: 'holdEnded', how: 'continue' }];
  }

  function nextSet(t: number): AutoSetAction[] {
    see(t);
    if (state !== 'held') return [];
    return holdCommit();
  }

  return {
    setSession,
    push,
    undo,
    confirm,
    continueSet,
    nextSet,
    get state() {
      return state;
    },
    get pendingUntil() {
      return pendingUntil;
    },
    get counts() {
      if (state === 'held') return { reps: pendingReps, partials: pendingPartials };
      return state === 'set' || state === 'pending' ? { reps, partials } : { reps: 0, partials: 0 };
    },
  };
}
