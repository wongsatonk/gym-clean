import { describe, expect, it } from 'vitest';
import { ADVICE_BANNED_WORDS } from './advice';
import { AUTO_SET_DEFAULTS, createAutoSet, type AutoSet, type AutoSetAction } from './autoSet';
import { ruleFor, ruleForFolder, type ExerciseRule } from './exercises';
import { FpsMeter } from './fps';
import {
  CUE_TEXT,
  FOCUS_DEFAULTS,
  createFocusTracker,
  cueText,
  type FocusCue,
  type FocusInput,
  type FormMeasures,
  type FocusRuleFlags,
  type FocusTracker,
} from './focus';
import { LANDMARK, LANDMARK_COUNT } from './poseTopology';
import { createRepCounter, type RepPhase } from './repCounter';
import type { FocusCueId, LandmarkFrame, RepEvent } from './types';

// ---------------------------------------------------------------------------------------------
// A stream simulator shaped like the camera loop: counter snapshots at 30 fps (or an irregular
// 15–30 fps with dropped frames), with rep events on the frame where the counter completes them.
// Curl-like: the out leg (top → bottom) is the lift, the way back is the lowering (eccentric).
// ---------------------------------------------------------------------------------------------

function curlRule(): ExerciseRule {
  const r = ruleFor('Dumbbell_Bicep_Curl');
  if (!r) throw new Error('no curl rule');
  return r;
}
const CURL = curlRule();

const ALL_FOCUS: FocusRuleFlags = {
  rushedLowering: true,
  shrinkingRange: true,
  stalled: true,
  outOfFrame: true,
  lowFps: true,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RepOpts = {
  eccMs?: number;
  conMs?: number;
  min?: number;
  max?: number;
  holdMs?: number;
  /** Dwell at the far band (ms). */
  farMs?: number;
  type?: 'rep' | 'partial';
};

/** A fixed input, or one computed per frame from the phase and the progress u (0 → 1). */
type Input = Partial<FocusInput> | ((phase: RepPhase, u: number) => Partial<FocusInput>);
function resolve(input: Input, phase: RepPhase, u: number): Partial<FocusInput> {
  return typeof input === 'function' ? input(phase, u) : input;
}

type SimOpts = {
  /** Frame-rate range; a fixed rate when both ends are equal. */
  fps?: [number, number];
  /** Share of frames dropped (never pushed). */
  drop?: number;
  seed?: number;
  /** Also run an autoSet machine on the same frames (hands-free). */
  auto?: AutoSet;
};

class Sim {
  t = 1000;
  phase: RepPhase = 'top';
  cues: FocusCue[] = [];
  actions: { t: number; action: AutoSetAction }[] = [];
  reps = 0;
  partials = 0;
  /** t of the latest rep/partial event. */
  lastEventT = 0;
  /** Defaults merged into every input. */
  base: Partial<FocusInput> = {};
  private rnd: () => number;
  private fpsRange: [number, number];
  private drop: number;
  private meter = new FpsMeter();
  useMeter = false;

  constructor(
    public tr: FocusTracker,
    private opts: SimOpts = {},
  ) {
    this.rnd = mulberry32(opts.seed ?? 1);
    this.fpsRange = opts.fps ?? [30, 30];
    this.drop = opts.drop ?? 0;
    if (opts.fps || opts.drop) this.useMeter = true;
  }

  private dt(): number {
    const [lo, hi] = this.fpsRange;
    const fps = lo + (hi - lo) * this.rnd();
    return 1000 / fps;
  }

  /** Push one frame at the current t (never dropped) and advance. */
  frame(input: Partial<FocusInput> = {}, force = false): FocusCue[] {
    const dropped = !force && this.drop > 0 && this.rnd() < this.drop;
    let out: FocusCue[] = [];
    if (!dropped) {
      this.meter.tick(this.t);
      const full: FocusInput = {
        t: this.t,
        present: true,
        tracking: true,
        untracked: null,
        phase: this.phase,
        events: [],
        fps: this.useMeter ? this.meter.fps : 30,
        autoState: 'off',
        paused: false,
        ...this.base,
        ...input,
      };
      if (full.untracked !== null) full.tracking = false;
      if (this.opts.auto) {
        for (const action of this.opts.auto.push({
          t: full.t,
          tracking: full.tracking,
          present: full.present,
          phase: full.phase,
          events: full.events,
        }))
          this.actions.push({ t: full.t, action });
        if (input.autoState === undefined && this.base.autoState === undefined)
          full.autoState = this.opts.auto.state;
      }
      out = this.tr.push(full);
      this.cues.push(...out);
    }
    this.t += this.dt();
    return out;
  }

  /**
   * Frames for `ms` at the current phase (or `phase`). `input` may be a function of the phase
   * and the progress u (0 → 1) through the hold, for per-frame geometry.
   */
  hold(ms: number, input: Input = {}, phase?: RepPhase): void {
    if (phase) this.phase = phase;
    const start = this.t;
    const end = this.t + ms;
    while (this.t < end) this.frame(resolve(input, this.phase, (this.t - start) / ms));
  }

  /** One rep (or partial): lift, a short dwell, the lowering, the event, then a hold at the top. */
  rep(o: RepOpts = {}, input: Input = {}): void {
    const ecc = o.eccMs ?? 2000;
    const con = o.conMs ?? 1000;
    const type = o.type ?? 'rep';
    this.hold(con, input, 'down');
    this.hold(o.farMs ?? 100, input, 'bottom');
    this.hold(ecc, input, 'up');
    this.phase = 'top';
    const index = type === 'rep' ? ++this.reps : ++this.partials;
    const ev: RepEvent = {
      type,
      index,
      t: this.t,
      eccentricMs: ecc,
      concentricMs: con,
      minAngle: o.min ?? 50,
      maxAngle: o.max ?? 160,
      ...(type === 'partial' ? { reason: 'far' as const } : {}),
    };
    this.lastEventT = this.t;
    this.frame({ ...resolve(input, 'top', 0), events: [ev] }, true);
    this.hold(o.holdMs ?? 800, input);
  }

  ids(): FocusCueId[] {
    return this.cues.map((c) => c.id);
  }
}

function tracker(
  flags: FocusRuleFlags = ALL_FOCUS,
  targetReps = 12,
  handsFree = false,
): FocusTracker {
  return createFocusTracker(CURL, {
    flags,
    targetReps,
    autoSet: handsFree ? AUTO_SET_DEFAULTS : null,
  });
}

function rushed(flags: FocusRuleFlags = { rushedLowering: true }): FocusTracker {
  return tracker(flags);
}

function handsFreeSim(target = 12): Sim {
  const auto = createAutoSet(AUTO_SET_DEFAULTS);
  auto.setSession({ phase: 'exercise', paused: false, restElapsedMs: 0 }, 0);
  return new Sim(tracker(ALL_FOCUS, target, true), { auto });
}

// ---------------------------------------------------------------------------------------------

describe('cue texts', () => {
  const ids = Object.keys(CUE_TEXT) as FocusCueId[];

  it('has a text for every cue id', () => {
    expect(ids.sort()).toEqual(
      [
        'armsOutOfSync',
        'bodySwing',
        'elbowDrift',
        'hipSag',
        'lowFps',
        'outOfFrame',
        'raiseTooHigh',
        'rushedLowering',
        'shrinkingRange',
        'stalled',
      ].sort(),
    );
  });

  it('uses the SPEC wording', () => {
    expect(CUE_TEXT.rushedLowering).toBe('Slow the lowering.');
    expect(CUE_TEXT.shrinkingRange).toBe('Full range.');
    expect(CUE_TEXT.outOfFrame).toBe('Step back into frame.');
    expect(CUE_TEXT.lowFps).toBe('Move closer to the light.');
    expect(cueText('stalled', 3)).toBe('Stay with it. 3 to go.');
    expect(cueText('rushedLowering', 3)).toBe('Slow the lowering.');
  });

  it('every text is ≤ 6 words (stalled with a two-digit N) and has no banned word', () => {
    for (const id of ids) {
      const text = cueText(id, 12);
      expect(text.split(/\s+/).filter(Boolean).length, text).toBeLessThanOrEqual(6);
      for (const w of ADVICE_BANNED_WORDS) expect(text.toLowerCase(), text).not.toContain(w);
    }
  });
});

describe('rushed lowering', () => {
  it('fires at 49% of the baseline eccentric time on 2 reps in a row', () => {
    const s = new Sim(rushed());
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 980 });
    expect(s.cues).toEqual([]);
    s.rep({ eccMs: 980 });
    expect(s.ids()).toEqual(['rushedLowering']);
    const c = s.cues[0];
    expect(c).toMatchObject({
      id: 'rushedLowering',
      reps: 4,
      value: 980,
      baseline: 2000,
      threshold: 1000,
      text: 'Slow the lowering.',
    });
    expect(s.tr.fired).toEqual(['rushedLowering']);
  });

  it('does not fire at 51%', () => {
    const s = new Sim(rushed());
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 2000 });
    for (let i = 0; i < 6; i++) s.rep({ eccMs: 1020 });
    expect(s.cues).toEqual([]);
  });

  it('baseline is the mean of the first 2 reps, which are never judged', () => {
    const s = new Sim(rushed());
    s.rep({ eccMs: 600 });
    s.rep({ eccMs: 3000 }); // baseline 1800 → threshold 900
    s.rep({ eccMs: 890 });
    s.rep({ eccMs: 890 });
    expect(s.cues).toMatchObject([{ id: 'rushedLowering', baseline: 1800, threshold: 900 }]);
  });

  it('1 rushed rep alone does not fire; a clean rep breaks the streak', () => {
    const s = new Sim(rushed());
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 700 });
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 700 });
    s.rep({ eccMs: 2000 });
    expect(s.cues).toEqual([]);
  });

  it('a partial between two rushed reps keeps the streak (and never counts itself)', () => {
    const s = new Sim(rushed());
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 700 });
    s.rep({ eccMs: 3000, type: 'partial' });
    expect(s.cues).toEqual([]);
    s.rep({ eccMs: 700 });
    expect(s.ids()).toEqual(['rushedLowering']);
    expect(s.cues[0]?.reps).toBe(4);
  });

  it('rushed partials neither extend a streak nor serve as the baseline', () => {
    const s = new Sim(rushed());
    s.rep({ eccMs: 300, type: 'partial' });
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 700 });
    s.rep({ eccMs: 300, type: 'partial' });
    s.rep({ eccMs: 300, type: 'partial' });
    expect(s.cues).toEqual([]);
  });

  it('fires at most twice per set, the streak restarting after each fire', () => {
    const s = new Sim(rushed());
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 2000 });
    for (let i = 0; i < 8; i++) s.rep({ eccMs: 700 });
    expect(s.cues.map((c) => c.reps)).toEqual([4, 6]);
    expect(s.tr.fired).toEqual(['rushedLowering', 'rushedLowering']);
  });

  it('a new set (reset) clears fired, counts and baseline', () => {
    const s = new Sim(rushed());
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 700 });
    s.rep({ eccMs: 700 });
    expect(s.tr.fired).toEqual(['rushedLowering']);
    s.tr.reset({ targetReps: 12 });
    expect(s.tr.fired).toEqual([]);
    // New baseline from this set's reps: 700 ms is now normal.
    s.rep({ eccMs: 700 });
    s.rep({ eccMs: 700 });
    s.rep({ eccMs: 700 });
    s.rep({ eccMs: 700 });
    expect(s.tr.fired).toEqual([]);
  });

  it('a seeded baseline (auto-started set) judges the first pushed reps', () => {
    const tr = rushed();
    const seed: RepEvent[] = [
      {
        type: 'rep',
        index: 1,
        t: 0,
        eccentricMs: 2000,
        concentricMs: 1000,
        minAngle: 50,
        maxAngle: 160,
      },
      {
        type: 'partial',
        index: 1,
        t: 10,
        eccentricMs: 200,
        concentricMs: 300,
        minAngle: 120,
        maxAngle: 160,
        reason: 'far',
      },
      {
        type: 'rep',
        index: 2,
        t: 20,
        eccentricMs: 2200,
        concentricMs: 1000,
        minAngle: 50,
        maxAngle: 160,
      },
    ];
    tr.reset({ targetReps: 12, seed });
    const s = new Sim(tr);
    s.rep({ eccMs: 1000 });
    expect(s.cues).toEqual([]);
    s.rep({ eccMs: 1000 });
    expect(s.cues).toMatchObject([{ id: 'rushedLowering', reps: 4, baseline: 2100 }]);
  });

  it('a false or missing flag never fires', () => {
    for (const flags of [{ rushedLowering: false }, {}] as FocusRuleFlags[]) {
      const s = new Sim(tracker(flags));
      s.rep({ eccMs: 2000 });
      s.rep({ eccMs: 2000 });
      for (let i = 0; i < 6; i++) s.rep({ eccMs: 500, min: 120 });
      expect(s.cues).toEqual([]);
    }
  });
});

describe('shrinking range', () => {
  const flags: FocusRuleFlags = { shrinkingRange: true };

  it('fires at 84% of the baseline range on 2 reps in a row', () => {
    const s = new Sim(tracker(flags));
    s.rep({ min: 50, max: 150 });
    s.rep({ min: 50, max: 150 }); // baseline 100
    s.rep({ min: 66, max: 150 });
    expect(s.cues).toEqual([]);
    s.rep({ min: 66, max: 150 });
    expect(s.cues).toMatchObject([
      {
        id: 'shrinkingRange',
        reps: 4,
        value: 84,
        baseline: 100,
        threshold: 85,
        text: 'Full range.',
      },
    ]);
  });

  it('does not fire at 86%', () => {
    const s = new Sim(tracker(flags));
    s.rep({ min: 50, max: 150 });
    s.rep({ min: 50, max: 150 });
    for (let i = 0; i < 6; i++) s.rep({ min: 64, max: 150 });
    expect(s.cues).toEqual([]);
  });

  it('fires at most twice per set', () => {
    const s = new Sim(tracker(flags));
    s.rep({ min: 50, max: 150 });
    s.rep({ min: 50, max: 150 });
    for (let i = 0; i < 8; i++) s.rep({ min: 90, max: 150 });
    expect(s.cues.map((c) => c.reps)).toEqual([4, 6]);
  });
});

describe('priority (one cue per frame)', () => {
  it('rushed lowering beats shrinking range on the same rep; range fires on its next bad rep', () => {
    const s = new Sim(tracker({ rushedLowering: true, shrinkingRange: true }));
    s.rep({ eccMs: 2000, min: 50, max: 150 });
    s.rep({ eccMs: 2000, min: 50, max: 150 });
    s.rep({ eccMs: 700, min: 80, max: 150 });
    s.rep({ eccMs: 700, min: 80, max: 150 });
    expect(s.cues.map((c) => [c.id, c.reps])).toEqual([['rushedLowering', 4]]);
    s.rep({ eccMs: 2000, min: 80, max: 150 });
    expect(s.cues.map((c) => [c.id, c.reps])).toEqual([
      ['rushedLowering', 4],
      ['shrinkingRange', 5],
    ]);
  });

  it('out of frame beats low fps when both are due on the same frame', () => {
    const tr = createFocusTracker(CURL, {
      flags: ALL_FOCUS,
      targetReps: 12,
      autoSet: null,
      config: { lowFpsSec: 2 },
    });
    const s = new Sim(tr);
    s.rep();
    s.hold(5000, { fps: 10, untracked: 'visibility' });
    expect(s.ids().slice(0, 2)).toEqual(['outOfFrame', 'lowFps']);
    const [a, b] = s.cues;
    expect(a && b && b.t > a.t).toBe(true);
    expect(b && a && b.t - a.t).toBeLessThan(40); // the very next frame
  });

  it('push returns at most one cue', () => {
    const s = new Sim(tracker());
    s.rep();
    s.hold(1000, { fps: 10 });
    const lens: number[] = [];
    for (let i = 0; i < 200; i++) lens.push(s.frame({ fps: 10, untracked: 'visibility' }).length);
    expect(Math.max(...lens)).toBe(1);
  });
});

describe('stalled', () => {
  const firstStalled = (s: Sim) => s.cues.find((c) => c.id === 'stalled');

  it('hands-free on, in the start band: no cue (the still stop decides)', () => {
    const s = handsFreeSim();
    s.rep();
    s.rep();
    s.rep();
    s.hold(12_000, {}, 'top');
    expect(firstStalled(s)).toBeUndefined();
    expect(s.actions.map((a) => a.action.type)).toContain('stopPending');
  });

  it('hands-free on, out of the band: cue at 5 s, and the stalled stop still comes at 10 s', () => {
    const s = handsFreeSim();
    s.rep();
    s.rep();
    s.rep();
    s.phase = 'bottom';
    const from = s.t;
    s.hold(11_000);
    const c = firstStalled(s);
    expect(c).toBeDefined();
    expect((c?.t ?? 0) - from).toBeGreaterThanOrEqual(5000);
    expect((c?.t ?? 0) - from).toBeLessThan(5100);
    expect(c?.text).toBe('Stay with it. 9 to go.');
    expect(c).toMatchObject({ reps: 3, threshold: 5000, baseline: null });
    const stop = s.actions.find((a) => a.action.type === 'stopPending');
    expect(stop?.action).toMatchObject({ reason: 'stalled' });
    expect((stop?.t ?? 0) - from).toBeGreaterThanOrEqual(10_000);
    expect((stop?.t ?? 0) - from).toBeLessThan(10_100);
  });

  for (const phase of ['top', 'bottom'] as const) {
    it(`hands-free off: cue at 8 s, anywhere (${phase})`, () => {
      const s = new Sim(tracker(ALL_FOCUS, 12, false));
      s.rep({ holdMs: 0 });
      // The activity is the event (top) or the phase change (bottom).
      const from = phase === 'top' ? s.lastEventT : s.t;
      s.phase = phase;
      s.hold(7900 - (s.t - from));
      expect(firstStalled(s)).toBeUndefined();
      s.hold(300);
      const c = firstStalled(s);
      expect((c?.t ?? 0) - from).toBeGreaterThanOrEqual(8000);
      expect(c?.text).toBe('Stay with it. 11 to go.');
    });
  }

  it('hands-free on with fewer than stopMinReps reps: the 8 s timing, also in the band', () => {
    const s = handsFreeSim();
    s.rep();
    const from = s.lastEventT;
    s.hold(9000, {}, 'top');
    const c = firstStalled(s);
    expect((c?.t ?? 0) - from).toBeGreaterThanOrEqual(8000);
    expect((c?.t ?? 0) - from).toBeLessThan(8100);
  });

  it('a phase change or an event restarts the timer', () => {
    const s = new Sim(tracker());
    s.rep();
    s.hold(6000, {}, 'top');
    s.hold(500, {}, 'down');
    s.hold(6000, {}, 'bottom');
    s.rep({ type: 'partial' });
    s.hold(6000);
    expect(firstStalled(s)).toBeUndefined();
  });

  it('no cue before the first rep, and none once reps reach the target', () => {
    const a = new Sim(tracker(ALL_FOCUS, 3));
    a.hold(20_000, {}, 'bottom');
    expect(firstStalled(a)).toBeUndefined();
    const b = new Sim(tracker(ALL_FOCUS, 3));
    b.rep();
    b.rep();
    b.rep();
    b.hold(20_000, {}, 'bottom');
    expect(firstStalled(b)).toBeUndefined();
  });

  it('fires at most once per set; a new set can fire again', () => {
    const s = new Sim(tracker());
    s.rep();
    s.hold(9000, {}, 'bottom');
    s.hold(500, {}, 'up');
    s.hold(9000, {}, 'bottom');
    expect(s.ids().filter((id) => id === 'stalled')).toHaveLength(1);
    s.tr.reset({ targetReps: 12 });
    s.rep();
    s.hold(9000, {}, 'bottom');
    expect(s.ids().filter((id) => id === 'stalled')).toHaveLength(2);
  });

  it('nobody in frame is not a stall', () => {
    const s = new Sim(tracker({ stalled: true }));
    s.rep();
    s.hold(20_000, { present: false, tracking: false, untracked: 'visibility' }, 'bottom');
    expect(s.cues).toEqual([]);
  });
});

describe('out of frame', () => {
  const oof = (s: Sim) => s.cues.filter((c) => c.id === 'outOfFrame');

  it('present but the visibility gate fails for 2 s → cue', () => {
    const s = new Sim(tracker());
    s.rep();
    const from = s.t;
    s.hold(1900, { untracked: 'visibility' });
    expect(oof(s)).toEqual([]);
    s.hold(300, { untracked: 'visibility' });
    const c = oof(s)[0];
    expect((c?.t ?? 0) - from).toBeGreaterThanOrEqual(2000);
    expect(c).toMatchObject({ text: 'Step back into frame.', threshold: 2000, baseline: null });
  });

  it('a posture or body-line gate failure never cues', () => {
    for (const untracked of ['posture', 'bodyLine'] as const) {
      const s = new Sim(tracker());
      s.rep();
      s.hold(10_000, { untracked });
      expect(oof(s)).toEqual([]);
    }
  });

  it('absent with hands-free on and ≥ 2 reps → none (the away stop speaks instead)', () => {
    const s = handsFreeSim();
    s.rep();
    s.rep();
    s.hold(10_000, { present: false, untracked: 'visibility' });
    expect(oof(s)).toEqual([]);
    expect(s.actions.find((a) => a.action.type === 'stopPending')?.action).toMatchObject({
      reason: 'away',
    });
  });

  it('absent with hands-free off → cue after 2 s', () => {
    const s = new Sim(tracker());
    s.rep();
    s.rep();
    const from = s.t;
    s.hold(3000, { present: false, untracked: 'visibility' });
    const c = oof(s)[0];
    expect((c?.t ?? 0) - from).toBeGreaterThanOrEqual(2000);
    expect((c?.t ?? 0) - from).toBeLessThan(2100);
  });

  it('absent with hands-free on but 1 rep (no auto stop can follow) → cue after 2 s', () => {
    const s = handsFreeSim();
    s.rep();
    s.hold(3000, { present: false, untracked: 'visibility' });
    expect(oof(s)).toHaveLength(1);
  });

  it('before the first rep → none', () => {
    const s = new Sim(tracker());
    s.hold(10_000, { untracked: 'visibility' });
    s.hold(10_000, { present: false, untracked: 'visibility' });
    expect(oof(s)).toEqual([]);
  });

  it('needs the joints back in view before it can fire again; at most twice per set', () => {
    const s = new Sim(tracker({ outOfFrame: true }));
    s.rep();
    s.hold(10_000, { untracked: 'visibility' });
    expect(oof(s)).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      s.hold(500);
      s.hold(2500, { untracked: 'visibility' });
    }
    expect(oof(s)).toHaveLength(2);
  });

  it('a short hidden spell (1.5 s) between reps is not a cue', () => {
    const s = new Sim(tracker());
    s.rep();
    s.hold(1500, { untracked: 'visibility' });
    s.rep();
    s.hold(1500, { present: false, untracked: 'visibility' });
    s.rep();
    expect(s.cues).toEqual([]);
  });
});

describe('low fps', () => {
  const low = (s: Sim) => s.cues.filter((c) => c.id === 'lowFps');

  it('fires after 3 s below 15 fps, once per tracker, also across reset', () => {
    const s = new Sim(tracker());
    const from = s.t;
    s.hold(2900, { fps: 12 });
    expect(low(s)).toEqual([]);
    s.hold(300, { fps: 12 });
    const c = low(s)[0];
    expect((c?.t ?? 0) - from).toBeGreaterThanOrEqual(3000);
    expect(c).toMatchObject({ value: 12, threshold: 15, baseline: null });
    expect(s.tr.fired).toEqual(['lowFps']);
    s.hold(500, { fps: 30 });
    s.hold(5000, { fps: 12 });
    s.tr.reset({ targetReps: 12 });
    expect(s.tr.fired).toEqual([]);
    s.hold(5000, { fps: 12 });
    expect(low(s)).toHaveLength(1);
  });

  it('a dip under 3 s, or an unknown rate (0 / null), does not fire', () => {
    const s = new Sim(tracker());
    for (let i = 0; i < 5; i++) {
      s.hold(2500, { fps: 10 });
      s.hold(100, { fps: 20 });
    }
    s.hold(5000, { fps: 0 });
    s.hold(5000, { fps: null });
    expect(low(s)).toEqual([]);
  });

  it('is not judged in rest or while paused (set mode only)', () => {
    const s = new Sim(tracker());
    s.hold(5000, { fps: 10, autoState: 'rest' });
    s.hold(5000, { fps: 10, paused: true });
    expect(low(s)).toEqual([]);
  });
});

describe('quiet states', () => {
  for (const blocked of [
    { autoState: 'rest' },
    { autoState: 'pending' },
    { autoState: 'closed' },
    { paused: true },
  ] as Partial<FocusInput>[]) {
    it(`nothing fires with ${JSON.stringify(blocked)}`, () => {
      const s = new Sim(tracker());
      s.rep({ eccMs: 2000 });
      s.rep({ eccMs: 2000 });
      s.base = blocked;
      s.rep({ eccMs: 500, min: 120 });
      s.rep({ eccMs: 500, min: 120 });
      s.rep({ eccMs: 500, min: 120 });
      s.hold(10_000, { fps: 5 }, 'bottom');
      s.hold(10_000, { untracked: 'visibility' });
      s.hold(10_000, { present: false, untracked: 'visibility' });
      expect(s.cues).toEqual([]);
    });
  }

  it('paused time does not count toward stalled or out of frame', () => {
    const s = new Sim(tracker());
    s.rep();
    s.hold(5000, { paused: true }, 'bottom');
    s.hold(7000, {}, 'bottom');
    s.hold(1500, { paused: true, untracked: 'visibility' });
    s.hold(1500, { untracked: 'visibility' });
    expect(s.cues).toEqual([]);
  });

  it('reps in the Undo window still count toward the target ("N to go")', () => {
    const s = new Sim(tracker());
    s.rep();
    s.rep();
    s.rep({}, { autoState: 'pending' });
    s.hold(9000, {}, 'bottom');
    expect(s.cues.find((c) => c.id === 'stalled')?.text).toBe('Stay with it. 9 to go.');
  });
});

describe('real-data-like noise gives no cue', () => {
  for (const handsFree of [false, true]) {
    for (const seed of [1, 2, 3]) {
      it(`hands-free ${handsFree ? 'on' : 'off'}, seed ${seed}`, () => {
        const auto = handsFree ? createAutoSet(AUTO_SET_DEFAULTS) : undefined;
        auto?.setSession({ phase: 'exercise', paused: false, restElapsedMs: 0 }, 0);
        const s = new Sim(tracker(ALL_FOCUS, 12, handsFree), {
          fps: [15, 30],
          drop: 0.1,
          seed,
          ...(auto ? { auto } : {}),
        });
        const rnd = mulberry32(seed + 100);
        const j = (x: number, frac: number) => x * (1 + (rnd() * 2 - 1) * frac);
        for (let i = 0; i < 10; i++) {
          // Tempo ±15%, both ends of the range ±5°.
          s.rep({
            eccMs: j(1800, 0.15),
            conMs: j(900, 0.15),
            min: 50 + (rnd() * 2 - 1) * 5,
            max: 160 + (rnd() * 2 - 1) * 5,
            holdMs: j(700, 0.3),
          });
          if (i === 4) s.hold(450, { untracked: 'visibility' }); // a 450 ms tracking gap
          if (i === 6) s.hold(1, { present: false, untracked: 'visibility' }); // 1–2 lost frames
          if (i === 7) s.t += 450; // a 450 ms hole with no frames at all
        }
        expect(s.cues).toEqual([]);
      });
    }
  }
});

describe('config', () => {
  it('has the plan defaults', () => {
    expect(FOCUS_DEFAULTS).toMatchObject({
      baselineReps: 2,
      rushedRatio: 0.5,
      rangeRatio: 0.85,
      streakReps: 2,
      maxFiresPerRule: 2,
      stalledSec: 8,
      stalledHandsFreeFraction: 0.5,
      outOfFrameSec: 2,
      lowFps: 15,
      lowFpsSec: 3,
      armsOutOfSyncDeg: 20,
      armsOutOfSyncSec: 0.5,
      raiseTooHighDeg: 120,
      elbowDriftDeg: 25,
      bodySwingDeg: 15,
      hipSagMinDeg: 160,
      formHoldSec: 0.2,
    });
  });

  it('a config override changes the edges', () => {
    const tr = createFocusTracker(CURL, {
      flags: { rushedLowering: true },
      targetReps: 12,
      autoSet: null,
      config: { rushedRatio: 0.3 },
    });
    const s = new Sim(tr);
    s.rep({ eccMs: 2000 });
    s.rep({ eccMs: 2000 });
    for (let i = 0; i < 4; i++) s.rep({ eccMs: 700 });
    expect(s.cues).toEqual([]);
  });

  it('a frame clock that restarts does not fire timers', () => {
    const s = new Sim(tracker());
    s.rep();
    s.hold(5000, {}, 'bottom');
    s.t = 0; // new stream
    s.hold(4000, {}, 'bottom');
    expect(s.cues).toEqual([]);
    s.hold(4500, {}, 'bottom');
    expect(s.ids()).toEqual(['stalled']);
  });
});

// ---------------------------------------------------------------------------------------------
// Part 2: form rules (geometry). Landmark frames are built from a few body angles, in world
// coordinates (x forward, y down, z to the right), like repCounter.test builds angle curves.
// ---------------------------------------------------------------------------------------------

function mustRule(id: string): ExerciseRule {
  const r = ruleFor(id);
  if (!r) throw new Error(`no rule for ${id}`);
  return r;
}
const RAISE = mustRule('Side_Lateral_Raise');
const PUSH_UP = mustRule('Pushups');

const FORM_IDS: readonly FocusCueId[] = [
  'armsOutOfSync',
  'raiseTooHigh',
  'elbowDrift',
  'bodySwing',
  'hipSag',
];

type Body = {
  /** Torso tilt forward from its rest direction (deg). */
  lean?: number;
  /** Upper arm (shoulder → elbow) forward of the torso line (deg), both arms. */
  arm?: number;
  /** Shoulder–hip–ankle angle (deg; 180 = straight). */
  hip?: number;
  /** Left-side overrides (the far side of a side view can read nonsense at high visibility). */
  armL?: number;
  hipL?: number;
  /** Visibility of the left / right landmarks. */
  visL?: number;
  visR?: number;
  noWorld?: boolean;
};

type V3 = { x: number; y: number; z: number };
const add = (a: V3, b: V3, k = 1): V3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
/** Rotate an x-y vector by `deg` from down (+y) toward forward (+x). */
function rot(v: V3, deg: number): V3 {
  const th = (deg * Math.PI) / 180;
  return {
    x: v.x * Math.cos(th) + v.y * Math.sin(th),
    y: -v.x * Math.sin(th) + v.y * Math.cos(th),
    z: v.z,
  };
}

function bodyFrame(t: number, b: Body = {}): LandmarkFrame {
  const L = LANDMARK;
  const lean = ((b.lean ?? 0) * Math.PI) / 180;
  const up: V3 = { x: Math.sin(lean), y: -Math.cos(lean), z: 0 };
  const down: V3 = { x: -up.x, y: -up.y, z: 0 };
  const world: V3[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0, y: -0.6, z: 0 }));
  const vis: number[] = Array.from({ length: LANDMARK_COUNT }, () => 0.9);
  const sides = [
    {
      z: -0.18,
      v: b.visL ?? 0.95,
      s: L.LEFT_SHOULDER,
      e: L.LEFT_ELBOW,
      w: L.LEFT_WRIST,
      h: L.LEFT_HIP,
      k: L.LEFT_KNEE,
      a: L.LEFT_ANKLE,
    },
    {
      z: 0.18,
      v: b.visR ?? 0.95,
      s: L.RIGHT_SHOULDER,
      e: L.RIGHT_ELBOW,
      w: L.RIGHT_WRIST,
      h: L.RIGHT_HIP,
      k: L.RIGHT_KNEE,
      a: L.RIGHT_ANKLE,
    },
  ];
  for (const sd of sides) {
    const left = sd.s === L.LEFT_SHOULDER;
    const armDeg = (left ? b.armL : undefined) ?? b.arm ?? 5;
    const hipDeg = (left ? b.hipL : undefined) ?? b.hip ?? 178;
    const hip: V3 = { x: 0, y: 0, z: sd.z };
    const sh = add(hip, up, 0.5);
    const armDir = rot(down, armDeg);
    const el = add(sh, armDir, 0.3);
    const wr = add(el, rot(down, armDeg + 90), 0.25);
    const legDir = rot(down, 180 - hipDeg);
    world[sd.s] = sh;
    world[sd.e] = el;
    world[sd.w] = wr;
    world[sd.h] = hip;
    world[sd.k] = add(hip, legDir, 0.45);
    world[sd.a] = add(hip, legDir, 0.9);
    for (const i of [sd.s, sd.e, sd.w, sd.h, sd.k, sd.a]) vis[i] = sd.v;
  }
  const landmarks = world.map((p, i) => ({
    x: 0.5 + p.x / 2,
    y: 0.5 + p.y / 2,
    z: 0,
    visibility: vis[i] ?? 0,
  }));
  const frame: LandmarkFrame = { t, landmarks };
  if (!b.noWorld) frame.world = world;
  return frame;
}

function formTracker(rule: ExerciseRule, flags: FocusRuleFlags, config = {}): Sim {
  return new Sim(createFocusTracker(rule, { flags, targetReps: 20, autoSet: null, config }));
}

/** Per-frame input: a body frame at the Sim's current t, from the phase and progress u. */
function geo(s: Sim, fn: (phase: RepPhase, u: number) => Body) {
  return (phase: RepPhase, u: number): Partial<FocusInput> => ({
    frame: bodyFrame(s.t, fn(phase, u)),
  });
}

/** Half a second at the start position, as a real stream settles before the first rep. */
function settle(s: Sim, b: Body = {}): void {
  s.hold(
    500,
    geo(s, () => b),
    'top',
  );
}

const LIFT_CURL: readonly RepPhase[] = ['down', 'bottom'];
const MID: readonly RepPhase[] = ['down', 'bottom', 'up'];

describe('form: arms out of sync', () => {
  /** Per-side angles: left = right + diff during `phases`, equal elsewhere. */
  const sides =
    (diff: number, phases: readonly RepPhase[] = MID) =>
    (phase: RepPhase): Partial<FocusInput> => ({
      sides: { left: 50 + (phases.includes(phase) ? diff : 0), right: 50 },
    });

  it('fires when |L − R| > 20° is held mid-rep on 2 reps in a row (21° fires, 20° not)', () => {
    const s = formTracker(RAISE, { armsOutOfSync: true });
    s.rep({}, sides(21));
    expect(s.cues).toEqual([]);
    s.rep({}, sides(21));
    expect(s.cues).toMatchObject([
      { id: 'armsOutOfSync', reps: 2, baseline: null, threshold: 20, text: 'Both arms together.' },
    ]);
    expect(s.cues[0]?.value).toBeCloseTo(21, 5);

    const quiet = formTracker(RAISE, { armsOutOfSync: true });
    for (let i = 0; i < 6; i++) quiet.rep({}, sides(20));
    expect(quiet.cues).toEqual([]);
    expect(quiet.tr.lastForm?.armsOutOfSync).toBeCloseTo(20, 5);
  });

  it('works with either arm ahead', () => {
    const s = formTracker(RAISE, { armsOutOfSync: true });
    s.rep({}, sides(-25));
    s.rep({}, sides(-25));
    expect(s.ids()).toEqual(['armsOutOfSync']);
  });

  it('needs the gap held ≥ 0.5 s: a 0.4 s gap does not fire, 0.55 s does', () => {
    const spell =
      (ms: number) =>
      (phase: RepPhase, u: number): Partial<FocusInput> => {
        // The gap opens at the start of the far dwell and lasts `ms` (dwell is 1000 ms).
        const on = phase === 'bottom' && u * 1000 < ms;
        return { sides: { left: on ? 80 : 50, right: 50 } };
      };
    const short = formTracker(RAISE, { armsOutOfSync: true });
    for (let i = 0; i < 4; i++) short.rep({ farMs: 1000 }, spell(400));
    expect(short.cues).toEqual([]);
    const long = formTracker(RAISE, { armsOutOfSync: true });
    for (let i = 0; i < 2; i++) long.rep({ farMs: 1000 }, spell(560));
    expect(long.ids()).toEqual(['armsOutOfSync']);
  });

  it('only mid-rep counts: a gap at the start position never fires', () => {
    const s = formTracker(RAISE, { armsOutOfSync: true });
    for (let i = 0; i < 4; i++) s.rep({ holdMs: 2000 }, sides(40, ['top']));
    expect(s.cues).toEqual([]);
  });

  it('one bad rep does not fire; bad, clean, bad does not either', () => {
    const s = formTracker(RAISE, { armsOutOfSync: true });
    s.rep({}, sides(30));
    s.rep({}, sides(0));
    s.rep({}, sides(30));
    s.rep({}, sides(0));
    expect(s.cues).toEqual([]);
  });

  it('a hidden arm is unknown: no fire, and it breaks the streak', () => {
    const s = formTracker(RAISE, { armsOutOfSync: true });
    s.rep({}, sides(30));
    s.rep({}, () => ({ sides: { left: null, right: 50 } }));
    s.rep({}, sides(30));
    s.rep({}, () => ({ sides: null }));
    expect(s.cues).toEqual([]);
    expect(s.tr.lastForm?.armsOutOfSync).toBeNull();
  });
});

describe('form: raise too high', () => {
  // Threshold 120° (Wongsaton's answer (1), 2026-11-13: clearly above shoulder height).
  it('fires on a rep maxAngle > 120° on 2 reps in a row (121 fires; 120 and 119 not)', () => {
    const s = formTracker(RAISE, { raiseTooHigh: true });
    s.rep({ min: 20, max: 121 });
    s.rep({ min: 20, max: 121 });
    expect(s.cues).toMatchObject([
      { id: 'raiseTooHigh', reps: 2, value: 121, threshold: 120, text: 'Stop at shoulder height.' },
    ]);
    for (const max of [120, 119]) {
      const quiet = formTracker(RAISE, { raiseTooHigh: true });
      for (let i = 0; i < 6; i++) quiet.rep({ min: 20, max });
      expect(quiet.cues).toEqual([]);
    }
  });

  it('the old 100–119° band no longer fires', () => {
    const s = formTracker(RAISE, { raiseTooHigh: true });
    for (let i = 0; i < 6; i++) s.rep({ min: 20, max: 101 + i * 3 });
    expect(s.cues).toEqual([]);
  });

  it('one high rep does not fire; partials neither extend nor break the streak', () => {
    const s = formTracker(RAISE, { raiseTooHigh: true });
    s.rep({ min: 20, max: 130 });
    s.rep({ min: 20, max: 90 });
    s.rep({ min: 20, max: 130 });
    s.rep({ min: 20, max: 140, type: 'partial' });
    expect(s.cues).toEqual([]);
    s.rep({ min: 20, max: 130 });
    expect(s.ids()).toEqual(['raiseTooHigh']);
  });
});

describe('form: elbow drift', () => {
  it('fires when the upper arm swings > 25° away from where the lift started, 2 reps (26 fires, 24 not)', () => {
    const s = formTracker(CURL, { elbowDrift: true });
    settle(s);
    s.rep(
      {},
      geo(s, (p) => ({ arm: LIFT_CURL.includes(p) ? 31 : 5 })),
    );
    expect(s.cues).toEqual([]);
    s.rep(
      {},
      geo(s, (p) => ({ arm: LIFT_CURL.includes(p) ? 31 : 5 })),
    );
    expect(s.cues).toMatchObject([
      { id: 'elbowDrift', reps: 2, threshold: 25, text: 'Keep your elbow still.' },
    ]);
    expect(s.cues[0]?.value).toBeCloseTo(26, 3);

    const quiet = formTracker(CURL, { elbowDrift: true });
    settle(quiet);
    for (let i = 0; i < 6; i++)
      quiet.rep(
        {},
        geo(quiet, (p) => ({ arm: LIFT_CURL.includes(p) ? 29 : 5 })),
      );
    expect(quiet.cues).toEqual([]);
    expect(quiet.tr.lastForm?.elbowDrift).toBeCloseTo(24, 3);
  });

  it('a steady arm angle (the world model reads a hanging arm at 17–29° on the clean curl) is no drift', () => {
    const s = formTracker(CURL, { elbowDrift: true });
    for (let i = 0; i < 4; i++)
      s.rep(
        {},
        geo(s, () => ({ arm: 40 })),
      );
    expect(s.cues).toEqual([]);
    expect(s.tr.lastForm?.elbowDrift).toBeCloseTo(0, 3);
  });

  it('the arm moving closer to the torso line is not a drift', () => {
    const s = formTracker(CURL, { elbowDrift: true });
    for (let i = 0; i < 4; i++)
      s.rep(
        {},
        geo(s, (p) => ({ arm: LIFT_CURL.includes(p) ? 0 : 40 })),
      );
    expect(s.cues).toEqual([]);
  });

  it('a swing only during the lowering is not judged', () => {
    const s = formTracker(CURL, { elbowDrift: true });
    for (let i = 0; i < 4; i++)
      s.rep(
        {},
        geo(s, (p) => ({ arm: p === 'up' ? 45 : 5 })),
      );
    expect(s.cues).toEqual([]);
  });

  it('a one-frame glitch is not a drift', () => {
    const s = formTracker(CURL, { elbowDrift: true });
    for (let i = 0; i < 4; i++)
      s.rep(
        {},
        geo(s, (p, u) => ({ arm: p === 'down' && u > 0.5 && u < 0.54 ? 60 : 5 })),
      );
    expect(s.cues).toEqual([]);
  });

  it('hidden arms or no world landmarks are unknown (no fire)', () => {
    const hidden = formTracker(CURL, { elbowDrift: true });
    for (let i = 0; i < 4; i++)
      hidden.rep(
        {},
        geo(hidden, () => ({ arm: 40, visL: 0.3, visR: 0.3 })),
      );
    expect(hidden.cues).toEqual([]);
    expect(hidden.tr.lastForm?.elbowDrift).toBeNull();
    const flat = formTracker(CURL, { elbowDrift: true });
    for (let i = 0; i < 4; i++)
      flat.rep(
        {},
        geo(flat, () => ({ arm: 40, noWorld: true })),
      );
    expect(flat.cues).toEqual([]);
  });

  it("uses the counter's tracked arm when given", () => {
    const s = formTracker(CURL, { elbowDrift: true });
    const body = (p: RepPhase): Body => ({
      arm: 5,
      armL: LIFT_CURL.includes(p) ? 45 : 5,
      visL: 0.97,
      visR: 0.9,
    });
    s.hold(500, () => ({ frame: bodyFrame(s.t, body('top')), side: 'right' }), 'top');
    for (let i = 0; i < 4; i++)
      s.rep({}, (p) => ({ frame: bodyFrame(s.t, body(p)), side: 'right' }));
    expect(s.cues).toEqual([]);
  });

  it('uses the better-visible arm', () => {
    const s = formTracker(CURL, { elbowDrift: true });
    settle(s, { visL: 0.55, visR: 0.95 });
    for (let i = 0; i < 2; i++)
      s.rep(
        {},
        geo(s, (p) => ({ arm: LIFT_CURL.includes(p) ? 35 : 5, visL: 0.55, visR: 0.95 })),
      );
    expect(s.ids()).toEqual(['elbowDrift']);
  });
});

describe('form: body swing', () => {
  it('fires when the torso turns > 15° from where the lift started, 2 reps (16 fires, 14 not)', () => {
    // Leans back over the first half of the lift, then holds it to the far end.
    const swing =
      (deg: number) =>
      (p: RepPhase, u: number): Body => ({
        lean: p === 'down' ? -deg * Math.min(1, 2 * u) : p === 'bottom' ? -deg : 0,
      });
    const s = formTracker(CURL, { bodySwing: true });
    s.rep({}, geo(s, swing(16)));
    s.rep({}, geo(s, swing(16)));
    expect(s.cues).toMatchObject([
      { id: 'bodySwing', reps: 2, threshold: 15, text: 'Keep your body still.' },
    ]);
    expect(s.cues[0]?.value).toBeCloseTo(16, 3);
    const quiet = formTracker(CURL, { bodySwing: true });
    for (let i = 0; i < 6; i++) quiet.rep({}, geo(quiet, swing(14)));
    expect(quiet.cues).toEqual([]);
  });

  it('a steady lean (phone pitched, or leaning on a bench) is not a swing', () => {
    const s = formTracker(CURL, { bodySwing: true });
    for (let i = 0; i < 4; i++)
      s.rep(
        {},
        geo(s, () => ({ lean: 35 })),
      );
    expect(s.cues).toEqual([]);
    expect(s.tr.lastForm?.bodySwing).toBeCloseTo(0, 3);
  });

  it('a lean that only happens in the lowering is not judged', () => {
    const s = formTracker(CURL, { bodySwing: true });
    for (let i = 0; i < 4; i++)
      s.rep(
        {},
        geo(s, (p) => ({ lean: p === 'up' ? 30 : 0 })),
      );
    expect(s.cues).toEqual([]);
  });
});

describe('form: hips sag', () => {
  const sag =
    (deg: number) =>
    (p: RepPhase): Body => ({ hip: MID.includes(p) ? deg : 178 });

  it('fires when shoulder–hip–ankle < 160° mid-rep on 2 reps, side view (159 fires, 161 not)', () => {
    const s = formTracker(PUSH_UP, { hipSag: true });
    const input = (p: RepPhase) => ({ ...geo(s, sag(159))(p, 0), view: 'side' as const });
    s.rep({}, input);
    s.rep({}, input);
    expect(s.cues).toMatchObject([
      { id: 'hipSag', reps: 2, threshold: 160, text: 'Keep your body straight.' },
    ]);
    expect(s.cues[0]?.value).toBeCloseTo(159, 3);
    const quiet = formTracker(PUSH_UP, { hipSag: true });
    for (let i = 0; i < 6; i++)
      quiet.rep({}, (p) => ({ ...geo(quiet, sag(161))(p, 0), view: 'side' as const }));
    expect(quiet.cues).toEqual([]);
  });

  it('is never judged in the front view, nor when the view is unknown on a rule with another view', () => {
    const front = formTracker(PUSH_UP, { hipSag: true });
    for (let i = 0; i < 4; i++)
      front.rep({}, (p) => ({ ...geo(front, sag(130))(p, 0), view: 'front' as const }));
    expect(front.cues).toEqual([]);
    expect(front.tr.lastForm?.hipSag).toBeNull();
    const unknown = formTracker(PUSH_UP, { hipSag: true });
    for (let i = 0; i < 4; i++) unknown.rep({}, geo(unknown, sag(130)));
    expect(unknown.cues).toEqual([]);
  });

  it("uses the counter's tracked side when given, not a far side that reads nonsense", () => {
    const farSag = (p: RepPhase): Body => ({
      hip: 178,
      hipL: MID.includes(p) ? 100 : 178,
      visL: 0.97,
      visR: 0.9,
    });
    const counterSide = formTracker(PUSH_UP, { hipSag: true });
    for (let i = 0; i < 4; i++)
      counterSide.rep({}, (p) => ({
        frame: bodyFrame(counterSide.t, farSag(p)),
        view: 'side',
        side: 'right',
      }));
    expect(counterSide.cues).toEqual([]);
    expect(counterSide.tr.lastForm?.hipSag).toBeCloseTo(178, 3);
    // Without a side, the better-visible (here the bad) side is used.
    const guess = formTracker(PUSH_UP, { hipSag: true });
    for (let i = 0; i < 2; i++)
      guess.rep({}, (p) => ({ frame: bodyFrame(guess.t, farSag(p)), view: 'side' }));
    expect(guess.ids()).toEqual(['hipSag']);
  });

  it("the counter's side failing the visibility gate is unknown (no fallback to the other side)", () => {
    const s = formTracker(PUSH_UP, { hipSag: true });
    for (let i = 0; i < 4; i++)
      s.rep({}, (p) => ({
        frame: bodyFrame(s.t, { hip: MID.includes(p) ? 130 : 178, visR: 0.3, visL: 0.95 }),
        view: 'side',
        side: 'right',
      }));
    expect(s.cues).toEqual([]);
    expect(s.tr.lastForm?.hipSag).toBeNull();
  });

  it('hidden ankles are unknown', () => {
    const s = formTracker(PUSH_UP, { hipSag: true });
    for (let i = 0; i < 4; i++)
      s.rep({}, (p) => ({
        ...geo(s, (q) => ({ ...sag(130)(q), visL: 0.2, visR: 0.2 }))(p, 0),
        view: 'side' as const,
      }));
    expect(s.cues).toEqual([]);
  });
});

describe('form rules: shared mechanics', () => {
  it('a false or missing flag never fires', () => {
    const s = formTracker(CURL, { elbowDrift: false });
    for (let i = 0; i < 4; i++)
      s.rep(
        {},
        geo(s, () => ({ arm: 50, lean: 0 })),
      );
    expect(s.cues).toEqual([]);
  });

  it('at most twice per set, the streak restarting after a fire', () => {
    const s = formTracker(RAISE, { raiseTooHigh: true });
    for (let i = 0; i < 8; i++) s.rep({ min: 20, max: 135 });
    expect(s.cues.map((c) => c.reps)).toEqual([2, 4]);
  });

  it('form beats rushed lowering on the same rep; rushed fires on its next bad rep', () => {
    const s = formTracker(RAISE, { raiseTooHigh: true, rushedLowering: true });
    s.rep({ eccMs: 2000, min: 20, max: 90 });
    s.rep({ eccMs: 2000, min: 20, max: 90 });
    s.rep({ eccMs: 700, min: 20, max: 130 });
    s.rep({ eccMs: 700, min: 20, max: 130 });
    expect(s.ids()).toEqual(['raiseTooHigh']);
    s.rep({ eccMs: 700, min: 20, max: 90 });
    expect(s.ids()).toEqual(['raiseTooHigh', 'rushedLowering']);
  });

  it('form rules judge from the first rep (no baseline needed)', () => {
    const s = formTracker(RAISE, { raiseTooHigh: true });
    s.rep({ min: 20, max: 130 });
    s.rep({ min: 20, max: 130 });
    expect(s.cues.map((c) => c.reps)).toEqual([2]);
  });

  it('nothing in the Undo window or while paused', () => {
    const pending = formTracker(RAISE, { raiseTooHigh: true });
    for (let i = 0; i < 4; i++) pending.rep({ min: 20, max: 135 }, { autoState: 'pending' });
    expect(pending.cues).toEqual([]);
    const paused = formTracker(RAISE, { raiseTooHigh: true });
    for (let i = 0; i < 4; i++) paused.rep({ min: 20, max: 135 }, { paused: true });
    expect(paused.cues).toEqual([]);
  });

  it('a reset clears the form streaks', () => {
    const s = formTracker(RAISE, { raiseTooHigh: true });
    s.rep({ min: 20, max: 135 });
    s.tr.reset({ targetReps: 20 });
    s.rep({ min: 20, max: 135 });
    expect(s.cues).toEqual([]);
  });

  it('lastForm reports every measure of the latest rep (null = unknown)', () => {
    const s = formTracker(CURL, {});
    expect(s.tr.lastForm).toBeNull();
    settle(s);
    s.rep(
      { max: 160 },
      geo(s, (p) => ({ arm: LIFT_CURL.includes(p) ? 12 : 5 })),
    );
    const m: FormMeasures | null = s.tr.lastForm;
    expect(m?.raiseTooHigh).toBe(160);
    expect(m?.elbowDrift).toBeCloseTo(7, 3);
    expect(m?.bodySwing).toBeCloseTo(0, 3);
    expect(m?.armsOutOfSync).toBeNull(); // no per-side angles on a 'best' rule
    expect(m?.hipSag).toBeCloseTo(178, 3); // curl: no otherView, so the rule's side view stands
  });
});

// ---------------------------------------------------------------------------------------------
// Landmark fixtures: counter + tracker on recorded / rendered clips, every flag forced on.
// ---------------------------------------------------------------------------------------------

const LANDMARK_FIXTURES = import.meta.glob<LandmarkFrame[]>('../../fixtures/landmarks/**/*.json', {
  eager: true,
  import: 'default',
});

function replay(path: string): { cues: FocusCue[]; forms: FormMeasures[] } {
  const rel = path.replace(/^.*fixtures\/landmarks\//, '');
  const folder = rel.split('/')[0] ?? '';
  const rule = ruleForFolder(folder);
  const frames = LANDMARK_FIXTURES[path];
  if (!rule || !frames) throw new Error(`no rule or frames for ${rel}`);
  const counter = createRepCounter(rule);
  const tr = createFocusTracker(rule, { flags: flagsFor(path), targetReps: 99, autoSet: null });
  const cues: FocusCue[] = [];
  const forms: FormMeasures[] = [];
  for (const frame of frames) {
    const events = counter.push(frame);
    cues.push(
      ...tr.push({
        t: frame.t,
        present: frame.landmarks.length > 0,
        tracking: counter.tracking,
        untracked: counter.untracked,
        phase: counter.phase,
        angle: counter.angle,
        sides: counter.sideAngles,
        frame,
        view: counter.rule.view,
        side: counter.side,
        events,
        fps: 30,
        autoState: null,
        paused: false,
      }),
    );
    if (events.some((e) => e.type === 'rep') && tr.lastForm) forms.push(tr.lastForm);
  }
  return { cues, forms };
}

const pathsMatching = (re: RegExp) =>
  Object.keys(LANDMARK_FIXTURES)
    .filter((p) => re.test(p))
    .sort();

/**
 * The form rules SPEC M5 lists per exercise folder. "Every flag forced on" means these plus every
 * focus rule: a form rule outside its exercise measures something else (a curl's elbow angle is
 * no lateral raise height), which is why flags are data on the exercise rule.
 */
const SPEC_FORM: Record<string, readonly FocusCueId[]> = {
  curl: ['elbowDrift', 'bodySwing'],
  row: ['bodySwing'],
  'push-up': ['hipSag'],
  'shoulder-press': ['armsOutOfSync'],
  'lateral-raise': ['armsOutOfSync', 'raiseTooHigh'],
  'goblet-squat': [],
};
const folderOf = (path: string) => path.replace(/^.*fixtures\/landmarks\//, '').split('/')[0] ?? '';
const flagsFor = (path: string): FocusRuleFlags => ({
  ...ALL_FOCUS,
  ...Object.fromEntries((SPEC_FORM[folderOf(path)] ?? []).map((id) => [id, true])),
});

describe('form rules on landmark fixtures (every flag forced on)', () => {
  const clean = pathsMatching(/\/synthetic-01__/);

  it('has a clean synthetic-01 clip for all six exercises', () => {
    expect(clean.length).toBe(6);
  });

  for (const path of clean) {
    it(`clean ${path.replace(/^.*landmarks\//, '')} fires no form rule`, () => {
      const { cues, forms } = replay(path);
      const reps = Number(/__reps-(\d+)__/.exec(path)?.[1]);
      expect(forms.length).toBe(reps); // a measure per counted rep
      expect(cues.filter((c) => FORM_IDS.includes(c.id))).toEqual([]);
    });
  }
});
