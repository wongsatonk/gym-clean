import { describe, expect, it } from 'vitest';
import type { Side, Triplet } from './angles';
import { ruleFor, type ExerciseRule } from './exercises';
import { LANDMARK_COUNT } from './poseTopology';
import { createRepCounter } from './repCounter';
import type { LandmarkFrame, RepEvent } from './types';

// ---------------------------------------------------------------------------------------------
// Frame builders: place the rule's joint triplet so the joint angle is exactly the target.
// ---------------------------------------------------------------------------------------------

const FPS = 30;
const DT = 1000 / FPS;

function mustRule(id: string): ExerciseRule {
  const r = ruleFor(id);
  if (!r) throw new Error(`no rule for ${id}`);
  return r;
}
const CURL = mustRule('Dumbbell_Bicep_Curl');
const RAISE = mustRule('Side_Lateral_Raise');
const PRESS = mustRule('Seated_Dumbbell_Press');

type SideSpec = {
  angle: number;
  visibility?: number | undefined;
  /**
   * Where the first triplet point sits relative to the joint: `above` (curl: shoulder above the
   * elbow, so 180° = arm hanging) or `below` (press/raise: shoulder/hip below the joint, so
   * 180° = pointing up for the press, 0° = arm down for the raise).
   */
  anchor?: 'above' | 'below' | undefined;
};

type FrameSpec = {
  t: number;
  left?: SideSpec;
  right?: SideSpec;
  /** Omit world landmarks so the 2D fallback is used. */
  noWorld?: boolean | undefined;
};

const SEG = 0.12;

function place(
  pts: { x: number; y: number }[],
  vis: number[],
  triplet: Triplet,
  spec: SideSpec,
  cx: number,
) {
  const [ia, ib, ic] = triplet;
  const by = 0.45;
  const sign = spec.anchor === 'below' ? 1 : -1;
  const th = (spec.angle * Math.PI) / 180;
  // a = b + (0, -sign·SEG)… i.e. directly above (sign -1) or below (sign +1) the joint.
  // c - b is the (a - b) direction rotated by the target angle.
  pts[ib] = { x: cx, y: by };
  pts[ia] = { x: cx, y: by + sign * SEG };
  pts[ic] = { x: cx + Math.sin(th) * SEG, y: by + sign * Math.cos(th) * SEG };
  const v = spec.visibility ?? 0.95;
  vis[ia] = v;
  vis[ib] = v;
  vis[ic] = v;
}

function makeFrame(rule: ExerciseRule, spec: FrameSpec): LandmarkFrame {
  const pts = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5 }));
  const vis = Array.from({ length: LANDMARK_COUNT }, () => 0.9);
  // Place the left side first so a shared landmark (none today) would be overwritten predictably.
  if (spec.left) place(pts, vis, rule.triplets.left, spec.left, 0.65);
  if (spec.right) place(pts, vis, rule.triplets.right, spec.right, 0.35);
  const landmarks = pts.map((p, i) => ({ x: p.x, y: p.y, z: 0, visibility: vis[i] ?? 0 }));
  const frame: LandmarkFrame = { t: spec.t, landmarks };
  if (!spec.noWorld) frame.world = pts.map((p) => ({ x: p.x - 0.5, y: p.y - 0.5, z: 0 }));
  return frame;
}

/** Keyframes [ms, angle] → angle at time t by linear interpolation (held past the ends). */
type Keys = readonly (readonly [number, number])[];
function curveAt(keys: Keys, t: number): number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) throw new Error('empty curve');
  if (t <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const k0 = keys[i - 1];
    const k1 = keys[i];
    if (!k0 || !k1) continue;
    if (t <= k1[0]) return k0[1] + ((k1[1] - k0[1]) * (t - k0[0])) / (k1[0] - k0[0]);
  }
  return last[1];
}

/** Build a curve from segments: [durationMs, targetAngle], starting at `start`. */
function curve(start: number, segs: readonly (readonly [number, number])[]): Keys {
  const keys: [number, number][] = [[0, start]];
  let t = 0;
  for (const [d, a] of segs) {
    t += d;
    keys.push([t, a]);
  }
  return keys;
}

function duration(keys: Keys): number {
  return keys[keys.length - 1]?.[0] ?? 0;
}

/** The segments of a curve (durations between keyframes), to splice it into another curve. */
function segsOf(keys: Keys): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < keys.length; i++) {
    const k0 = keys[i - 1];
    const k1 = keys[i];
    if (k0 && k1) out.push([k1[0] - k0[0], k1[1]]);
  }
  return out;
}

type SampleOpts = {
  sides?: readonly Side[];
  anchor?: 'above' | 'below';
  /** Added to the angle per frame (frame index, t) → degrees. */
  noise?: (i: number, t: number) => number;
  /** Per-frame visibility override for both used sides. */
  visibility?: (t: number) => number;
  /** Fixed angle/visibility for a side that is not following the curve. */
  other?: Partial<Record<Side, SideSpec>>;
  noWorld?: boolean;
};

function sample(rule: ExerciseRule, keys: Keys, opts: SampleOpts = {}): LandmarkFrame[] {
  const sides = opts.sides ?? ['left', 'right'];
  const frames: LandmarkFrame[] = [];
  const end = duration(keys);
  for (let i = 0; i * DT <= end + 1e-9; i++) {
    const t = i * DT;
    const angle = curveAt(keys, t) + (opts.noise?.(i, t) ?? 0);
    const spec: FrameSpec = { t: Math.round(t * 1000) / 1000, noWorld: opts.noWorld };
    for (const side of ['left', 'right'] as const) {
      const fixed = opts.other?.[side];
      if (fixed) spec[side] = { anchor: opts.anchor, ...fixed };
      else if (sides.includes(side))
        spec[side] = { angle, anchor: opts.anchor, visibility: opts.visibility?.(t) };
    }
    frames.push(makeFrame(rule, spec));
  }
  return frames;
}

function runAll(rule: ExerciseRule, frames: readonly LandmarkFrame[]) {
  const counter = createRepCounter(rule);
  const events: RepEvent[] = [];
  const eventFrameT: number[] = [];
  for (const f of frames) {
    for (const e of counter.push(f)) {
      events.push(e);
      eventFrameT.push(f.t);
    }
  }
  return { counter, events, eventFrameT };
}

const reps = (ev: RepEvent[]) => ev.filter((e) => e.type === 'rep');
const partials = (ev: RepEvent[]) => ev.filter((e) => e.type === 'partial');

/** n curl reps: up (concentric) in `upMs`, lower (eccentric) in `downMs`, from/to 170°. */
function curlReps(n: number, upMs = 800, downMs = 1200, bottom = 35, top = 170) {
  const segs: [number, number][] = [[600, top]];
  for (let i = 0; i < n; i++) segs.push([upMs, bottom], [300, bottom], [downMs, top], [500, top]);
  return curve(top, segs);
}

// ---------------------------------------------------------------------------------------------

describe('frame builder (sanity)', () => {
  it('produces the target angle in world and image coordinates', async () => {
    const { frameAngle } = await import('./angles');
    for (const angle of [10, 55, 90, 150, 175]) {
      for (const anchor of ['above', 'below'] as const) {
        const f = makeFrame(CURL, { t: 0, right: { angle, anchor } });
        expect(frameAngle(f, CURL.triplets.right)).toBeCloseTo(angle, 6);
        const f2 = makeFrame(CURL, { t: 0, right: { angle, anchor }, noWorld: true });
        expect(frameAngle(f2, CURL.triplets.right)).toBeCloseTo(angle, 6);
      }
    }
  });
});

describe('createRepCounter: clean reps', () => {
  it('counts clean curls (decreasing angle, starts extended)', () => {
    const { counter, events } = runAll(CURL, sample(CURL, curlReps(3)));
    expect(reps(events)).toHaveLength(3);
    expect(partials(events)).toHaveLength(0);
    expect(counter.reps).toBe(3);
    expect(counter.partials).toBe(0);
    expect(counter.phase).toBe('top');
  });

  it('counts with 2D image landmarks when there is no world data', () => {
    const { counter } = runAll(CURL, sample(CURL, curlReps(2), { noWorld: true }));
    expect(counter.reps).toBe(2);
  });

  it('counts an inverted lateral raise (angle grows toward contracted)', () => {
    const keys = curve(10, [
      [600, 10],
      [900, 95],
      [300, 95],
      [1200, 10],
      [500, 10],
      [900, 95],
      [300, 95],
      [1200, 10],
      [500, 10],
    ]);
    const { counter, events } = runAll(RAISE, sample(RAISE, keys, { anchor: 'below' }));
    expect(counter.reps).toBe(2);
    expect(counter.partials).toBe(0);
    const first = events[0];
    expect(first?.minAngle).toBeLessThan(15);
    expect(first?.maxAngle).toBeGreaterThan(85);
    // Eccentric = lowering = back toward extended (1200 ms), concentric = raising (900 ms).
    expect(first?.eccentricMs).toBeGreaterThan(first?.concentricMs ?? Infinity);
  });

  it('counts a shoulder press that starts contracted, with the wrist above the shoulder', () => {
    const keys = curve(55, [
      [600, 55],
      [900, 175],
      [300, 175],
      [1300, 55],
      [500, 55],
      [900, 175],
      [300, 175],
      [1300, 55],
      [500, 55],
    ]);
    const { counter, events } = runAll(PRESS, sample(PRESS, keys, { anchor: 'below' }));
    expect(counter.reps).toBe(2);
    expect(counter.partials).toBe(0);
    // Eccentric = lowering back to the shoulders (toward contracted, 1300 ms) — timed
    // threshold to threshold (142° → 80° = 62/120 of each leg, ~670 ms).
    const first = events[0];
    expect(first?.eccentricMs).toBeGreaterThan(first?.concentricMs ?? Infinity);
    expect(first?.eccentricMs).toBeGreaterThan(550);
    expect(first?.eccentricMs).toBeLessThan(900);
  });

  it('never treats straight arms hanging below the shoulders as a pressed-out rep', () => {
    // Same angles as a press, but the wrist ends up below the shoulder (extended gate fails).
    const keys = curve(55, [
      [600, 55],
      [900, 175],
      [300, 175],
      [1300, 55],
      [500, 55],
    ]);
    // Bent part keeps the press pose; straight arms point down (anchor above = wrist low).
    const frames = sample(PRESS, keys, { anchor: 'below' }).map((f) => {
      const angle = curveAt(keys, f.t);
      if (angle < 120) return f;
      const arm = { angle, anchor: 'above' as const };
      return makeFrame(PRESS, { t: f.t, left: arm, right: arm });
    });
    const { counter } = runAll(PRESS, frames);
    expect(counter.reps).toBe(0);
    expect(counter.partials).toBe(0);
  });
});

describe('createRepCounter: jitter and hysteresis', () => {
  it('does not double count with ±8° jitter dwelling right at both thresholds', () => {
    // Dwell centred on each threshold, with a square wave of ±8° (3 frames up, 3 down).
    const segs: [number, number][] = [[1000, CURL.extended]];
    for (let i = 0; i < 3; i++) {
      segs.push([700, CURL.contracted], [1500, CURL.contracted], [900, CURL.extended]);
      segs.push([1500, CURL.extended]);
    }
    const keys = curve(CURL.extended, segs);
    const noise = (i: number) => (Math.floor(i / 3) % 2 === 0 ? 8 : -8);
    const frames = sample(CURL, keys, { noise });
    const counter = createRepCounter(CURL);
    const events: RepEvent[] = [];
    const phases: { t: number; phase: string }[] = [];
    for (const f of frames) {
      events.push(...counter.push(f));
      phases.push({ t: f.t, phase: counter.phase });
    }
    expect(counter.reps).toBe(3);
    expect(counter.partials).toBe(0);
    expect(events).toHaveLength(3);

    // Hysteresis: once in a band during a jittery dwell, the phase never leaves it.
    const phasesIn = (from: number, to: number) =>
      phases.filter((p) => p.t >= from && p.t <= to).map((p) => p.phase);
    const afterFirst = (list: string[], phase: string) => list.slice(list.indexOf(phase));
    let t0 = 1000;
    for (let i = 0; i < 3; i++) {
      const bottomDwell = phasesIn(t0 + 700, t0 + 2200);
      expect(bottomDwell).toContain('bottom');
      expect(new Set(afterFirst(bottomDwell, 'bottom'))).toEqual(new Set(['bottom']));
      const topDwell = phasesIn(t0 + 3100, t0 + 4600);
      expect(topDwell).toContain('top');
      expect(new Set(afterFirst(topDwell, 'top'))).toEqual(new Set(['top']));
      t0 += 4600;
    }
  });

  it('leaves the start band only past threshold − hysteresis (E−5 stays, E−11 leaves)', () => {
    const counter = createRepCounter(CURL);
    let t = 0;
    const hold = (angle: number, ms: number) => {
      for (const end = t + ms; t < end; t += DT)
        counter.push(makeFrame(CURL, { t, left: { angle }, right: { angle } }));
    };
    hold(170, 1000);
    expect(counter.phase).toBe('top');
    hold(CURL.extended - 5, 1500);
    expect(counter.phase).toBe('top');
    hold(CURL.extended - 11, 1500);
    expect(counter.phase).toBe('down');
    // Same at the far end: C+5 stays in bottom, C+11 leaves.
    hold(CURL.contracted - 20, 1000);
    expect(counter.phase).toBe('bottom');
    hold(CURL.contracted + 5, 1500);
    expect(counter.phase).toBe('bottom');
    hold(CURL.contracted + 11, 1500);
    expect(counter.phase).toBe('up');
  });

  it('ignores ±8° single-frame jitter at the top (no partials from wobble)', () => {
    const keys = curve(165, [[6000, 165]]);
    const noise = (i: number) => (i % 2 === 0 ? 8 : -8);
    const { counter, events } = runAll(CURL, sample(CURL, keys, { noise }));
    expect(events).toHaveLength(0);
    expect(counter.phase).toBe('top');
  });
  it('±8° jitter centred exactly on the extended threshold never makes a partial', () => {
    const keys = curve(170, [
      [1000, 170],
      [300, CURL.extended],
      [5000, CURL.extended],
      [300, 170],
      [1000, 170],
    ]);
    const noise = (i: number) => (Math.floor(i / 3) % 2 === 0 ? 8 : -8);
    const { counter, events } = runAll(CURL, sample(CURL, keys, { noise }));
    expect(events).toHaveLength(0);
    expect(counter.partials).toBe(0);
  });
});

describe('createRepCounter: partials', () => {
  it('reports a turnaround before the far threshold as a partial, not a rep', () => {
    const keys = curve(170, [
      [600, 170],
      [800, 35],
      [300, 35],
      [1200, 170],
      [500, 170],
      [600, 100], // turns around at 100° (curl contracted threshold is 70°)
      [700, 170],
      [500, 170],
      [800, 35],
      [300, 35],
      [1200, 170],
      [500, 170],
    ]);
    const { counter, events } = runAll(CURL, sample(CURL, keys));
    expect(events.map((e) => e.type)).toEqual(['rep', 'partial', 'rep']);
    expect(counter.reps).toBe(2);
    expect(counter.partials).toBe(1);
    const p = events[1];
    expect(p?.index).toBe(1);
    expect(p?.minAngle).toBeGreaterThan(95);
    expect(p?.minAngle).toBeLessThan(110);
    expect(p?.maxAngle).toBeGreaterThan(150);
    expect(p?.eccentricMs).toBeGreaterThan(0);
    expect(p?.concentricMs).toBeGreaterThan(0);
  });

  it('ignores a shallow dip that is less than the minimum partial depth', () => {
    // Holds just past the exit of the top band (E − hysteresis − 1), but less than the minimum
    // partial depth past the extended threshold.
    const dip = CURL.extended - CURL.hysteresisDeg - 1;
    expect(CURL.extended - dip).toBeLessThan(CURL.minPartialDepthDeg);
    const keys = curve(170, [
      [600, 170],
      [600, dip],
      [400, dip],
      [600, 170],
      [600, 170],
    ]);
    const counter = createRepCounter(CURL);
    const events: RepEvent[] = [];
    let left = false;
    for (const f of sample(CURL, keys)) {
      events.push(...counter.push(f));
      if (counter.phase === 'down') left = true;
    }
    expect(left).toBe(true); // it did leave the top band…
    expect(events).toHaveLength(0); // …but not deep enough for a partial
    expect(counter.partials).toBe(0);
  });

  it('counts a partial on an inverted lateral raise', () => {
    const keys = curve(10, [
      [600, 10],
      [700, 55], // turns around at 55°; contracted is 75°
      [800, 10],
      [500, 10],
    ]);
    const { counter } = runAll(RAISE, sample(RAISE, keys, { anchor: 'below' }));
    expect(counter.partials).toBe(1);
    expect(counter.reps).toBe(0);
  });
});

describe('createRepCounter: minimum phase time', () => {
  // The floor applies to the out-and-back pair: the two moving legs together (dwell at the far
  // end excluded) must take at least 2 × minPhaseMs. One fast leg alone (a dropped lowering)
  // still counts; M5 coaches the tempo instead of dropping the rep.
  it('rejects reps whose out-and-back movement is jitter-fast (both legs ~120 ms)', () => {
    const { counter, events } = runAll(CURL, sample(CURL, curlReps(3, 120, 120)));
    expect(events).toHaveLength(0);
    expect(counter.reps).toBe(0);
    expect(counter.partials).toBe(0);
  });

  it('counts full reps with a deliberately fast lowering (~0.45 s)', () => {
    const { counter, events } = runAll(CURL, sample(CURL, curlReps(2, 800, 450)));
    expect(counter.reps).toBe(2);
    for (const e of events) {
      expect(e.eccentricMs).toBeLessThan(450);
      expect(e.concentricMs).toBeGreaterThan(e.eccentricMs);
    }
  });

  it('counts a full rep with a fast lift and a slow lowering', () => {
    const { counter } = runAll(CURL, sample(CURL, curlReps(2, 120, 1200)));
    expect(counter.reps).toBe(2);
  });

  it('a long pause at the far end does not make rushed legs count', () => {
    // 120 ms down, 1 s hold, 120 ms up: the hold is not movement time.
    const keys = curve(170, [
      [600, 170],
      [120, 35],
      [1000, 35],
      [120, 170],
      [600, 170],
    ]);
    const { counter, events } = runAll(CURL, sample(CURL, keys));
    expect(events).toHaveLength(0);
    expect(counter.reps).toBe(0);
  });

  it('rejects a deep but rushed partial (each leg ~150 ms)', () => {
    // Dips to 85° (deep, but above the curl contracted threshold) and back in 150 ms each way.
    const dip = CURL.contracted + 15;
    const keys = curve(170, [
      [600, 170],
      [150, dip],
      [150, 170],
      [600, 170],
    ]);
    const { counter, events } = runAll(CURL, sample(CURL, keys));
    expect(events).toHaveLength(0);
    expect(counter.phase).toBe('top');
    // The same dip at a normal pace is a partial.
    const slow = curve(170, [
      [600, 170],
      [600, dip],
      [600, 170],
      [600, 170],
    ]);
    expect(runAll(CURL, sample(CURL, slow)).counter.partials).toBe(1);
  });

  it.each([300, 450, 600])(
    'a visible glitch to the far band, then %d ms hidden, then back at the top is not a rep',
    (gapMs) => {
      // 150 ms of garbage at 35° (smoothed reaches the far band), the arm is hidden, and it
      // reappears at the top. Hidden time is not movement, so neither leg is long enough.
      const glitchEnd = 1000 + 150;
      const keys = curve(170, [
        [1000, 170],
        [1, 35],
        [149, 35],
        [gapMs, 35],
        [1, 170],
        [1500, 170],
      ]);
      const visibility = (t: number) => (t >= glitchEnd && t < glitchEnd + gapMs ? 0.1 : 0.95);
      const counter = createRepCounter(CURL);
      const events: RepEvent[] = [];
      let reachedFar = false;
      for (const f of sample(CURL, keys, { visibility })) {
        events.push(...counter.push(f));
        if (counter.phase === 'bottom') reachedFar = true;
      }
      expect(reachedFar).toBe(true);
      expect(events).toHaveLength(0);
      expect(counter.reps).toBe(0);
      expect(counter.partials).toBe(0);
    },
  );

  it('the same glitch without a gap is not a rep either', () => {
    const keys = curve(170, [
      [1000, 170],
      [1, 35],
      [149, 35],
      [1, 170],
      [1500, 170],
    ]);
    const { counter } = runAll(CURL, sample(CURL, keys));
    expect(counter.reps).toBe(0);
    expect(counter.partials).toBe(0);
  });

  it('a short occlusion mid-lowering is left out of the measured leg time', () => {
    // Lowering 1200 ms with 400 ms of it hidden: the eccentric leg is timed on visible frames.
    const keys = curlReps(1);
    const gapStart = 600 + 800 + 300 + 400;
    const visibility = (t: number) => (t >= gapStart && t < gapStart + 400 ? 0.1 : 0.95);
    const hidden = runAll(CURL, sample(CURL, keys, { visibility })).events[0];
    const seen = runAll(CURL, sample(CURL, keys)).events[0];
    expect(hidden?.type).toBe('rep');
    expect(seen?.type).toBe('rep');
    expect(seen?.eccentricMs ?? 0).toBeGreaterThan((hidden?.eccentricMs ?? 0) + 250);
    expect(hidden?.concentricMs).toBeCloseTo(seen?.concentricMs ?? 0, -1);
  });

  it('rejects a single leg under minPhaseMs / 2 even when the pair is long enough', () => {
    // Lift in ~70 ms threshold to threshold, lower in ~1.5 s: pair > 500 ms, lift leg < 125 ms.
    const { counter } = runAll(CURL, sample(CURL, curlReps(2, 100, 2500)));
    expect(counter.reps).toBe(0);
  });

  it('pins the pair boundary: just under 2 × minPhaseMs is rejected, just over counts', () => {
    // Legs timed threshold to threshold (70° ↔ 150° = 80/135 of each leg) at 30 fps: 360 ms
    // legs measure 534 ms as a pair; 350 ms legs fall one frame short of 500 ms.
    const over = runAll(CURL, sample(CURL, curlReps(1, 360, 360)));
    expect(over.counter.reps).toBe(1);
    const e = over.events[0];
    const pair = (e?.eccentricMs ?? 0) + (e?.concentricMs ?? 0);
    expect(pair).toBeGreaterThanOrEqual(2 * CURL.minPhaseMs);
    expect(pair).toBeLessThan(2 * CURL.minPhaseMs + 60);
    const under = runAll(CURL, sample(CURL, curlReps(1, 350, 350)));
    expect(under.counter.reps).toBe(0);
  });

  it('still counts later normal reps after a rejected fast one', () => {
    const keys = curve(170, [...segsOf(curlReps(1, 120, 120)), ...segsOf(curlReps(2))]);
    const { counter } = runAll(CURL, sample(CURL, keys));
    expect(counter.reps).toBe(2);
  });

  it('counts slow reps and measures their tempo', () => {
    const { counter, events } = runAll(CURL, sample(CURL, curlReps(2, 3000, 4000)));
    expect(counter.reps).toBe(2);
    for (const e of events) {
      // Lowering 4 s, lifting 3 s, timed between thresholds (70° ↔ 150° = 80/135 of each
      // leg): ≈ 2370 / 1780 ms.
      expect(e.eccentricMs).toBeGreaterThan(2200);
      expect(e.eccentricMs).toBeLessThan(2600);
      expect(e.concentricMs).toBeGreaterThan(1600);
      expect(e.concentricMs).toBeLessThan(2000);
      expect(e.eccentricMs).toBeGreaterThan(e.concentricMs);
    }
  });
});

describe('createRepCounter: visibility gate and setup', () => {
  it('ignores low-visibility frames: an occlusion gap mid-rep keeps the rep', () => {
    const keys = curlReps(2);
    // Hide the arm for ~400 ms in the middle of the first rep's lowering.
    const gapStart = 600 + 800 + 300 + 400;
    const visibility = (t: number) => (t >= gapStart && t < gapStart + 400 ? 0.1 : 0.95);
    const frames = sample(CURL, keys, { visibility });
    const counter = createRepCounter(CURL);
    let sawGated = false;
    for (const f of frames) {
      counter.push(f);
      if (f.t >= gapStart && f.t < gapStart + 400) {
        expect(counter.tracking).toBe(false);
        sawGated = true;
      }
    }
    expect(sawGated).toBe(true);
    expect(counter.tracking).toBe(true);
    expect(counter.reps).toBe(2);
  });

  it('ignores garbage angles in gated frames (they never trigger a rep)', () => {
    // Low-visibility frames carry a fake full rep; it must not count.
    const keys = curve(170, [
      [600, 170],
      [800, 35],
      [300, 35],
      [1200, 170],
      [500, 170],
    ]);
    const visibility = (t: number) => (t > 600 ? 0.3 : 0.95);
    const { counter } = runAll(CURL, sample(CURL, keys, { visibility }));
    expect(counter.reps).toBe(0);
    expect(counter.tracking).toBe(false);
  });

  it('reports not tracking before any usable frame and when landmarks are missing', () => {
    const counter = createRepCounter(CURL);
    expect(counter.tracking).toBe(false);
    expect(counter.phase).toBe('setup');
    expect(counter.side).toBeNull();
    expect(counter.angle).toBeNull();
    expect(counter.push({ t: 0, landmarks: [] })).toEqual([]);
    expect(counter.tracking).toBe(false);
  });

  it('starting mid-rep: nothing counts until the arm first settles at the start', () => {
    // Recording starts with the dumbbell halfway up, curls to the top, lowers, then 2 reps.
    const keys = curve(90, [[400, 40], [300, 40], [1000, 170], ...segsOf(curlReps(2))]);
    const { counter, events } = runAll(CURL, sample(CURL, keys));
    expect(counter.reps).toBe(2);
    expect(events.every((e) => e.type === 'rep')).toBe(true);
  });

  it('ignores setup movement that never reaches the start position', () => {
    const keys = curve(60, [
      [500, 120],
      [500, 40],
      [500, 130],
      [500, 30],
      [500, 100],
    ]);
    const { counter, events } = runAll(CURL, sample(CURL, keys));
    expect(events).toHaveLength(0);
    expect(counter.phase).toBe('setup');
  });

  it('does not settle on a brief touch of the start band', () => {
    // 1 frame in the band, then a full curl: must not count (not settled), then a real rep does.
    const keys = curve(120, [
      [200, 165],
      [100, 120],
      [600, 35],
      [300, 35],
      [1200, 170],
      ...segsOf(curlReps(1)),
    ]);
    const { counter } = runAll(CURL, sample(CURL, keys));
    expect(counter.reps).toBe(1);
  });
});

describe('createRepCounter: gaps, restarts and bad input', () => {
  const frameAt = (t: number, angle: number, visibility = 0.95) =>
    makeFrame(CURL, {
      t,
      left: { angle, visibility },
      right: { angle, visibility },
    });

  it('restarts the smoothing from the raw angle after a gap longer than 500 ms', () => {
    const counter = createRepCounter(CURL);
    let t = 0;
    for (; t <= 600; t += DT) counter.push(frameAt(t, 170));
    // 700 ms occluded while the arm curls up.
    for (const end = t + 700; t < end; t += DT) counter.push(frameAt(t, 100, 0.1));
    counter.push(frameAt(t, 40));
    expect(counter.angle).toBeCloseTo(40, 6);
  });

  it('keeps smoothing across a short gap (under 500 ms)', () => {
    const counter = createRepCounter(CURL);
    let t = 0;
    for (; t <= 600; t += DT) counter.push(frameAt(t, 170));
    for (const end = t + 300; t < end; t += DT) counter.push(frameAt(t, 100, 0.1));
    counter.push(frameAt(t, 40));
    expect(counter.angle).toBeCloseTo(170 + CURL.emaAlpha * (40 - 170), 6);
  });

  it('does not settle from two in-band frames separated by an occlusion', () => {
    const counter = createRepCounter(CURL);
    counter.push(frameAt(0, 170));
    let t = DT;
    for (const end = t + 1000; t < end; t += DT) counter.push(frameAt(t, 170, 0.1));
    counter.push(frameAt(t, 170));
    expect(counter.phase).toBe('setup');
    // Straight into a curl: not settled, so it must not count.
    const keys = curve(170, [
      [800, 35],
      [300, 35],
      [1200, 170],
      [100, 170],
    ]);
    for (const f of sample(CURL, keys)) if (f.t > 0) counter.push({ ...f, t: t + f.t });
    expect(counter.reps).toBe(0);
  });

  it('a long gap without frames also restarts settling', () => {
    const counter = createRepCounter(CURL);
    counter.push(frameAt(0, 170));
    counter.push(frameAt(1000, 170));
    expect(counter.phase).toBe('setup');
    counter.push(frameAt(1000 + DT, 170));
    expect(counter.phase).toBe('setup');
  });

  it('restarts settling when best mode switches side during setup', () => {
    const counter = createRepCounter(CURL);
    const both = (t: number, lv: number, rv: number) =>
      makeFrame(CURL, {
        t,
        left: { angle: 170, visibility: lv },
        right: { angle: 170, visibility: rv },
      });
    let t = 0;
    // 4 frames on the left (not long enough to settle), then the right arm becomes clearer.
    for (; t <= 100; t += DT) counter.push(both(t, 0.95, 0.55));
    expect(counter.side).toBe('left');
    let switchedAt: number | null = null;
    for (; t <= 2000; t += DT) {
      counter.push(both(t, 0.55, 0.95));
      if (switchedAt === null && counter.side === 'right') switchedAt = t;
      if (switchedAt !== null && t - switchedAt < CURL.minPhaseMs)
        expect(counter.phase).toBe('setup');
    }
    expect(switchedAt).not.toBeNull();
    expect(counter.phase).toBe('top');
    expect(counter.side).toBe('right');
  });

  it('keeps the locked side after settling, even if the other arm becomes more visible', () => {
    const counter = createRepCounter(CURL);
    // Settle on the left (right hidden).
    for (const f of sample(CURL, curve(170, [[800, 170]]), {
      sides: ['left'],
      other: { right: { angle: 170, visibility: 0.13 } },
    }))
      counter.push(f);
    expect(counter.side).toBe('left');
    expect(counter.phase).toBe('top');
    // Now the left is hidden and the right arm does a full rep: not tracked, not counted.
    for (const f of sample(CURL, curlReps(1), {
      sides: ['right'],
      other: { left: { angle: 170, visibility: 0.13 } },
    }))
      counter.push({ ...f, t: f.t + 1000 });
    expect(counter.side).toBe('left');
    expect(counter.tracking).toBe(false);
    expect(counter.reps).toBe(0);
  });

  it('handles time going backwards (stream restart): keeps counts, legs stay positive', () => {
    const counter = createRepCounter(CURL);
    const events: RepEvent[] = [];
    for (const f of sample(CURL, curlReps(2))) events.push(...counter.push(f));
    expect(counter.reps).toBe(2);
    // The camera restarts and t re-zeroes; the new stream does 2 more reps.
    for (const f of sample(CURL, curlReps(2))) events.push(...counter.push(f));
    expect(counter.reps).toBe(4);
    for (const e of events) {
      expect(e.eccentricMs).toBeGreaterThan(0);
      expect(e.concentricMs).toBeGreaterThan(0);
    }
  });

  it('does not stall in setup when t restarts below the settle start', () => {
    const counter = createRepCounter(CURL);
    // Arm reaches the top just before the stream restarts (settling started at t≈5000).
    for (let t = 5000; t <= 5100; t += DT) counter.push(frameAt(t, 170));
    expect(counter.phase).toBe('setup');
    // New stream from t=0: holding the top for 600 ms must settle, and reps must count.
    for (const f of sample(CURL, curlReps(1))) counter.push(f);
    expect(counter.reps).toBe(1);
  });

  it('a stream restart mid-rep does not complete that rep', () => {
    const counter = createRepCounter(CURL);
    // Settle, curl to the bottom, then the stream restarts at the top.
    for (const f of sample(
      CURL,
      curve(170, [
        [600, 170],
        [800, 35],
        [300, 35],
      ]),
    ))
      counter.push(f);
    expect(counter.phase).toBe('bottom');
    for (const f of sample(CURL, curve(170, [[600, 170]]))) counter.push(f);
    expect(counter.reps).toBe(0);
    expect(counter.phase).toBe('top');
  });

  it('treats NaN visibility as not visible', () => {
    const counter = createRepCounter(CURL);
    for (let t = 0; t < 600; t += DT) counter.push(frameAt(t, 170, NaN));
    expect(counter.tracking).toBe(false);
    expect(counter.angle).toBeNull();
    const raise = createRepCounter(RAISE);
    raise.push(
      makeFrame(RAISE, {
        t: 0,
        left: { angle: 10, anchor: 'below', visibility: NaN },
        right: { angle: 10, anchor: 'below', visibility: NaN },
      }),
    );
    expect(raise.tracking).toBe(false);
  });
});

describe('createRepCounter: sides', () => {
  it('best mode tracks the better-visible side (other side at 0.13)', () => {
    const keys = curlReps(2);
    const frames = sample(CURL, keys, {
      sides: ['left'],
      other: { right: { angle: 90, visibility: 0.13 } },
    });
    const { counter } = runAll(CURL, frames);
    expect(counter.side).toBe('left');
    expect(counter.reps).toBe(2);
  });

  it('best mode picks right when right is more visible', () => {
    const frames = sample(CURL, curlReps(1), {
      sides: ['right'],
      other: { left: { angle: 170, visibility: 0.4 } },
    });
    const { counter } = runAll(CURL, frames);
    expect(counter.side).toBe('right');
    expect(counter.reps).toBe(1);
  });

  it('both mode averages both arms when both are visible', () => {
    const keys = curve(10, [
      [600, 10],
      [900, 95],
      [300, 95],
      [1200, 10],
      [500, 10],
    ]);
    const { counter, events } = runAll(RAISE, sample(RAISE, keys, { anchor: 'below' }));
    expect(counter.side).toBe('both');
    expect(events).toHaveLength(1);
  });

  it('both mode averages: left at 95° and right at 60° reads ~77° (past contracted 75°)', () => {
    const counter = createRepCounter(RAISE);
    let t = 0;
    for (let i = 0; i < 20; i++, t += DT)
      counter.push(
        makeFrame(RAISE, {
          t,
          left: { angle: 10, anchor: 'below' },
          right: { angle: 10, anchor: 'below' },
        }),
      );
    for (let i = 0; i < 20; i++, t += DT)
      counter.push(
        makeFrame(RAISE, {
          t,
          left: { angle: 95, anchor: 'below' },
          right: { angle: 60, anchor: 'below' },
        }),
      );
    expect(counter.angle).toBeCloseTo(77.5, 0);
    expect(counter.phase).toBe('bottom');
  });

  it('both mode falls back to the visible arm when one is hidden', () => {
    const keys = curve(10, [
      [600, 10],
      [900, 95],
      [300, 95],
      [1200, 10],
      [500, 10],
    ]);
    const frames = sample(RAISE, keys, {
      anchor: 'below',
      sides: ['right'],
      other: { left: { angle: 0, visibility: 0.2 } },
    });
    const { counter } = runAll(RAISE, frames);
    expect(counter.side).toBe('right');
    expect(counter.reps).toBe(1);
  });
});

describe('createRepCounter: events', () => {
  it('fills index, t, tempo and angle range on every event', () => {
    const { events, eventFrameT } = runAll(CURL, sample(CURL, curlReps(3, 800, 1200)));
    expect(events.map((e) => e.index)).toEqual([1, 2, 3]);
    events.forEach((e, i) => {
      expect(e.type).toBe('rep');
      expect(e.t).toBe(eventFrameT[i]);
      // Curl: eccentric = lowering toward extended (1200 ms), concentric = curling up (800 ms).
      // Legs are timed between thresholds (70° ↔ 150° = 80/135 of each leg): ≈ 710 / 475 ms.
      expect(e.eccentricMs).toBeGreaterThan(620);
      expect(e.eccentricMs).toBeLessThan(850);
      expect(e.concentricMs).toBeGreaterThan(380);
      expect(e.concentricMs).toBeLessThan(600);
      expect(e.minAngle).toBeGreaterThan(33);
      expect(e.minAngle).toBeLessThan(40);
      expect(e.maxAngle).toBeGreaterThan(160);
      expect(e.maxAngle).toBeLessThanOrEqual(170.0001);
    });
    // Events are in time order.
    for (let i = 1; i < events.length; i++)
      expect(events[i]?.t ?? 0).toBeGreaterThan(events[i - 1]?.t ?? 0);
  });

  it('numbers reps and partials separately', () => {
    const keys = curve(170, [
      [600, 170],
      [600, 100],
      [700, 170],
      [500, 170],
      [800, 35],
      [300, 35],
      [1200, 170],
      [500, 170],
      [600, 95],
      [700, 170],
      [500, 170],
    ]);
    const { events } = runAll(CURL, sample(CURL, keys));
    expect(events.map((e) => `${e.type}${String(e.index)}`)).toEqual([
      'partial1',
      'rep1',
      'partial2',
    ]);
  });

  it('reset() clears counts and goes back to setup', () => {
    const { counter } = runAll(CURL, sample(CURL, curlReps(2)));
    expect(counter.reps).toBe(2);
    counter.reset();
    expect(counter.reps).toBe(0);
    expect(counter.partials).toBe(0);
    expect(counter.phase).toBe('setup');
    expect(counter.side).toBeNull();
    expect(counter.tracking).toBe(false);
    for (const f of sample(CURL, curlReps(1))) counter.push(f);
    expect(counter.reps).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// M4c: partial reasons, shortByDeg, the `start` partial and the coaching getters.
// ---------------------------------------------------------------------------------------------

describe('createRepCounter: partial reasons (M4c)', () => {
  it('a turnaround before the far threshold is reason far, shortByDeg = smoothed degrees short', () => {
    const keys = curve(170, [
      [600, 170],
      [600, 100], // contracted is 70°: ~30° short
      [700, 170],
      [500, 170],
    ]);
    const { events } = runAll(CURL, sample(CURL, keys));
    expect(events).toHaveLength(1);
    const p = events[0];
    expect(p?.type).toBe('partial');
    expect(p?.reason).toBe('far');
    expect(p?.shortByDeg).toBeCloseTo((p?.minAngle ?? 0) - CURL.contracted, 0);
    expect(p?.shortByDeg).toBeGreaterThan(28);
    expect(p?.shortByDeg).toBeLessThan(38); // EMA lag: the smoothed turn is a few degrees above 100°
  });

  it('far reason on an inverted lateral raise: shortByDeg below the contracted threshold', () => {
    const keys = curve(10, [
      [600, 10],
      [700, 55],
      [800, 10],
      [500, 10],
    ]);
    const { events } = runAll(RAISE, sample(RAISE, keys, { anchor: 'below' }));
    expect(events.map((e) => e.reason)).toEqual(['far']);
    const p = events[0];
    expect(p?.shortByDeg).toBeCloseTo(RAISE.contracted - (p?.maxAngle ?? 0), 0);
    expect(p?.shortByDeg).toBeGreaterThan(18);
    expect(p?.shortByDeg).toBeLessThan(23);
  });

  it('counted reps carry no reason or shortByDeg', () => {
    const { events } = runAll(CURL, sample(CURL, curlReps(2)));
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.reason).toBeUndefined();
      expect(e.shortByDeg).toBeUndefined();
    }
  });
});

describe('createRepCounter: start partial (incomplete return, M4c)', () => {
  /** Curl rep down to 35°, back only to `back`, down to 35° again, then a full return. */
  const incompleteCurl = (back: number, upMs = 900, againMs = 800) =>
    curve(170, [
      [600, 170],
      [800, 35],
      [300, 35],
      [upMs, back], // doesn't straighten (extended threshold is 150°)
      [200, back],
      [againMs, 35],
      [300, 35],
      [1200, 170],
      [500, 170],
    ]);

  it('reports a start partial, then counts the next rep in progress', () => {
    const { counter, events } = runAll(CURL, sample(CURL, incompleteCurl(120)));
    expect(events.map((e) => `${e.type}:${e.reason ?? ''}`)).toEqual(['partial:start', 'rep:']);
    expect(counter.reps).toBe(1);
    expect(counter.partials).toBe(1);
    const p = events[0];
    // Turned at ~120° smoothed: ~30° short of the 150° extended threshold.
    expect(p?.shortByDeg).toBeGreaterThan(27);
    expect(p?.shortByDeg).toBeLessThan(33);
    expect(p?.index).toBe(1);
    expect(p?.minAngle).toBeLessThan(40); // it did reach the far end
    expect(p?.eccentricMs).toBeGreaterThan(0);
    expect(p?.concentricMs).toBeGreaterThan(0);
    // The rep after it is timed from the turnaround, not from the original start.
    const rep = events[1];
    expect(rep?.concentricMs).toBeGreaterThan(150);
    expect(rep?.concentricMs).toBeLessThan(700);
  });

  it('several incomplete returns in a row: one start partial each, no rep until a full return', () => {
    const keys = curve(170, [
      [600, 170],
      [800, 35],
      [300, 35],
      [900, 115],
      [800, 35],
      [300, 35],
      [900, 115],
      [800, 35],
      [300, 35],
      [1200, 170],
      [500, 170],
    ]);
    const { events } = runAll(CURL, sample(CURL, keys));
    expect(events.map((e) => `${e.type}:${e.reason ?? ''}`)).toEqual([
      'partial:start',
      'partial:start',
      'rep:',
    ]);
  });

  it('start partial on a press (starts contracted): dumbbells not back to the shoulders', () => {
    const keys = curve(55, [
      [600, 55],
      [900, 175],
      [300, 175],
      [900, 105], // contracted (start) threshold is 80°
      [200, 105],
      [800, 175],
      [300, 175],
      [1300, 55],
      [500, 55],
    ]);
    const { counter, events } = runAll(PRESS, sample(PRESS, keys, { anchor: 'below' }));
    expect(events.map((e) => `${e.type}:${e.reason ?? ''}`)).toEqual(['partial:start', 'rep:']);
    expect(counter.reps).toBe(1);
    expect(events[0]?.shortByDeg).toBeGreaterThan(22);
    expect(events[0]?.shortByDeg).toBeLessThan(28);
  });

  it('start partial on an inverted lateral raise: arms not lowered fully', () => {
    const keys = curve(10, [
      [600, 10],
      [800, 90],
      [300, 90],
      [900, 50], // extended (start) threshold is 25°
      [200, 50],
      [800, 90],
      [300, 90],
      [1200, 10],
      [500, 10],
    ]);
    const { events } = runAll(RAISE, sample(RAISE, keys, { anchor: 'below' }));
    expect(events.map((e) => `${e.type}:${e.reason ?? ''}`)).toEqual(['partial:start', 'rep:']);
    expect(events[0]?.shortByDeg).toBeGreaterThan(22);
    expect(events[0]?.shortByDeg).toBeLessThan(28);
  });

  it('no start partial from ±8° jitter at the far end (centred on, and just inside, the threshold)', () => {
    for (const centre of [CURL.contracted, CURL.contracted - 5, CURL.contracted + 5]) {
      const keys = curve(170, [
        [600, 170],
        [800, centre],
        [3000, centre],
        [1200, 170],
        [500, 170],
      ]);
      const noise = (i: number) => (Math.floor(i / 3) % 2 === 0 ? 8 : -8);
      const { counter, events } = runAll(CURL, sample(CURL, keys, { noise }));
      expect(
        events.map((e) => e.type),
        `centre ${String(centre)}`,
      ).toEqual(['rep']);
      expect(counter.partials).toBe(0);
    }
  });

  it('a slow wobble near the far end (less than the partial depth back) is not a start partial', () => {
    // Up to contracted + hysteresis + 3 (out of the far band, but under minPartialDepth back).
    const wobble = CURL.contracted + CURL.hysteresisDeg + 3;
    expect(wobble - CURL.contracted).toBeLessThan(CURL.minPartialDepthDeg);
    const keys = curve(170, [
      [600, 170],
      [800, 35],
      [300, 35],
      [900, wobble],
      [200, wobble],
      [800, 35],
      [300, 35],
      [1200, 170],
      [500, 170],
    ]);
    const { counter, events } = runAll(CURL, sample(CURL, keys));
    expect(events.map((e) => e.type)).toEqual(['rep']);
    expect(counter.partials).toBe(0);
  });

  it('a rushed bob at the far end is not a start partial and keeps the rep timing', () => {
    const keys = curve(170, [
      [600, 170],
      [800, 35],
      [100, 110], // fast bob up and down (~100 ms each way)
      [100, 35],
      [300, 35],
      [1200, 170],
      [500, 170],
    ]);
    const { counter, events } = runAll(CURL, sample(CURL, keys));
    expect(events.map((e) => e.type)).toEqual(['rep']);
    expect(counter.partials).toBe(0);
    // Out leg still measured from the start (concentric = curling up, 800 ms → ~475 ms).
    expect(events[0]?.concentricMs).toBeGreaterThan(380);
  });

  it('one attempt gives at most one partial: a sag after the start partial is not also a far partial', () => {
    // Down to 35°, back only to 100°, sags toward the far end (held 300 ms), then straightens.
    const keys = curve(170, [
      [600, 170],
      [800, 35],
      [300, 35],
      [700, 100],
      [200, 100],
      [200, 80],
      [300, 80],
      [800, 170],
      [500, 170],
    ]);
    const { counter, events } = runAll(CURL, sample(CURL, keys));
    expect(events.map((e) => `${e.type}:${e.reason ?? ''}`)).toEqual(['partial:start']);
    expect(counter.partials).toBe(1);
    expect(counter.lastMiss).toBe('start');
  });

  it('after a start partial, the next attempt that reaches far and returns is a rep', () => {
    const keys = curve(170, [
      [600, 170],
      [800, 35],
      [300, 35],
      [700, 100],
      [200, 100],
      [200, 80],
      [300, 80],
      [800, 170],
      [500, 170],
      [800, 35],
      [300, 35],
      [1200, 170],
      [500, 170],
      [600, 100], // a genuine far miss later still reports far
      [700, 170],
      [500, 170],
    ]);
    const { events } = runAll(CURL, sample(CURL, keys));
    expect(events.map((e) => `${e.type}:${e.reason ?? ''}`)).toEqual([
      'partial:start',
      'rep:',
      'partial:far',
    ]);
  });

  it('a glitch spike toward the far end during the return (under one minimum leg) is ignored', () => {
    // Pose glitch while lowering (seen in the shoulder-press-02 / lateral-raise-01 clips): the
    // raw angle jumps back toward the far end for 2 frames (~67 ms), then the return continues.
    const keys = curve(170, [
      [600, 170],
      [800, 35],
      [300, 35],
      [500, 100],
      [33, 60], // spike: raw angle 40° the wrong way for two frames
      [33, 60],
      [33, 100],
      [600, 170],
      [500, 170],
    ]);
    const { counter, events } = runAll(CURL, sample(CURL, keys));
    expect(events.map((e) => `${e.type}:${e.reason ?? ''}`)).toEqual(['rep:']);
    expect(counter.partials).toBe(0);
  });

  it('a returning arm that reaches the start band is a rep, never a start partial', () => {
    const { events } = runAll(CURL, sample(CURL, curlReps(3)));
    expect(events.map((e) => `${e.type}:${e.reason ?? ''}`)).toEqual(['rep:', 'rep:', 'rep:']);
  });
});

describe('createRepCounter: coaching getters (M4c)', () => {
  it('exposes the rule it counts with (thresholds and hints for the UI)', () => {
    const counter = createRepCounter(CURL);
    expect(counter.rule).toBe(CURL);
  });

  it('reachedFar: false at the start, true from the far band until the rep ends', () => {
    const counter = createRepCounter(CURL);
    const seen: { t: number; phase: string; reachedFar: boolean }[] = [];
    for (const f of sample(CURL, curlReps(1))) {
      counter.push(f);
      seen.push({ t: f.t, phase: counter.phase, reachedFar: counter.reachedFar });
    }
    for (const s of seen) {
      expect(s.reachedFar, `${s.phase} @${String(s.t)}`).toBe(
        s.phase === 'bottom' || s.phase === 'up',
      );
    }
    expect(seen.some((s) => s.reachedFar)).toBe(true);
    expect(counter.reachedFar).toBe(false); // back at the top after the rep
  });

  it('lastMiss / lastPartial follow the latest event; a clean rep clears lastMiss', () => {
    const counter = createRepCounter(CURL);
    expect(counter.lastMiss).toBeNull();
    expect(counter.lastPartial).toBeNull();
    const keys = curve(170, [
      [600, 170],
      [600, 100], // far partial
      [700, 170],
      [500, 170],
      [800, 35],
      [300, 35],
      [900, 120], // start partial
      [200, 120],
      [800, 35],
      [300, 35],
      [1200, 170], // rep
      [500, 170],
    ]);
    const log: (string | null)[] = [];
    for (const f of sample(CURL, keys)) {
      for (const e of counter.push(f)) {
        log.push(counter.lastMiss);
        if (e.type === 'partial') expect(counter.lastPartial).toBe(e);
      }
    }
    expect(log).toEqual(['far', 'start', null]);
    expect(counter.lastPartial?.reason).toBe('start'); // kept after the rep
    counter.reset();
    expect(counter.lastMiss).toBeNull();
    expect(counter.lastPartial).toBeNull();
    expect(counter.reachedFar).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Real-data fixes (Push A dev log, 2026-11-13): image-plane angles for the press, and a torso
// posture gate for the lateral raise.
// ---------------------------------------------------------------------------------------------

/** Tilt the forearm (wrist) toward the camera in world only: the 3D angle shrinks, 2D doesn't. */
function tiltWristInWorld(rule: ExerciseRule, f: LandmarkFrame, dz: number): LandmarkFrame {
  const world = f.world?.map((p) => ({ ...p }));
  if (!world) return f;
  for (const side of ['left', 'right'] as const) {
    const wrist = world[rule.triplets[side][2]];
    if (wrist) wrist.z = dz;
  }
  return { ...f, world };
}

/** Stretch normalized x as a W/H video does (world stays metric). */
function stretchX(f: LandmarkFrame, aspect: number): LandmarkFrame {
  return { ...f, landmarks: f.landmarks.map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) / aspect })) };
}

/** Rotate the whole world body about the x axis (toward the camera): joint angles unchanged. */
function leanWorld(f: LandmarkFrame, deg: number): LandmarkFrame {
  const th = (deg * Math.PI) / 180;
  const world = f.world?.map((p) => ({
    x: p.x,
    y: p.y * Math.cos(th) - p.z * Math.sin(th),
    z: p.y * Math.sin(th) + p.z * Math.cos(th),
  }));
  return world ? { ...f, world } : f;
}

describe('createRepCounter: image-plane angles (rule.angleSpace image)', () => {
  const pressKeys = curve(55, [
    [600, 55],
    [900, 175],
    [300, 175],
    [1300, 55],
    [500, 55],
    [900, 175],
    [300, 175],
    [1300, 55],
    [500, 55],
  ]);

  it('the press measures in the image plane', () => {
    expect(PRESS.angleSpace).toBe('image');
  });

  it('counts presses the world model compresses (forearm tilted toward the camera in 3D)', () => {
    const frames = sample(PRESS, pressKeys, { anchor: 'below' }).map((f) =>
      tiltWristInWorld(PRESS, f, -0.1),
    );
    const image = runAll(PRESS, frames);
    expect(image.counter.reps).toBe(2);
    expect(image.counter.partials).toBe(0);
    // The same frames measured in world 3D never reach the extended threshold.
    const world = runAll({ ...PRESS, angleSpace: 'world' }, frames);
    expect(world.counter.reps).toBe(0);
  });

  it('corrects for the video aspect estimated from the pose (3:4 portrait)', () => {
    const still = curve(120, [[1000, 120]]);
    for (const aspect of [0.75, 16 / 9]) {
      const frames = sample(PRESS, still, { anchor: 'below' }).map((f) => stretchX(f, aspect));
      const { counter } = runAll(PRESS, frames);
      expect(counter.angle).toBeCloseTo(120, 4);
    }
  });

  it('uses raw normalized x/y (aspect 1) when frames have no world landmarks', () => {
    const { counter } = runAll(PRESS, sample(PRESS, pressKeys, { anchor: 'below', noWorld: true }));
    expect(counter.reps).toBe(2);
  });
});

describe('createRepCounter: torso posture gate (rule.maxTorsoLeanDeg)', () => {
  // Settle with arms down, bend over (arms hang: the shoulder angle opens to ~85°), stand up,
  // then one real raise. Without the gate the bend reads as a raise.
  const bendKeys = curve(10, [
    [800, 10],
    [400, 85], // bending down to pick up the dumbbells
    [1000, 85],
    [400, 10], // standing up
    [800, 10],
    [900, 95], // the real raise
    [300, 95],
    [1200, 10],
    [600, 10],
  ]);
  const bendStart = 800;
  const bendEnd = 2600;
  /** Lean (deg) of the torso over time: 0 upright, up to 90 during the bend. */
  const leanAt = (t: number) =>
    t <= bendStart || t >= bendEnd
      ? 0
      : 90 * Math.min(1, (t - bendStart) / 400, (bendEnd - t) / 400);

  function bendFrames(base = 0): LandmarkFrame[] {
    return sample(RAISE, bendKeys, { anchor: 'below' }).map((f) =>
      leanWorld(f, base + leanAt(f.t)),
    );
  }

  it('the lateral raise has the gate', () => {
    expect(RAISE.maxTorsoLeanDeg).toBeGreaterThan(20);
    expect(RAISE.maxTorsoLeanDeg).toBeLessThan(60);
  });

  it('bending over to pick up the dumbbells is not a rep (and not a partial)', () => {
    const { counter } = runAll(RAISE, bendFrames());
    expect({ reps: counter.reps, partials: counter.partials }).toEqual({ reps: 1, partials: 0 });
  });

  it('without the gate the same bend counts as a phantom rep (what the Push A log showed)', () => {
    const ungated: ExerciseRule = { ...RAISE };
    delete ungated.maxTorsoLeanDeg;
    const { counter } = runAll(ungated, bendFrames());
    expect(counter.reps).toBe(2);
  });

  it('measures the lean from the posture at settle, so a pitched phone does not matter', () => {
    const { counter } = runAll(RAISE, bendFrames(35));
    expect({ reps: counter.reps, partials: counter.partials }).toEqual({ reps: 1, partials: 0 });
  });

  it('an attempt cut short by the lean is dropped: arms already half up before the gate trips', () => {
    // The arms open to ~50° while the lean is still under the gate (reaching down), then the
    // bend passes the gate. On standing up the attempt is gone: no `far` partial.
    const keys = curve(10, [
      [800, 10],
      [600, 50],
      [400, 85],
      [800, 85],
      [400, 10],
      [800, 10],
      [900, 95],
      [300, 95],
      [1200, 10],
      [600, 10],
    ]);
    const lean = (t: number) =>
      t <= 800
        ? 0
        : t <= 1400
          ? (30 * (t - 800)) / 600
          : t <= 1800
            ? 30 + (60 * (t - 1400)) / 400
            : t <= 2600
              ? 90
              : t <= 3000
                ? 90 - (90 * (t - 2600)) / 400
                : 0;
    const frames = sample(RAISE, keys, { anchor: 'below' }).map((f) => leanWorld(f, lean(f.t)));
    const { counter } = runAll(RAISE, frames);
    expect({ reps: counter.reps, partials: counter.partials }).toEqual({ reps: 1, partials: 0 });
  });

  it('reports not tracking while leaning past the gate', () => {
    const counter = createRepCounter(RAISE);
    let trackedDuringBend = false;
    for (const f of bendFrames()) {
      counter.push(f);
      if (leanAt(f.t) > (RAISE.maxTorsoLeanDeg ?? 0) + 1 && counter.tracking)
        trackedDuringBend = true;
    }
    expect(trackedDuringBend).toBe(false);
  });

  it('a stream restart takes a new reference posture at the next settle', () => {
    const first = sample(RAISE, curve(10, [[800, 10]]), { anchor: 'below' });
    // Second segment (t restarts at 0) is filmed 40° pitched: still counts its rep.
    const second = sample(RAISE, curve(10, segsOf(bendKeys).slice(4)), { anchor: 'below' }).map(
      (f) => leanWorld(f, 40),
    );
    const { counter } = runAll(RAISE, [...first, ...second]);
    expect(counter.reps).toBe(1);
  });

  it('frames without world landmarks skip the gate', () => {
    const frames = sample(RAISE, curve(10, segsOf(bendKeys).slice(4)), {
      anchor: 'below',
      noWorld: true,
    });
    expect(runAll(RAISE, frames).counter.reps).toBe(1);
  });
});

describe('createRepCounter: camera view variant (rule.otherView, push-up filmed head-on)', () => {
  const PUSHUP = mustRule('Pushups');

  /** Turn the world body 90° about the vertical axis: the shoulder line runs toward the camera. */
  function sideOn(f: LandmarkFrame): LandmarkFrame {
    const world = f.world?.map((p) => ({ x: -p.z, y: p.y, z: p.x }));
    return world ? { ...f, world } : f;
  }

  // Push-ups that bottom out at 110° (what a head-on camera measures for a full push-up).
  const keys = curve(165, [
    [600, 165],
    [700, 110],
    [200, 110],
    [700, 165],
    [500, 165],
    [700, 110],
    [200, 110],
    [700, 165],
    [500, 165],
  ]);

  it('the push-up rule has a front-view variant: both arms, a shallower contracted threshold', () => {
    expect(PUSHUP.view).toBe('side');
    expect(PUSHUP.otherView).toMatchObject({ view: 'front', sideMode: 'both' });
    expect(PUSHUP.otherView?.contracted).toBeGreaterThan(PUSHUP.contracted);
  });

  it('head-on (shoulder line across the image): counts with the front thresholds', () => {
    const { counter } = runAll(PUSHUP, sample(PUSHUP, keys));
    expect({ reps: counter.reps, partials: counter.partials }).toEqual({ reps: 2, partials: 0 });
    expect(counter.rule.view).toBe('front');
    expect(counter.rule.contracted).toBe(PUSHUP.otherView?.contracted);
    expect(counter.side).toBe('both');
    // Hints and placement stay the exercise's own.
    expect(counter.rule.hints).toBe(PUSHUP.hints);
    expect(counter.rule.placement).toBe(PUSHUP.placement);
  });

  it('side-on (shoulder line toward the camera): keeps the side thresholds', () => {
    const { counter } = runAll(PUSHUP, sample(PUSHUP, keys).map(sideOn));
    expect({ reps: counter.reps, partials: counter.partials }).toEqual({ reps: 0, partials: 2 });
    expect(counter.rule).toBe(PUSHUP);
  });

  it('without world landmarks the view cannot be judged: the rule as written', () => {
    const { counter } = runAll(PUSHUP, sample(PUSHUP, keys, { noWorld: true }));
    expect(counter.rule).toBe(PUSHUP);
  });

  it('the view is locked at the settle and re-judged after a stream restart', () => {
    const headOn = sample(PUSHUP, keys);
    const side = sample(PUSHUP, keys).map(sideOn);
    const counter = createRepCounter(PUSHUP);
    for (const f of headOn) counter.push(f);
    expect(counter.rule.view).toBe('front');
    for (const f of side) counter.push(f); // t restarts at 0
    expect(counter.rule).toBe(PUSHUP);
    expect(counter.reps).toBe(2); // counts kept
    counter.reset();
    expect(counter.rule).toBe(PUSHUP);
  });

  it('rules without a variant never switch', () => {
    const { counter } = runAll(CURL, sample(CURL, curlReps(1)));
    expect(counter.rule).toBe(CURL);
  });
});
