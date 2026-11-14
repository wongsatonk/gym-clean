import { describe, expect, it } from 'vitest';
import { ADVICE_BANNED_WORDS } from './advice';
import { AUTO_SET_DEFAULTS, createAutoSet, type AutoSet, type AutoSetAction } from './autoSet';
import { ruleFor, type ExerciseRule } from './exercises';
import { FpsMeter } from './fps';
import {
  CUE_TEXT,
  FOCUS_DEFAULTS,
  createFocusTracker,
  cueText,
  type FocusCue,
  type FocusInput,
  type FocusRuleFlags,
  type FocusTracker,
} from './focus';
import type { RepPhase } from './repCounter';
import type { FocusCueId, RepEvent } from './types';

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
  type?: 'rep' | 'partial';
};

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

  /** Frames for `ms` at the current phase (or `phase`). */
  hold(ms: number, input: Partial<FocusInput> = {}, phase?: RepPhase): void {
    if (phase) this.phase = phase;
    const end = this.t + ms;
    while (this.t < end) this.frame(input);
  }

  /** One rep (or partial): lift, a short dwell, the lowering, the event, then a hold at the top. */
  rep(o: RepOpts = {}, input: Partial<FocusInput> = {}): void {
    const ecc = o.eccMs ?? 2000;
    const con = o.conMs ?? 1000;
    const type = o.type ?? 'rep';
    this.hold(con, input, 'down');
    this.hold(100, input, 'bottom');
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
    this.frame({ ...input, events: [ev] }, true);
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
