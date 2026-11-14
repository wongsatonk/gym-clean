// Camera screen (camera-first): full-bleed video with the 2D skeleton overlay, the rep count and
// target on the video, a phone set-up card, camera switch, and a collapsed 3D live skeleton.
// Privacy: frames are only passed to on-device inference; nothing is recorded or uploaded.
import {
  createAutoSet,
  personInFrame,
  type AutoCancelReason,
  type AutoCloseReason,
  type AutoHoldReason,
  type AutoSetAction,
  type AutoSetConfig,
  type AutoStopReason,
} from '../core/autoSet';
import { autoSetConfigFor, focusFlagsFor, ruleFor } from '../core/exercises';
import { createFocusTracker, type FocusCue, type FocusTracker } from '../core/focus';
import { FpsMeter } from '../core/fps';
import {
  createCoachSpeech,
  hintFor,
  type DropReason,
  type SpeechDecision,
} from '../core/coachSpeech';
import { createRepCounter, type RepCounter } from '../core/repCounter';
import { GAUGE_MAX, GAUGE_MIN, missedMark, readGauge } from '../core/romGauge';
import { JOINTS, SKELETON } from '../core/poseTopology';
import type { FocusCueId, LandmarkFrame, RepEvent } from '../core/types';
import type { DevLogRecorder } from '../data/devlog';
import { openCamera, stopStream, type Facing } from '../pose/camera';
import type { PoseTracker } from '../pose/landmarker';
import { createAutoStopBanner, type AutoStopBannerHandle } from './autoStopBanner';
import { createHoldPanel, type HoldPanelHandle } from './holdPanel';
import {
  createCameraRestPanel,
  type CameraRestPanelHandle,
  type CameraRestUpdate,
} from './cameraRestPanel';
import { h } from './dom';
import type { Skeleton3D, SkeletonPreset } from './skeleton3d';
import { voice } from './voice';

export type CameraView = {
  readonly el: HTMLElement;
  start(): Promise<void>;
  stop(): void;
  /**
   * Hands-free only (no-op otherwise): the app's session state. Call right after creating the
   * view, after every dispatch, and on pause/resume. 'rest' → rest mode (silent counter, rest
   * panel); 'exercise' while in rest mode → set mode with the counter at 0 (a manual Start set);
   * after an auto start the view is already in set mode and keeps its counts.
   */
  setSession(session: CameraSession): void;
  /** Hands-free rest mode: clock, next-set line and the coach tip / Fix elements to show. */
  setRest(update: CameraRestUpdate): void;
  /**
   * Hands-free: call after each recorder.beginSet() so the new set gets the camera meta
   * (folder, delegate, side, wallT0).
   */
  setBegun(): void;
  /** 'rest' while the rest panel is up (hands-free), else 'set'. */
  readonly mode: 'set' | 'rest';
};

/** The session as the camera needs it (hands-free). */
export type CameraSession = {
  phase: 'exercise' | 'rest' | 'other';
  paused: boolean;
  /** How long the current rest has run (ms; ignored outside rest). */
  restElapsedMs: number;
  /** Set line / target for the set being done or coming next ("Set 3 of 4 · 12 reps"). */
  target?: CameraTarget;
};

/**
 * M5c hands-free sets. Times are wall clock (Date.now() ms), converted from the camera frame
 * clock, except `frameT` (camera frame clock ms, for recorder.beginSet's prerollFromT).
 */
export type HandsFreeOptions = {
  /** Default autoSetConfigFor(rule) (AUTO_SET_DEFAULTS + the exercise's override). */
  config?: AutoSetConfig;
  /**
   * Two reps in rest started a set. Dispatch START_SET { now: at } synchronously, then call
   * setSession; the view then reports the counts through onCount and speaks the count word.
   */
  onAutoStart(e: { at: number; frameT: number; reps: number; partials: number }): void;
  /** The Undo window ended (or Set done was tapped in it): SET_DONE { now: endedAt }. */
  onCommit(e: { endedAt: number; reps: number; partials: number }): void;
  /** "Set done. N reps." was said and Undo shown; nothing to save yet. */
  onStopPending?(e: {
    reason: AutoStopReason;
    reps: number;
    partials: number;
    endedAt: number;
    until: number;
  }): void;
  /**
   * M5c break: the set went on hold ("Set on hold. Tap to continue." was said, the hold panel is
   * up, the shown count is frozen). Nothing to save yet.
   */
  onHold?(e: { reason: AutoHoldReason; reps: number; partials: number; endedAt: number }): void;
  /**
   * "Start next set" tapped on the hold panel: dispatch SET_DONE { now: endedAt } (the held set,
   * backdated to the end of its last rep), then START_SET { now: Date.now() }, then setSession.
   * Called instead of onCommit for this path; without it the view falls back to onCommit.
   * ("Save set" on the last set, Set done, Close and the idle limits use onCommit as usual.)
   */
  onHoldNext?(e: { endedAt: number; reps: number; partials: number }): void;
  /** The pending stop is off (Undo tapped, a rep, or Pause); the set goes on. */
  onStopCancelled?(e: { reason: AutoCancelReason }): void;
  /** Idle limit hit: "Camera off." was said and the camera/model are stopped. Call stop(). */
  onIdleClose(reason: AutoCloseReason): void;
  /** "Start set" tapped on the rest panel: dispatch START_SET, then setSession. */
  onStartSet(): void;
};

const MIN_VISIBILITY = 0.5;

function drawOverlay(canvas: HTMLCanvasElement, frame: LandmarkFrame | null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return;
  const W = canvas.width;
  const H = canvas.height;
  const lm = frame.landmarks;
  ctx.lineWidth = Math.max(3, W / 160);
  ctx.strokeStyle = '#4ade80';
  ctx.lineCap = 'round';
  for (const [a, b] of SKELETON) {
    const p = lm[a];
    const q = lm[b];
    if (!p || !q || p.visibility < MIN_VISIBILITY || q.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.moveTo(p.x * W, p.y * H);
    ctx.lineTo(q.x * W, q.y * H);
    ctx.stroke();
  }
  ctx.fillStyle = '#f4f6f8';
  for (const i of JOINTS) {
    const p = lm[i];
    if (!p || p.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.arc(p.x * W, p.y * H, Math.max(4, W / 120), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Where the set stands, shown next to the count: "3 / 12" and "Set 2 of 3 · 8–12 reps". */
export type CameraTarget = {
  /** 1-based set number being done now. */
  setNumber: number;
  /** Planned sets for this exercise. */
  sets: number;
  /** Top of the planned rep range (the "/ 12"). The count turns green when reached. */
  targetReps: number;
  /** Bottom of the planned rep range; when lower than targetReps the line reads "8–12 reps". */
  minReps?: number;
};

export type CameraViewOptions = {
  onClose: () => void;
  title: string;
  /** Exercise being trained. With a counting rule the sheet shows the live rep counter. */
  exerciseId?: string;
  /** Speak each counted rep ("One", "Two", …). Default true. */
  spokenCount?: boolean;
  /** Called whenever the rep or partial count changes. */
  onCount?: (reps: number, partials: number) => void;
  /** "Set done" tapped. Only shown when the counter is active. */
  onSetDone?: () => void;
  /** Set number and planned reps, shown with the count. Only used when the counter is active. */
  target?: CameraTarget;
  /**
   * Speak the exercise rule's phone-placement sentence once when the camera opens. Default true.
   * (The "Set up your phone" card itself always shows for a counting exercise.)
   */
  speakPlacement?: boolean;
  /**
   * Developer log for this set (numbers only, on device). Used only with a counting exercise:
   * camera meta, every frame (null = no person), smoothed angle, rep events, speech, fps 1/s.
   */
  recorder?: DevLogRecorder | null;
  /** Every speech decision (spoken or dropped), for the developer log. */
  onSpeech?: (s: SpeechReport) => void;
  /**
   * M5c: keep the sheet open across the exercise's sets with auto start/stop. Only used with a
   * counting exercise. Without it the view behaves exactly as before (camera per set).
   */
  handsFree?: HandsFreeOptions;
  /**
   * M5 focus cues (counting exercises only): the set's fired cue ids so far, one entry per
   * detection. Called once at the set's first counted rep (with [] when nothing fired yet; on an
   * auto start, right after onAutoStart) and after every cue. Dispatch SET_FOCUS { cues }.
   */
  onFocus?: (cues: FocusCueId[]) => void;
};

/**
 * One speech decision. `t` is performance.now() (ms). `dropped` is set when a hint was not
 * spoken: 'rate' (< 6 s since the last hint), 'stale' (> 1.5 s late), 'superseded' (a newer hint
 * replaced it while waiting) or 'interrupted' (a count cut it off mid-sentence).
 */
export type SpeechReport = {
  t: number;
  text: string;
  kind: 'count' | 'hint' | 'placement';
  dropped?: DropReason;
};

/** How long a partial-rep hint stays on screen (unless the next full rep clears it). */
const COACH_SHOW_MS = 4000;

const WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
  'Twenty',
];

/** "Set 2 of 3 · 8–12 reps". */
function setLineText(target: CameraTarget): string {
  const range =
    target.minReps !== undefined && target.minReps < target.targetReps
      ? `${target.minReps}–${target.targetReps}`
      : String(target.targetReps);
  return `Set ${target.setNumber} of ${target.sets} · ${range} reps`;
}

/** "One", "Two", … for spoken counts; digits past twenty (speech reads them fine). */
function repWord(n: number): string {
  return WORDS[n] ?? String(n);
}

export type RepPanel = {
  readonly el: HTMLElement;
  /** False while the person is missing or not tracked yet (the "Step into frame" state). */
  readonly inFrame: boolean;
  /** Feed one detector result (null = no person found). Returns the counter's events. */
  update(frame: LandmarkFrame | null): RepEvent[];
  reset(): void;
  /**
   * Hands-free rest mode: the counter keeps counting (events still returned and logged) but says
   * nothing, shows no hints and calls no onCount.
   */
  quiet: boolean;
  /**
   * Counts shown/spoken/reported are the counter's minus this base (an auto-started set shows
   * autoSet's counts, not reps the counter saw earlier in rest). Reset() clears it.
   */
  setBase(reps: number, partials: number): void;
  /**
   * Hands-free hold: show these counts whatever the counter does (null = live again). Combine
   * with `quiet` so the counter runs silently underneath.
   */
  freeze(counts: { reps: number; partials: number } | null): void;
  /** New set number / planned reps (hands-free: the sheet stays open across sets). */
  setTarget(target: CameraTarget): void;
  /** Speak the count word for `reps` now (the first word of an auto-started set). */
  announce(reps: number): void;
  /** Stops a count word still speaking or queued (closing the sheet, Set done). */
  silence(): void;
  /** Speaks the phone-placement sentence (not rate-limited); the next count word cuts it off. */
  speakPlacement(text: string): void;
  /**
   * M5 focus cue: shown in the coach line (`data-cue`) for COACH_SHOW_MS and spoken as a hint
   * through the same policy as partial hints (6 s gap, never over a count). No-op while quiet.
   */
  cue(id: string, text: string): void;
  /**
   * Range-of-motion gauge (vertical bar), updated with the panel. The camera view puts it on the
   * video's right edge; hidden while the person isn't tracked.
   */
  readonly gauge: HTMLElement;
};

/** Gauge scale: −0.25 (bottom) … 1.25 (top). The start/target lines sit at these % from the top. */
const GAUGE_SPAN = GAUGE_MAX - GAUGE_MIN;
const TARGET_TOP_PCT = ((GAUGE_MAX - 1) / GAUGE_SPAN) * 100;
const START_TOP_PCT = ((GAUGE_MAX - 0) / GAUGE_SPAN) * 100;

type Gauge = { readonly el: HTMLElement; update(counter: RepCounter, present: boolean): void };

/**
 * Vertical range-of-motion bar: start line (bottom), target line (top) for every exercise (the
 * core formula orients it), a fill from the start line to the live smoothed angle, green once
 * this rep reached the target, and an amber line on the mark the last partial missed. Per frame
 * it only writes two transforms; text and data attributes change only when their value does.
 */
function createGauge(): Gauge {
  const fill = h('div', { class: 'gauge-fill' });
  const now = h('div', { class: 'gauge-now' });
  const mark = (which: 'start' | 'target', text: string, topPct: number) =>
    h(
      'div',
      { class: `gauge-mark gauge-${which}`, 'data-mark': which, style: `top: ${topPct}%` },
      h('span', { class: 'gauge-label' }, text),
    );
  const targetMark = mark('target', 'Target', TARGET_TOP_PCT);
  const startMark = mark('start', 'Start', START_TOP_PCT);
  // The 0…1 range box (start line to target line); fill and marker scale/move inside it.
  const range = h(
    'div',
    {
      class: 'gauge-range',
      style: `top: ${TARGET_TOP_PCT}%; height: ${START_TOP_PCT - TARGET_TOP_PCT}%`,
    },
    fill,
    now,
  );
  const track = h('div', { class: 'gauge-track' }, range, targetMark, startMark);
  const angleText = h('p', { class: 'gauge-angle' }, '');
  const el = h(
    'div',
    {
      class: 'rom-gauge',
      'data-gauge': '',
      'data-angle': '',
      'data-gauge-zone': '',
      'data-gauge-reached': 'false',
      'data-gauge-missed': '',
      hidden: true,
    },
    track,
    angleText,
  );
  let shown = false;
  let shownPos = NaN;
  let shownAngle = '';
  let shownZone = '';
  let shownReached: boolean | null = null;
  let shownMissed: string | null = null;

  return {
    el,
    update(counter, present) {
      const reading = present && counter.tracking ? readGauge(counter.rule, counter.angle) : null;
      const visible = reading !== null;
      if (visible !== shown) {
        shown = visible;
        el.hidden = !visible;
      }
      if (!reading) return;
      // Position rounded to 0.1% of the range: skips style writes for sub-pixel jitter.
      const pos = Math.round(reading.position * 1000) / 1000;
      if (pos !== shownPos) {
        shownPos = pos;
        // The fill never flips below the start line; only the marker cap goes there.
        fill.style.transform = `scaleY(${Math.max(0, pos)})`;
        now.style.transform = `translateY(${(1 - pos) * 100}%)`;
      }
      const deg = String(Math.round(reading.angle));
      if (deg !== shownAngle) {
        shownAngle = deg;
        el.dataset.angle = deg;
        angleText.textContent = `${deg}°`;
      }
      if (reading.zone !== shownZone) {
        shownZone = reading.zone;
        el.dataset.gaugeZone = reading.zone;
      }
      const reached = counter.reachedFar;
      if (reached !== shownReached) {
        shownReached = reached;
        el.dataset.gaugeReached = String(reached);
      }
      const missed = missedMark(counter.lastMiss ?? undefined) ?? '';
      if (missed !== shownMissed) {
        shownMissed = missed;
        el.dataset.gaugeMissed = missed;
        targetMark.toggleAttribute('data-missed', missed === 'target');
        startMark.toggleAttribute('data-missed', missed === 'start');
      }
    },
  };
}

/**
 * Live rep counter panel. The side label comes from the counter's landmark side, which is the
 * person's own anatomical side (MediaPipe reads the raw, un-mirrored video). Only the video and
 * skeleton canvas are CSS-mirrored, never this text, so "Right arm" means their right arm.
 */
export function createRepPanel(
  counter: RepCounter,
  limb: 'arm' | 'leg',
  opts: Pick<CameraViewOptions, 'spokenCount' | 'onCount' | 'target' | 'onSpeech'> & {
    /** Clock for the speech policy and hint display (ms). Default performance.now; tests inject one. */
    clock?: () => number;
    /** Every rep/partial event, in order (developer log). */
    onRepEvent?: (ev: RepEvent) => void;
  },
): RepPanel {
  let target = opts.target;
  const num = h('p', { class: 'rep-num', 'data-reps': '0' }, '0');
  const of = target
    ? h('p', { class: 'rep-target', 'data-target': target.targetReps }, `/ ${target.targetReps}`)
    : null;
  const label = h('p', { class: 'rep-label' }, 'reps');
  const setLine = target
    ? h(
        'p',
        { class: 'rep-set', 'data-set': `${target.setNumber}/${target.sets}` },
        setLineText(target),
      )
    : null;
  const side = h('p', { class: 'rep-side', 'data-side': '' });
  const partials = h('p', { class: 'rep-partials', 'data-partials': '0' }, '');
  const hint = h(
    'p',
    { class: 'rep-hint', 'data-hint': 'frame', 'aria-live': 'polite' },
    'Step into frame',
  );
  // The partial-rep coaching hint ("Curl higher."), shown for COACH_SHOW_MS or until the next rep.
  const coach = h('p', { class: 'rep-coach', 'aria-live': 'polite' });
  const el = h(
    'section',
    { class: `rep-panel${target ? ' has-target' : ''}`, 'aria-label': 'Rep counter' },
    h('div', { class: 'rep-count' }, num, of, label),
    setLine,
    h('div', { class: 'rep-info' }, side, hint, coach, partials),
  );
  const gauge = createGauge();
  let shownReps = -1;
  let shownPartials = -1;
  let shownSide = '';
  let shownHint = '';
  let inFrame = false;
  let quiet = false;
  let baseReps = 0;
  let basePartials = 0;
  let frozen: { reps: number; partials: number } | null = null;
  const shownCounts = () =>
    frozen ?? {
      reps: Math.max(0, counter.reps - baseReps),
      partials: Math.max(0, counter.partials - basePartials),
    };

  const sideText = (s: RepCounter['side']): string => {
    if (!s) return '';
    const part = limb === 'arm' ? 'arm' : 'leg';
    if (s === 'both') return `Both ${part}s`;
    return `${s === 'left' ? 'Left' : 'Right'} ${part}`;
  };

  function render(present: boolean): void {
    const { reps, partials: p } = shownCounts();
    if (reps !== shownReps || p !== shownPartials) {
      if (reps !== shownReps && shownReps >= 0) {
        num.classList.remove('bump');
        void num.offsetWidth; // restart the animation
        num.classList.add('bump');
      }
      shownReps = reps;
      shownPartials = p;
      num.textContent = String(reps);
      num.dataset.reps = String(reps);
      label.textContent = reps === 1 ? 'rep' : 'reps';
      partials.dataset.partials = String(p);
      partials.textContent = p > 0 ? `${p} partial${p === 1 ? '' : 's'}` : '';
      el.classList.toggle('at-target', target !== undefined && reps >= target.targetReps);
    }
    const s = sideText(counter.side);
    if (s !== shownSide) {
      shownSide = s;
      side.textContent = s;
      side.dataset.side = counter.side ?? '';
    }
    const hintKey =
      !present || !counter.tracking ? 'frame' : counter.phase === 'setup' ? 'start' : '';
    inFrame = hintKey !== 'frame';
    if (hintKey !== shownHint) {
      shownHint = hintKey;
      hint.dataset.hint = hintKey;
      hint.textContent =
        hintKey === 'frame'
          ? 'Step into frame'
          : hintKey === 'start'
            ? 'Get into start position'
            : '';
    }
    gauge.update(counter, present);
  }

  // ---- Speech: counts and hints go through the coachSpeech policy (counts win, ≤ 1 hint / 6 s,
  // a hint never starts over a count and is dropped if > 1.5 s late). One monotonic clock
  // (performance.now) for every policy call: frame time restarts on a camera switch.
  const clock = opts.clock ?? (() => performance.now());
  const policy = createCoachSpeech();
  /** The placement sentence still speaking (outside the policy; a count cuts it off). */
  let placementUtt: SpeechSynthesisUtterance | null = null;
  let coachUntil = 0;
  let shownCoach = '';
  /** The coach line shows a focus cue (stays its full time; a new rep doesn't clear it). */
  let coachIsCue = false;

  function report(e: SpeechReport): void {
    opts.onSpeech?.(e);
  }

  function apply(decisions: SpeechDecision[]): void {
    for (const d of decisions) {
      const t = clock();
      if (d.action === 'drop') {
        report({ t, text: d.text, kind: d.kind, dropped: d.reason });
        continue;
      }
      // A count also cuts off the placement sentence, which the policy doesn't know about.
      const cancel = d.kind === 'count' && (d.cancel || placementUtt !== null);
      if (cancel) placementUtt = null;
      const u = voice.speak(d.text, { kind: d.kind, cancel });
      // u.text is the line actually spoken (the drill persona may rewrite hints).
      report({ t, text: u?.text ?? d.text, kind: d.kind });
      if (u) {
        const done = () => apply(policy.ended(d.id, clock()));
        u.addEventListener('end', done);
        u.addEventListener('error', done);
      }
    }
  }

  function showCoach(text: string, reason: string, now: number, cueId?: string): void {
    coach.textContent = text;
    if (cueId) {
      coach.dataset.cue = cueId;
      delete coach.dataset.hintReason;
    } else {
      coach.dataset.hintReason = reason;
      delete coach.dataset.cue;
    }
    coachIsCue = cueId !== undefined;
    shownCoach = text;
    coachUntil = now + COACH_SHOW_MS;
  }

  function clearCoach(): void {
    if (!shownCoach) return;
    shownCoach = '';
    coachIsCue = false;
    coach.textContent = '';
    delete coach.dataset.hintReason;
    delete coach.dataset.cue;
  }

  render(false);
  return {
    el,
    gauge: gauge.el,
    get inFrame() {
      return inFrame;
    },
    update(frame) {
      const now = clock();
      let events: RepEvent[] = [];
      if (frame) {
        const before = { reps: counter.reps, partials: counter.partials };
        events = counter.push(frame);
        for (const ev of events) {
          opts.onRepEvent?.(ev);
          if (quiet) continue;
          if (ev.type === 'rep') {
            if (!coachIsCue) clearCoach(); // a new full rep replaces the last partial hint
            if (opts.spokenCount !== false) apply(policy.count(repWord(ev.index - baseReps), now));
          } else {
            const text = hintFor(counter.rule, ev);
            if (text && ev.reason) {
              showCoach(text, ev.reason, now);
              apply(policy.hint(text, now));
            }
          }
        }
        if (!quiet && (counter.reps !== before.reps || counter.partials !== before.partials)) {
          const c = shownCounts();
          opts.onCount?.(c.reps, c.partials);
        }
      }
      if (shownCoach && now >= coachUntil) clearCoach();
      apply(policy.tick(now));
      render(frame !== null);
      return events;
    },
    reset() {
      counter.reset();
      baseReps = 0;
      basePartials = 0;
      frozen = null;
      clearCoach();
      render(false);
    },
    get quiet() {
      return quiet;
    },
    set quiet(q: boolean) {
      quiet = q;
      if (q) clearCoach();
    },
    setBase(reps, partials) {
      baseReps = reps;
      basePartials = partials;
      render(inFrame);
    },
    freeze(counts) {
      frozen = counts ? { ...counts } : null;
      render(inFrame);
    },
    setTarget(next) {
      target = next;
      if (of) {
        of.textContent = `/ ${next.targetReps}`;
        of.dataset.target = String(next.targetReps);
      }
      if (setLine) {
        setLine.textContent = setLineText(next);
        setLine.dataset.set = `${next.setNumber}/${next.sets}`;
      }
      shownReps = -1; // re-check the at-target colour
      render(inFrame);
    },
    announce(reps) {
      if (opts.spokenCount !== false) apply(policy.count(repWord(reps), clock()));
    },
    silence() {
      if (policy.speaking !== null || policy.pending !== null || placementUtt) voice.cancel();
      policy.reset();
      placementUtt = null;
    },
    cue(id, text) {
      if (quiet) return;
      const now = clock();
      showCoach(text, '', now, id);
      apply(policy.hint(text, now));
    },
    speakPlacement(text) {
      const u = voice.speak(text, { kind: 'cue' });
      report({ t: clock(), text: u?.text ?? text, kind: 'placement' });
      placementUtt = u;
      if (u) {
        const done = () => {
          if (placementUtt === u) placementUtt = null;
        };
        u.addEventListener('end', done);
        u.addEventListener('error', done);
      }
    },
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Original line pictogram: a phone on the left looking at a person, front-on or side-on. */
function placementPictogram(view: 'side' | 'front'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 80');
  svg.setAttribute('class', 'setup-pic');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.view = view;
  const person =
    view === 'front'
      ? // Facing the phone: head, shoulders, both arms, both legs.
        '<circle cx="92" cy="16" r="7"/><path d="M92 23v26M78 30h28M78 30l-4 16M106 30l4 16M92 49l-8 24M92 49l8 24"/>'
      : // Side-on, facing the same way as the phone's view line: one arm forward, nose bump.
        '<circle cx="92" cy="16" r="7"/><path d="M99 15l3 2-3 1M92 23v26M92 30l8 14M92 49l-4 24M92 49l5 24"/>';
  svg.innerHTML =
    '<rect x="8" y="26" width="16" height="28" rx="3" class="pic-phone"/>' +
    '<circle cx="16" cy="31" r="1.6" class="pic-lens"/>' +
    '<path d="M28 40H66" class="pic-sight"/>' +
    `<g class="pic-person">${person}</g>`;
  return svg;
}

/** Simple camera-with-arrows icon for the Switch camera button (original, inline). */
function switchIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  svg.innerHTML =
    '<path d="M4 8h3l2-2h6l2 2h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
    '<path d="M9 12.5a3 3 0 0 1 5.2-2M15 13.5a3 3 0 0 1-5.2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M14.6 8.6l-.4 2 2-.2M9.4 17.4l.4-2-2 .2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}

/** Card stays up until tracking has held this long. */
const SETUP_STABLE_MS = 1500;
/** Card comes back after the person has been out of frame this long. */
const SETUP_LOST_MS = 1000;
/** "Phone position" tapped: keep the card up at least this long even while tracking. */
const SETUP_MANUAL_MS = 8000;

export function createCameraView(opts: CameraViewOptions): CameraView {
  let facing: Facing = 'user';
  let stream: MediaStream | null = null;
  let tracker: PoseTracker | null = null;
  let skeleton: Skeleton3D | null = null;
  let skeletonLoading = false;
  let running = false;
  let loopHandle = 0;
  let t0 = 0;
  /** Date.now() at the same moment as t0, so the log can line frames up with session events. */
  let wallT0 = 0;
  const fps = new FpsMeter();
  let lastStatus = 0;

  const rule = opts.exerciseId ? ruleFor(opts.exerciseId) : undefined;
  const repCounter = rule ? createRepCounter(rule) : null;

  // ---- Developer log: sync buffer writes; a recorder error never breaks the camera loop ----
  const recorder = repCounter ? (opts.recorder ?? null) : null;
  const hf = rule && repCounter ? (opts.handsFree ?? null) : null;
  const autoConfig = hf && rule ? (hf.config ?? autoSetConfigFor(rule)) : null;
  const auto = autoConfig ? createAutoSet(autoConfig) : null;
  if (hf) {
    // Hands-free: setSession() may come before start(), so the frame clock starts now.
    t0 = performance.now();
    wallT0 = Date.now();
  }
  const frameNow = () => performance.now() - t0;
  let mode: 'set' | 'rest' = 'set';
  let banner: AutoStopBannerHandle | null = null;
  /** M5c break: the hold panel while autoSet holds the set, with the hold's backdated end. */
  let holdPanel: HoldPanelHandle | null = null;
  let heldEndedAt = 0;
  /** Counts frozen at the hold (Continue resumes the shown count from them). */
  let heldCounts = { reps: 0, partials: 0 };
  /** Last "Tap Continue to count." (frame clock), at most once per HOLD_REMIND_MS. */
  let holdRemindAt = -Infinity;
  /** The next commit comes from "Start next set" on the hold panel (→ onHoldNext). */
  let holdNextTap = false;
  const HOLD_REMIND_MS = 10_000;
  let restPanel: CameraRestPanelHandle | null = null;
  let disposed = false;
  let recWarned = false;
  function rec(write: (r: DevLogRecorder) => void): void {
    if (!recorder) return;
    try {
      write(recorder);
    } catch (err) {
      if (!recWarned) {
        recWarned = true;
        console.warn('Developer log write failed; camera keeps running.', err);
      }
    }
  }
  let recSide: string | null = null;
  let recFpsAt = -Infinity;

  // ---- M5 focus tracker: one per sheet (counting exercises only), reset at every set start ----
  /** The session as last told by setSession (also without hands-free). */
  let sessionPaused = false;
  let sessionPhase: CameraSession['phase'] = 'exercise';
  /** Top of the planned range ("/ 12"): the stalled cue's "N to go"; 0 = unknown (no stalled). */
  let targetTop = opts.target?.targetReps ?? 0;
  /** Set number / planned sets (the hold panel's Save set on the exercise's last set). */
  let curTarget = opts.target;
  let focus: FocusTracker | null = null;
  let focusFlagsKey = '';
  let focusView: string | null = null;
  /** Cues fired by an earlier tracker of this set (re-created when the view's flags changed). */
  let focusCarried: FocusCueId[] = [];
  /** The set's counted rep events (seed included), to re-seed a re-created tracker. */
  let setRepEvents: RepEvent[] = [];
  /** onFocus has been called for this set (at its first counted rep). */
  let focusReported = false;
  /** Hands-free rest mode: recent rep events, to seed an auto-started set. */
  let restEvents: RepEvent[] = [];
  /** Events already seeded into the tracker this tick (not fed again). */
  let seededNow: ReadonlySet<RepEvent> | null = null;
  const REST_SEED_MS = 8000;

  const focusFired = (): FocusCueId[] => [...focusCarried, ...(focus?.fired ?? [])];

  /**
   * Creates the tracker, or re-creates it when the counter settled on a view whose flags differ
   * (push-up front variant). A re-created tracker is re-seeded with the set's reps so far.
   */
  function syncFocusTracker(): void {
    if (!rule || !repCounter) return;
    const view = repCounter.rule.view;
    if (focus && view === focusView) return;
    focusView = view;
    const flags = focusFlagsFor(rule, repCounter.rule);
    const key = JSON.stringify(flags);
    if (focus && key === focusFlagsKey) return;
    focusFlagsKey = key;
    const old = focus;
    focus = createFocusTracker(rule, { flags, targetReps: targetTop, autoSet: autoConfig });
    if (old) {
      focusCarried = [...focusCarried, ...old.fired];
      focus.reset({ targetReps: targetTop, seed: setRepEvents });
    }
  }

  /** A set starts (camera open, manual Start set, auto start with its starting reps). */
  function startFocusSet(seed: readonly RepEvent[] = []): void {
    syncFocusTracker();
    if (!focus) return;
    focusCarried = [];
    focusReported = false;
    setRepEvents = seed.filter((e) => e.type === 'rep');
    restEvents = [];
    seededNow = seed.length ? new Set(seed) : null;
    focus.reset({ targetReps: targetTop, seed });
  }

  const round1 = (v: number) => Math.round(v * 10) / 10;

  function onFocusCue(cue: FocusCue): void {
    counter?.cue(cue.id, cue.text);
    // Enum + numbers only (frame clock t); the spoken text is in the speech log.
    rec((r) =>
      r.logEvent('focusCue', {
        id: cue.id,
        t: Math.round(cue.t),
        reps: cue.reps,
        value: round1(cue.value),
        baseline: cue.baseline === null ? null : round1(cue.baseline),
        threshold: round1(cue.threshold),
      }),
    );
    // Only sets with ≥ 1 counted rep are scored (a lone low-fps cue before rep 1 waits for it).
    if (sessionPhase === 'exercise' && !sessionPaused && setRepEvents.length > 0) {
      focusReported = true;
      opts.onFocus?.(focusFired());
    }
  }

  /** Feed one camera tick to the focus tracker (after the counter and autoSet). */
  function feedFocus(frame: LandmarkFrame | null, ft: number, events: readonly RepEvent[]): void {
    if (!focus || !repCounter) return;
    syncFocusTracker();
    const seeded = seededNow;
    seededNow = null;
    const fresh = seeded ? events.filter((e) => !seeded.has(e)) : events;
    const autoState = auto ? auto.state : 'off';
    // Reps seen while held don't belong to the set (they're never counted).
    if (mode === 'set' && autoState !== 'rest' && autoState !== 'held') {
      for (const e of fresh) if (e.type === 'rep') setRepEvents.push(e);
    }
    const cues = focus.push({
      t: ft,
      present: frame !== null && personInFrame(frame),
      tracking: frame !== null && repCounter.tracking,
      // No pose at all: nothing is visible (the counter wasn't fed this tick).
      untracked: frame ? repCounter.untracked : 'visibility',
      phase: repCounter.phase,
      angle: repCounter.angle,
      sides: frame ? repCounter.sideAngles : null,
      frame,
      view: repCounter.rule.view,
      side: repCounter.side,
      events: fresh,
      fps: fps.fps,
      autoState,
      paused: sessionPaused,
    });
    for (const cue of cues) onFocusCue(cue);
    if (
      !focusReported &&
      mode === 'set' &&
      sessionPhase === 'exercise' &&
      !sessionPaused &&
      setRepEvents.length > 0
    ) {
      focusReported = true;
      opts.onFocus?.(focusFired());
    }
  }

  const counter =
    rule && repCounter
      ? createRepPanel(repCounter, rule.limb, {
          ...opts,
          onRepEvent: (ev) => rec((r) => r.repEvent(ev)),
          onSpeech: (e) => {
            opts.onSpeech?.(e);
            rec((r) =>
              r.speech({
                t: e.t - t0, // frame clock, like frames and angles
                text: e.text,
                kind: e.kind,
                ...(e.dropped ? { dropped: e.dropped } : {}),
              }),
            );
          },
        })
      : null;
  // Where to put the phone for this exercise (rule data); none for the Settings camera test.
  const placement = rule?.placement;

  // Video and overlay share one box and one `object-fit: cover`, so the canvas (sized to the
  // video's pixels) is cropped and mirrored exactly like the video and the skeleton stays on the
  // person. Only the display is cropped: inference reads the full video frame.
  const video = h('video', { class: 'cam-video', playsinline: true, muted: true });
  const overlay = h('canvas', { class: 'cam-overlay' });
  const status = h('p', { class: 'cam-status', 'aria-live': 'polite' }, 'Starting camera…');

  // ---- "Set up your phone" card ----
  let setupOpen = Boolean(placement);
  let stableSince: number | null = null;
  let lostSince: number | null = null;
  let holdUntil = 0;
  // "Got it" tapped: don't bring the card back until the person has been in frame and lost again.
  let dismissed = false;
  const setupCard = placement
    ? h(
        'section',
        { class: 'cam-setup', 'aria-label': 'Set up your phone', 'data-setup': 'open' },
        h(
          'div',
          { class: 'setup-head' },
          placementPictogram(placement.view),
          h('h2', { class: 'setup-title' }, 'Set up your phone'),
        ),
        ...placement.lines.slice(0, 3).map((l) => h('p', { class: 'setup-line' }, l)),
        h(
          'button',
          {
            class: 'ghost-btn setup-hide',
            onclick: () => {
              dismissed = true;
              showSetup(false);
              setupBtn?.focus();
            },
          },
          'Got it',
        ),
      )
    : null;
  const setupBtn = placement
    ? h(
        'button',
        {
          class: 'cam-chip setup-open',
          hidden: true,
          onclick: () => {
            holdUntil = performance.now() + SETUP_MANUAL_MS;
            showSetup(true);
          },
        },
        'Phone position',
      )
    : null;

  function showSetup(open: boolean): void {
    if (!setupCard || !setupBtn) return;
    setupOpen = open;
    stage.classList.toggle('setup-open', open);
    setupCard.hidden = !open;
    setupCard.dataset.setup = open ? 'open' : 'closed';
    setupBtn.hidden = open;
  }

  /** Auto show/hide: hides once tracking is stable, comes back when the person is lost. */
  function updateSetup(inFrame: boolean, now: number): void {
    if (!setupCard) return;
    if (inFrame) {
      lostSince = null;
      dismissed = false;
      stableSince ??= now;
      if (setupOpen && now - stableSince >= SETUP_STABLE_MS && now >= holdUntil) showSetup(false);
    } else {
      stableSince = null;
      lostSince ??= now;
      if (!setupOpen && !dismissed && now - lostSince >= SETUP_LOST_MS) showSetup(true);
    }
  }

  // ---- 3D live skeleton: collapsed by default, loaded on first open ----
  const skelSlot = h('div', { class: 'skeleton-slot' });
  const presetBtn = (p: SkeletonPreset, label: string) =>
    h(
      'button',
      {
        class: `seg-btn small-seg${p === 'front' ? ' active' : ''}`,
        'data-preset': p,
        onclick: () => {
          skeleton?.setPreset(p);
          panel3d
            .querySelectorAll('[data-preset]')
            .forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.preset === p));
        },
      },
      label,
    );
  const panel3d = h(
    'section',
    { class: 'cam-3d', 'aria-label': '3D skeleton', hidden: true },
    skelSlot,
    h('div', { class: 'cam-presets' }, presetBtn('front', 'Front'), presetBtn('side', 'Side')),
  );
  const btn3d = h(
    'button',
    {
      class: 'ghost-btn cam-3d-btn',
      'aria-expanded': 'false',
      'aria-label': '3D skeleton',
      onclick: () => void toggle3d(),
    },
    '3D',
  );

  async function toggle3d(): Promise<void> {
    const open = panel3d.hidden !== false;
    panel3d.hidden = !open;
    btn3d.setAttribute('aria-expanded', String(open));
    if (!open) {
      skeleton?.dispose();
      skeleton = null;
      skelSlot.replaceChildren();
      return;
    }
    if (skeleton || skeletonLoading) return;
    skeletonLoading = true;
    try {
      const sk = await import('./skeleton3d');
      if (!running || panel3d.hidden) return;
      skeleton = sk.createSkeleton3D();
      skelSlot.append(skeleton.el);
      const active = panel3d.querySelector<HTMLElement>('[data-preset].active');
      skeleton.setPreset((active?.dataset.preset as SkeletonPreset | undefined) ?? 'front');
    } finally {
      skeletonLoading = false;
    }
  }

  const switchBtn = h(
    'button',
    {
      class: 'cam-icon-btn cam-switch',
      'aria-label': 'Switch camera',
      onclick: () => void switchCamera(),
    },
    switchIcon(),
  );

  // Range-of-motion gauge on the right edge of the video (counting exercises only; the Settings
  // camera test leaves the slot empty). Hidden while the set-up card is up (it spans the width).
  const gaugeSlot = h('div', { class: 'cam-gauge-slot', 'aria-hidden': 'true' }, counter?.gauge);

  // Count + target on the video. Its height feeds --hud-h so the set-up card never covers it.
  const hud = counter ? h('div', { class: 'cam-hud' }, counter.el) : null;
  const hudObserver =
    hud && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => stage.style.setProperty('--hud-h', `${hud.offsetHeight}px`))
      : null;
  if (hud) hudObserver?.observe(hud);

  const setDoneBtn = counter
    ? h(
        'button',
        {
          class: 'primary-btn',
          onclick: () => {
            // Silence first so a late count word can't cut off the rest cue that follows.
            counter.silence();
            // Hands-free Undo window or hold: save at once, with the same backdated end.
            if (auto?.state === 'pending' || auto?.state === 'held') {
              handleAuto(auto.confirm(frameNow()));
              return;
            }
            opts.onSetDone?.();
          },
        },
        'Set done',
      )
    : null;

  const closeSheet = () => {
    counter?.silence();
    // Hands-free Undo window or hold: Close saves the set as the window would have (backdated).
    if (auto?.state === 'pending' || auto?.state === 'held') handleAuto(auto.confirm(frameNow()));
    if (disposed) return;
    opts.onClose();
  };

  const stage = h(
    'div',
    { class: `cam-stage${setupOpen ? ' setup-open' : ''}`, 'data-facing': facing },
    video,
    overlay,
    hud,
    gaugeSlot,
    setupCard,
    h('div', { class: 'cam-stage-bottom' }, setupBtn, switchBtn),
  );

  const el = h(
    'div',
    {
      class: `overlay sheet camera-sheet${counter ? ' counting' : ''}`,
      role: 'dialog',
      'data-cam-mode': 'set',
      'aria-label': 'Camera',
    },
    h(
      'header',
      { class: 'top-bar cam-top' },
      h('p', { class: 'page-title small-title cam-title' }, opts.title),
      btn3d,
      h('button', { class: 'ghost-btn', onclick: closeSheet }, 'Close'),
    ),
    stage,
    panel3d,
    h(
      'footer',
      { class: 'cam-bottom' },
      status,
      !counter && h('p', { class: 'muted cam-privacy' }, 'On-device only. Nothing is recorded.'),
      setDoneBtn,
    ),
  );

  function setStatus(text: string, data: Record<string, string> = {}): void {
    status.textContent = text;
    Object.assign(el.dataset, data);
  }

  // ---- M5c hands-free: set mode ⇄ rest mode, auto start/stop, Undo window, idle close ----

  /** A short spoken confirmation; queued after any count word (never cancels it). */
  function say(text: string): void {
    const u = voice.speak(text, { kind: 'cue' });
    // Log what was actually said (the drill persona may rewrite it).
    rec((r) => r.speech({ t: frameNow(), text: u?.text ?? text, kind: 'cue' }));
  }

  /** Dev log: one `autoSet` event per action, enum words and numbers only (wall-clock t). */
  function logAuto(a: AutoSetAction): void {
    const reason = 'reason' in a ? a.reason : undefined;
    const counts = 'reps' in a ? { reps: a.reps, partials: a.partials } : {};
    const ft = frameNow();
    rec((r) =>
      r.logEvent('autoSet', {
        action: a.type,
        ...(reason ? { reason } : {}),
        ...counts,
        ft: Math.round(ft),
        ...(a.type === 'start' ? { atFt: Math.round(a.at) } : {}),
        ...(a.type === 'stopPending' || a.type === 'commit' || a.type === 'hold'
          ? { endedAtFt: Math.round(a.endedAt) }
          : {}),
        ...(a.type === 'holdEnded' ? { how: a.how } : {}),
        phase: repCounter?.phase,
        angle: repCounter?.angle == null ? null : Math.round(repCounter.angle * 10) / 10,
      }),
    );
  }

  /** Unmount the hold panel and show the live count again (the counter stays as it is). */
  function dropHold(): void {
    const p = holdPanel;
    holdPanel = null;
    counter?.freeze(null);
    p?.dispose();
  }

  function showHold(a: Extract<AutoSetAction, { type: 'hold' }>): void {
    if (!counter || !auto) return;
    dropHold();
    heldEndedAt = a.endedAt;
    heldCounts = { reps: a.reps, partials: a.partials };
    holdRemindAt = -Infinity;
    counter.freeze(heldCounts);
    counter.quiet = true; // counts on silently underneath; no hints, no focus cues
    const lastSet = curTarget !== undefined && curTarget.setNumber >= curTarget.sets;
    const p = createHoldPanel({
      reps: a.reps,
      partials: a.partials,
      lastSet,
      reason: a.reason,
      onContinue: () => handleAuto(auto.continueSet(frameNow())),
      onNext: () => {
        if (lastSet) {
          handleAuto(auto.confirm(frameNow()));
          return;
        }
        holdNextTap = true;
        try {
          handleAuto(auto.nextSet(frameNow()));
        } finally {
          holdNextTap = false;
        }
      },
      focusAfter: focusTarget,
    });
    holdPanel = p;
    stage.append(p.el);
    p.setClock(frameNow() - a.endedAt);
  }

  /** Where focus goes when the banner or rest panel takes away the focused control. */
  function focusTarget(): HTMLElement | null {
    if (mode === 'rest')
      return restPanel?.el.querySelector<HTMLElement>('[data-cam-rest="start"]') ?? null;
    return setDoneBtn;
  }

  function dropBanner(): void {
    const b = banner;
    banner = null;
    b?.dispose();
  }

  function enterRestMode(): void {
    if (!counter || !hf) return;
    const focusWasOnSetDone = document.activeElement === setDoneBtn;
    mode = 'rest';
    el.classList.add('rest-mode');
    el.dataset.camMode = 'rest';
    counter.reset();
    counter.quiet = true;
    restPanel ??= createCameraRestPanel({ onStartSet: () => hf.onStartSet(), onClose: closeSheet });
    stage.append(restPanel.el);
    dropHold();
    dropBanner(); // focus moves to Start set if it was on Undo
    if (focusWasOnSetDone) focusTarget()?.focus();
  }

  function enterSetMode(): void {
    if (!counter) return;
    const hadFocus = restPanel?.el.contains(document.activeElement) ?? false;
    mode = 'set';
    el.classList.remove('rest-mode');
    el.dataset.camMode = 'set';
    restPanel?.dispose(); // releases the app's coach tip / Fix elements
    restPanel = null;
    counter.quiet = false;
    if (hadFocus) setDoneBtn?.focus();
  }

  /**
   * Frame-clock time → wall clock, measured from now (not wallT0 + t): performance.now() can
   * stop advancing while iOS suspends the page, so the offset from wallT0 drifts.
   */
  function toWall(frameT: number): number {
    return Date.now() - (frameNow() - frameT);
  }

  function handleAuto(actions: AutoSetAction[]): void {
    if (!hf || !counter || !repCounter || !autoConfig) return;
    for (const a of actions) {
      if (disposed) return;
      logAuto(a);
      switch (a.type) {
        case 'start': {
          enterSetMode();
          // The starting reps (rest mode, since the backdated start) seed the focus baseline.
          const startReps = restEvents
            .filter((e) => e.type === 'rep' && e.t >= a.at)
            .slice(-a.reps);
          // Show autoSet's counts: reps the counter saw earlier in rest don't belong to the set.
          counter.setBase(repCounter.reps - a.reps, repCounter.partials - a.partials);
          hf.onAutoStart({ at: toWall(a.at), frameT: a.at, reps: a.reps, partials: a.partials });
          if (disposed) return;
          startFocusSet(startReps); // after onAutoStart: the app's setSession has the new target
          opts.onCount?.(a.reps, a.partials);
          counter.announce(a.reps); // the first word of the set ("Two")
          break;
        }
        case 'stopPending': {
          dropBanner();
          const b = createAutoStopBanner({
            reps: a.reps,
            partials: a.partials,
            seconds: autoConfig.undoSec,
            reason: a.reason,
            onUndo: () => handleAuto(auto?.undo(frameNow()) ?? []),
            onGone: () => {
              if (banner === b) banner = null;
            },
            focusAfter: focusTarget,
          });
          banner = b;
          stage.append(b.el);
          b.tick(a.until - frameNow());
          say(`Set done. ${a.reps} ${a.reps === 1 ? 'rep' : 'reps'}.`);
          hf.onStopPending?.({
            reason: a.reason,
            reps: a.reps,
            partials: a.partials,
            endedAt: toWall(a.endedAt),
            until: toWall(a.until),
          });
          break;
        }
        case 'hold': {
          dropBanner();
          showHold(a);
          // A cue, also with the spoken count off; queued after a count word, never cancelling it.
          say('Set on hold. Tap to continue.');
          hf.onHold?.({
            reason: a.reason,
            reps: a.reps,
            partials: a.partials,
            endedAt: toWall(a.endedAt),
          });
          break;
        }
        case 'holdEnded': {
          // The count resumes from N: reps the counter saw while held are absorbed in the base.
          dropHold();
          counter.setBase(
            repCounter.reps - heldCounts.reps,
            repCounter.partials - heldCounts.partials,
          );
          counter.quiet = false;
          say('Keep going.');
          break;
        }
        case 'stopCancelled': {
          if (a.reason === 'paused') dropBanner();
          else {
            banner?.keepGoing(); // no-op after an Undo tap (already showing it)
            say('Keep going.');
          }
          hf.onStopCancelled?.({ reason: a.reason });
          break;
        }
        case 'commit': {
          const b = banner;
          const wasHeld = holdPanel !== null;
          const e = { endedAt: toWall(a.endedAt), reps: a.reps, partials: a.partials };
          dropHold();
          const next = holdNextTap && hf.onHoldNext !== undefined;
          holdNextTap = false;
          if (next) hf.onHoldNext?.(e);
          else hf.onCommit(e);
          if (disposed) return;
          // The app normally switched to rest mode (quiet counter) or closed the sheet. If it
          // went straight to the next set (Start next set), start it here: live, from 0.
          if (wasHeld && mode === 'set') {
            counter.quiet = false;
            if (next) {
              counter.reset();
              startFocusSet();
            }
          }
          if (banner === b) dropBanner();
          break;
        }
        case 'close': {
          dropBanner();
          counter.silence();
          halt();
          say('Camera off.');
          setStatus('Camera off.', { person: 'false' });
          hf.onIdleClose(a.reason);
          return;
        }
      }
    }
  }

  function loop(): void {
    if (!running || !tracker) return;
    if (video.readyState >= 2) {
      if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
      }
      const now = performance.now();
      const ft = now - t0; // frame clock, also the counter's clock
      const frame = tracker.detect(video, ft);
      fps.tick(now);
      drawOverlay(overlay, frame);
      rec((r) => r.frame(frame, ft));
      const events = counter?.update(frame) ?? [];
      if (mode === 'rest' && events.length) {
        restEvents = [...restEvents, ...events].filter((e) => e.t >= ft - REST_SEED_MS);
      }
      if (auto && repCounter) {
        handleAuto(
          auto.push({
            t: ft,
            tracking: frame !== null && repCounter.tracking,
            present: frame !== null && personInFrame(frame),
            // No pose: unknown (null), never a posture / body-line break.
            untracked: frame !== null ? repCounter.untracked : null,
            phase: repCounter.phase,
            angle: repCounter.angle,
            events,
          }),
        );
        if (!running) return; // idle close, or the app closed the sheet in a callback
        if (banner && auto.pendingUntil !== null) banner.tick(auto.pendingUntil - ft);
        if (holdPanel && auto.state === 'held') {
          holdPanel.setClock(ft - heldEndedAt);
          if (events.some((e) => e.type === 'rep') && ft - holdRemindAt >= HOLD_REMIND_MS) {
            holdRemindAt = ft;
            say('Tap Continue to count.');
          }
        }
      }
      feedFocus(frame, ft, events);
      if (!running) return; // onFocus dispatches into the app; never tick a closed sheet
      if (recorder && repCounter) {
        const side = repCounter.side;
        rec((r) => {
          r.angle(ft, repCounter.angle);
          if (side !== recSide) {
            recSide = side;
            r.camera({ side });
          }
          if (now - recFpsAt >= 1000) {
            recFpsAt = now;
            r.fps(ft, fps.fps);
          }
        });
      }
      updateSetup(counter ? counter.inFrame : frame !== null, now);
      skeleton?.update(frame?.world, facing === 'user');
      if (now - lastStatus > 250) {
        lastStatus = now;
        const f = fps.fps;
        setStatus(
          `${f.toFixed(0)} fps · ${tracker.delegate} · ${frame ? 'tracking' : 'no person in view'}`,
          { fps: f.toFixed(1), delegate: tracker.delegate, person: String(Boolean(frame)) },
        );
      }
    }
    schedule();
  }

  function schedule(): void {
    if (!running) return;
    if ('requestVideoFrameCallback' in video) {
      loopHandle = video.requestVideoFrameCallback(() => loop());
    } else {
      loopHandle = requestAnimationFrame(() => loop());
    }
  }

  async function switchCamera(): Promise<void> {
    facing = facing === 'user' ? 'environment' : 'user';
    stage.dataset.facing = facing;
    // Counted reps survive a camera switch: the counter itself handles a re-zeroed or jumping
    // frame clock (t backwards → back to setup, counts kept; > 500 ms gap → reseed), so we just
    // keep feeding it frames. Only start() resets, before the first frame of the sheet.
    stopStream(stream);
    try {
      stream = await openCamera(video, facing);
    } catch (err) {
      setStatus(`Camera error: ${(err as Error).message}`);
    }
  }

  function releaseStream(): void {
    stopStream(stream);
    stream = null;
    video.srcObject = null;
  }

  /** Stops the loop, the camera tracks and the model; the sheet stays (idle close, stop()). */
  function halt(): void {
    running = false;
    if ('cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(loopHandle);
    cancelAnimationFrame(loopHandle);
    stopStream(stream);
    stream = null;
    video.srcObject = null;
    tracker?.close();
    tracker = null;
    skeleton?.dispose();
    skeleton = null;
  }

  return {
    el,
    async start() {
      running = true;
      // Start the frame clock first, so everything logged (the placement sentence included) is
      // on it; wallT0 links it to the wall clock.
      if (!hf) {
        t0 = performance.now();
        wallT0 = Date.now();
      }
      try {
        stream = await openCamera(video, facing);
      } catch (err) {
        const name = (err as Error).name;
        setStatus(
          name === 'NotAllowedError'
            ? 'Camera blocked. Allow camera access for this site in your browser settings.'
            : `Camera error: ${(err as Error).message}`,
          { error: name },
        );
        return;
      }
      if (!running) {
        // stop() ran while the camera was opening: release the stream it just got.
        releaseStream();
        return;
      }
      if (counter && placement && opts.speakPlacement !== false) {
        // The panel owns it: the first count word (or Set done / Close) cuts it off.
        counter.speakPlacement(placement.spoken);
      }
      setStatus('Loading pose model…');
      try {
        const { createPoseTracker } = await import('../pose/landmarker');
        if (!running) {
          releaseStream();
          return;
        }
        tracker = await createPoseTracker('GPU');
      } catch (err) {
        setStatus(`Pose model failed to load: ${(err as Error).message}`, { error: 'model' });
        return;
      }
      if (!running) {
        // stop() ran while the model was loading: free its GL context and the stream.
        tracker.close();
        tracker = null;
        releaseStream();
        return;
      }
      // Fresh sheet: nothing counted yet, so no onCount(0, 0). Camera switches don't reset.
      counter?.reset();
      startFocusSet();
      const delegate = tracker.delegate;
      if (rule) rec((r) => r.camera({ folder: rule.folder, delegate, side: null, wallT0 }));
      recSide = null;
      setStatus(`Tracking · ${tracker.delegate}`, { delegate: tracker.delegate });
      schedule();
    },
    stop() {
      counter?.silence();
      halt();
      disposed = true;
      dropHold();
      dropBanner();
      restPanel?.dispose();
      restPanel = null;
      hudObserver?.disconnect();
      el.remove();
    },
    setSession(session) {
      if (disposed) return;
      sessionPaused = session.paused;
      sessionPhase = session.phase;
      if (session.target) {
        targetTop = session.target.targetReps;
        curTarget = session.target;
      }
      if (!auto || !counter) return;
      if (session.target) counter.setTarget(session.target);
      const actions = auto.setSession(
        { phase: session.phase, paused: session.paused, restElapsedMs: session.restElapsedMs },
        frameNow(),
      );
      if (session.phase === 'rest') {
        if (mode !== 'rest') enterRestMode();
      } else if (session.phase === 'exercise' && mode === 'rest') {
        // A manual Start set (an auto start has already switched to set mode).
        enterSetMode();
        counter.reset();
        startFocusSet();
      }
      handleAuto(actions);
    },
    setRest(update) {
      if (mode === 'rest') restPanel?.update(update);
    },
    setBegun() {
      if (!rule || !repCounter) return;
      const side = repCounter.side;
      recSide = side;
      rec((r) =>
        r.camera({
          folder: rule.folder,
          side,
          wallT0,
          ...(tracker ? { delegate: tracker.delegate } : {}),
        }),
      );
    },
    get mode() {
      return mode;
    },
  };
}
