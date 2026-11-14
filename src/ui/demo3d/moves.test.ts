import { describe, expect, it } from 'vitest';
import { RULES, ruleFor } from '../../core/exercises';
import exercises from '../../data/exercises.json';
import howto from '../../data/howto.json';
import program from '../../data/program.json';
import { MUSCLES } from '../bodyMap';
import { DEMO_IDS as ID_LIST, hasDemo as idsHasDemo } from './ids';
import {
  DEMO_IDS,
  DEMOS,
  TEMPO,
  angleAt,
  cycleSeconds,
  demoFor,
  hasDemo,
  holdSeconds,
  phaseAt,
  poseAt,
  tempoLabel,
  trackFor,
  type DemoMove,
  type Phase,
} from './moves';
import {
  BENT_ROW,
  CABLE_ROW,
  CALF,
  CONC_CURL,
  DIPS,
  FACE_PULL,
  LEG_CURL,
  LEG_EXT,
  LEG_PRESS,
  PULLDOWN,
  SEATED_CALF,
  STEP_UP,
  angleAtJoint,
  boneLengths,
  hipJoint,
  measuredAngle,
  type DemoPose,
  type DemoProp,
  type V3,
} from './poses';

const PUSH_A_TRACKED = ['Pushups', 'Seated_Dumbbell_Press', 'Side_Lateral_Raise'];
const M4D_TRACKED = ['Dumbbell_Bicep_Curl', 'One-Arm_Dumbbell_Row', 'Goblet_Squat'];
/** The six rules that shipped through M4/M5: a floor, never fewer tracked demos than these. */
const ORIGINAL_TRACKED = [...PUSH_A_TRACKED, ...M4D_TRACKED];

/** SPEC M4f wave 1: the six exercises that gained a camera rule (and a demo) in that wave. */
const M4F_WAVE1 = [
  'Hammer_Curls',
  'Concentration_Curls',
  'Incline_Dumbbell_Curl',
  'Dumbbell_Shoulder_Press',
  'Bent_Over_Two-Dumbbell_Row',
  'Standing_Dumbbell_Triceps_Extension',
];

/**
 * SPEC M4f "Stays manual": lying, seated-machine, bench-dip and crossover exercises never get a
 * camera rule.
 */
const STAYS_MANUAL = [
  'Dumbbell_Bench_Press',
  'Incline_Dumbbell_Press',
  'Dumbbell_Flyes',
  'Bench_Dips',
  'Cable_Crossover',
  'Leg_Press',
  'Leg_Extensions',
  'Lying_Leg_Curls',
  'Dumbbell_Seated_One-Leg_Calf_Raise',
];

/**
 * Demos whose 3D preset differs from the rule's camera view, with the reason. Concentration
 * curls: the phone sits about 3/4 from the working side (SPEC M4f), between the two presets; the
 * demo opens on the front preset, where the forearm curling across toward the chest reads best.
 */
const DEMO_VIEW_DIFFERS: Readonly<Record<string, 'side' | 'front'>> = {
  Concentration_Curls: 'front',
};

/**
 * Every demo the camera counts: read from the rule data, never a fixed list, so each new rule's
 * demo is checked against its own (retuned) thresholds.
 */
const POSE_TRACKED = DEMO_IDS.filter((id) => ruleFor(id) !== undefined);
const PROGRAM_TRACKING = new Map(
  program.days.flatMap((d) => d.exercises.map((e) => [e.exerciseId, e.tracking] as const)),
);
const MANUAL = [
  'Dumbbell_Bench_Press',
  'Incline_Dumbbell_Press',
  'Standing_Dumbbell_Triceps_Extension',
];
/** M4d Pull A manual exercises. */
const PULL_A_MANUAL = ['Hammer_Curls', 'Reverse_Flyes', 'Wide-Grip_Lat_Pulldown'];
/** M4d batch 2: the Legs A and Push B exercises that had no demo yet. */
const LEGS_PUSH_B = [
  'Stiff-Legged_Dumbbell_Deadlift',
  'Dumbbell_Lunges',
  'Lying_Leg_Curls',
  'Standing_Calf_Raises',
  'Dumbbell_Flyes',
  'Dumbbell_Shoulder_Press',
  'Cable_Crossover',
  'Triceps_Pushdown',
  'Bench_Dips',
];
/** M4d batch 2: the Pull B and Legs B exercises that had no demo yet. */
const PULL_B = [
  'Bent_Over_Two-Dumbbell_Row',
  'Seated_Cable_Rows',
  'Face_Pull',
  'Incline_Dumbbell_Curl',
  'Concentration_Curls',
];
const LEGS_B = [
  'Leg_Press',
  'Dumbbell_Step_Ups',
  'Leg_Extensions',
  'Dumbbell_Seated_One-Leg_Calf_Raise',
];
const HOWTO = howto as Record<string, { tempo: string; focus: string } | undefined>;
const STEP = 1 / 60;

function must<T>(x: T | undefined, what = 'value'): T {
  if (x === undefined) throw new Error(`missing ${what}`);
  return x;
}

/** Samples one loop of the demo at 60 fps. */
function sampleLoop(m: DemoMove): { t: number; pose: DemoPose; angle: number }[] {
  const out = [];
  const total = cycleSeconds(m);
  for (let t = 0; t <= total + 1e-9; t += STEP) {
    const pose = poseAt(m, t);
    out.push({ t, pose, angle: measuredAngle(pose, m.measure.joint, m.measure.side) });
  }
  return out;
}

const flatPose = (p: DemoPose): number[] => [
  ...p.hip,
  ...p.neck,
  ...p.face,
  ...[p.r, p.l].flatMap((s) => [s.s, s.e, s.w, s.h, s.k, s.a, s.toe].flat()),
  ...p.bells.flatMap((b) => [...b.pos, ...b.axis]),
];

describe('demo registry', () => {
  it('has a demo for every exercise with a counter rule (at least the original six)', () => {
    expect(POSE_TRACKED).toEqual(expect.arrayContaining(ORIGINAL_TRACKED));
    for (const r of RULES) expect(POSE_TRACKED, r.exerciseId).toContain(r.exerciseId);
    for (const id of POSE_TRACKED) {
      expect(hasDemo(id), id).toBe(true);
      expect(demoFor(id)?.exerciseId).toBe(id);
    }
  });

  it('has demos for all six Push A exercises', () => {
    for (const id of [...PUSH_A_TRACKED, ...MANUAL]) expect(hasDemo(id), id).toBe(true);
  });

  it('every M4f wave 1 exercise is a real exercise with a rule and a demo', () => {
    const catalog = new Set(exercises.map((e) => e.id));
    for (const id of M4F_WAVE1) {
      expect(catalog.has(id), id).toBe(true);
      expect(ruleFor(id), id).toBeDefined();
      expect(hasDemo(id), id).toBe(true);
    }
  });

  it('program tracking agrees with the rule data', () => {
    for (const [id, tracking] of PROGRAM_TRACKING) {
      // Camera-tracked in the program => a rule exists.
      if (tracking === 'pose') expect(ruleFor(id), id).toBeDefined();
      // Manual in the program => no rule.
      if (tracking === 'manual') expect(ruleFor(id), id).toBeUndefined();
    }
    for (const id of STAYS_MANUAL) {
      expect(ruleFor(id), id).toBeUndefined();
      expect(PROGRAM_TRACKING.get(id), id).toBe('manual');
    }
  });

  it('demos every Pull A exercise', () => {
    const pullA = program.days.find((d) => d.id === 'pull-a');
    expect(pullA).toBeDefined();
    for (const e of pullA?.exercises ?? []) expect(hasDemo(e.exerciseId), e.exerciseId).toBe(true);
    for (const id of PULL_A_MANUAL) expect(demoFor(id)?.exerciseId).toBe(id);
  });

  it('demos every Legs A and Push B exercise', () => {
    for (const day of ['legs-a', 'push-b']) {
      const d = program.days.find((x) => x.id === day);
      expect(d, day).toBeDefined();
      for (const e of d?.exercises ?? []) expect(hasDemo(e.exerciseId), e.exerciseId).toBe(true);
    }
    for (const id of LEGS_PUSH_B) expect(demoFor(id)?.exerciseId).toBe(id);
  });

  it('demos every Pull B and Legs B exercise', () => {
    for (const day of ['pull-b', 'legs-b']) {
      const d = program.days.find((x) => x.id === day);
      expect(d, day).toBeDefined();
      for (const e of d?.exercises ?? []) expect(hasDemo(e.exerciseId), e.exerciseId).toBe(true);
    }
    for (const id of [...PULL_B, ...LEGS_B]) expect(demoFor(id)?.exerciseId).toBe(id);
  });

  it('demos every exercise in the program (no "Info" badge left on any day)', () => {
    const ids = new Set(program.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) expect(demoFor(id)?.exerciseId, id).toBe(id);
  });

  it('has no demo for an unknown id', () => {
    expect(hasDemo('nope')).toBe(false);
    expect(idsHasDemo('nope')).toBe(false);
    expect(demoFor('nope')).toBeUndefined();
  });

  it('the id-only list (ids.ts, main chunk) matches the registry exactly, in order', () => {
    expect(ID_LIST).toEqual(DEMOS.map((d) => d.exerciseId));
    for (const m of DEMOS) expect(idsHasDemo(m.exerciseId), m.exerciseId).toBe(true);
  });

  it('lists only real exercise ids, once each', () => {
    const ids = new Set(exercises.map((e) => e.id));
    for (const id of DEMO_IDS) expect(ids.has(id), id).toBe(true);
    expect(new Set(DEMO_IDS).size).toBe(DEMO_IDS.length);
    expect(DEMO_IDS).toEqual(DEMOS.map((d) => d.exerciseId));
  });
});

describe('tempo', () => {
  it('lifts in 1 s, holds 0.3 s, lowers in 2 s, pauses 0.5 s', () => {
    expect(TEMPO).toEqual({ lift: 1, hold: 0.3, lower: 2, pause: 0.5 });
    expect(TEMPO.lower).toBeGreaterThan(TEMPO.lift);
  });

  it('labels the tempo in the order the rep happens', () => {
    expect(tempoLabel(must(demoFor('Pushups')))).toBe('Down 2 s · Up 1 s');
    expect(tempoLabel(must(demoFor('Seated_Dumbbell_Press')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Side_Lateral_Raise')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Dumbbell_Bench_Press')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Incline_Dumbbell_Press')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Standing_Dumbbell_Triceps_Extension')))).toBe(
      'Down 2 s · Up 1 s',
    );
    expect(tempoLabel(must(demoFor('Dumbbell_Bicep_Curl')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('One-Arm_Dumbbell_Row')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Goblet_Squat')))).toBe('Down 2 s · Up 1 s');
    expect(tempoLabel(must(demoFor('Hammer_Curls')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Reverse_Flyes')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Wide-Grip_Lat_Pulldown')))).toBe('Pull 1 s · Return 2 s');
    expect(tempoLabel(must(demoFor('Stiff-Legged_Dumbbell_Deadlift')))).toBe('Down 2 s · Up 1 s');
    expect(tempoLabel(must(demoFor('Dumbbell_Lunges')))).toBe('Down 2 s · Up 1 s');
    expect(tempoLabel(must(demoFor('Lying_Leg_Curls')))).toBe('Lift 1 s · Hold 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Standing_Calf_Raises')))).toBe(
      'Lift 1 s · Hold 1 s · Lower 2 s',
    );
    expect(tempoLabel(must(demoFor('Dumbbell_Flyes')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Dumbbell_Shoulder_Press')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Cable_Crossover')))).toBe('Pull 1 s · Hold 1 s · Return 2 s');
    expect(tempoLabel(must(demoFor('Triceps_Pushdown')))).toBe('Push 1 s · Hold 1 s · Return 2 s');
    expect(tempoLabel(must(demoFor('Bench_Dips')))).toBe('Down 2 s · Up 1 s');
    expect(tempoLabel(must(demoFor('Bent_Over_Two-Dumbbell_Row')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Seated_Cable_Rows')))).toBe('Pull 1 s · Return 2 s');
    expect(tempoLabel(must(demoFor('Face_Pull')))).toBe('Pull 1 s · Hold 1 s · Return 2 s');
    expect(tempoLabel(must(demoFor('Incline_Dumbbell_Curl')))).toBe('Lift 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Concentration_Curls')))).toBe(
      'Lift 1 s · Hold 1 s · Lower 2 s',
    );
    expect(tempoLabel(must(demoFor('Leg_Press')))).toBe('Down 2 s · Up 1 s');
    expect(tempoLabel(must(demoFor('Dumbbell_Step_Ups')))).toBe('Up 1 s · Down 2 s');
    expect(tempoLabel(must(demoFor('Leg_Extensions')))).toBe('Lift 1 s · Hold 1 s · Lower 2 s');
    expect(tempoLabel(must(demoFor('Dumbbell_Seated_One-Leg_Calf_Raise')))).toBe(
      'Lift 1 s · Hold 1 s · Lower 2 s',
    );
  });

  it('holds 1 s at the top when the how-to tempo line says so, 0.3 s otherwise', () => {
    for (const m of DEMOS) {
      const says = /Hold 1 s/.test(HOWTO[m.exerciseId]?.tempo ?? '');
      expect(holdSeconds(m), m.exerciseId).toBe(says ? 1 : TEMPO.hold);
    }
    expect(holdSeconds(must(demoFor('Lying_Leg_Curls')))).toBe(1);
    expect(holdSeconds(must(demoFor('Pushups')))).toBe(TEMPO.hold);
  });

  for (const m of DEMOS) {
    it(`${m.exerciseId}: the tempo text matches the how-to tempo line`, () => {
      expect(tempoLabel(m)).toBe(HOWTO[m.exerciseId]?.tempo);
    });
  }

  for (const id of POSE_TRACKED) {
    it(`${id}: the eccentric leg (from rule.eccentric) takes 2 s, the other 1 s`, () => {
      const m = must(demoFor(id));
      const rule = must(ruleFor(id));
      const [k0, k1, k2, k3, k4] = trackFor(m).map((k) => k);
      const key = (k: { t: number; angle: number } | undefined) => must(k, 'key');
      const outLeg = key(k2).t - key(k1).t; // start -> far
      const backLeg = key(k4).t - key(k3).t; // far -> start
      expect(key(k0).angle).toBe(m.start);
      expect(key(k2).angle).toBe(m.far);
      // Going start -> far moves toward the far end; it is the lowering iff that is the eccentric.
      const outDir = rule.start === 'extended' ? 'toContracted' : 'toExtended';
      const lowering = outDir === rule.eccentric ? outLeg : backLeg;
      const lifting = outDir === rule.eccentric ? backLeg : outLeg;
      expect(lowering).toBeCloseTo(TEMPO.lower, 9);
      expect(lifting).toBeCloseTo(TEMPO.lift, 9);
      expect(lowering).toBeGreaterThan(lifting);
    });
  }

  for (const m of DEMOS) {
    it(`${m.exerciseId}: the lowering phase lasts longer than the lift`, () => {
      const total = cycleSeconds(m);
      expect(total).toBeCloseTo(TEMPO.lift + holdSeconds(m) + TEMPO.lower + TEMPO.pause, 9);
      const time: Record<Phase, number> = { lift: 0, hold: 0, lower: 0, pause: 0 };
      for (let t = STEP / 2; t < total; t += STEP) time[phaseAt(m, t)] += STEP;
      expect(time.lift).toBeCloseTo(TEMPO.lift, 1);
      expect(time.lower).toBeCloseTo(TEMPO.lower, 1);
      expect(time.hold).toBeCloseTo(holdSeconds(m), 1);
      expect(time.pause).toBeCloseTo(TEMPO.pause, 1);
      expect(time.lower).toBeGreaterThan(time.lift);
    });

    it(`${m.exerciseId}: the lift moves the weight up, the lowering moves it down`, () => {
      // Find the mid-phase times and compare hand height a moment later.
      const total = cycleSeconds(m);
      const mid = (p: string) => {
        for (let t = 0; t < total; t += STEP)
          if (phaseAt(m, t) === p) {
            let end = t;
            while (end < total && phaseAt(m, end) === p) end += STEP;
            return (t + end) / 2;
          }
        throw new Error(`no ${p} phase`);
      };
      // Push-up: the "weight" is the body, so track the shoulder; a machine names its load (the
      // pulldown's weight stack); otherwise the hand.
      const y = (t: number) => {
        const p = poseAt(m, t);
        if (p.load) return p.load[1];
        return m.exerciseId === 'Pushups' ? p.r.s[1] : p.r.h[1];
      };
      expect(y(mid('lift') + 0.05)).toBeGreaterThan(y(mid('lift') - 0.05));
      expect(y(mid('lower') + 0.05)).toBeLessThan(y(mid('lower') - 0.05));
    });
  }

  it('starts and ends at the pause (start position)', () => {
    for (const m of DEMOS) expect(phaseAt(m, 0)).toBe('pause');
  });
});

describe('keyframe tracks', () => {
  for (const m of DEMOS) {
    it(`${m.exerciseId}: the loop is continuous (last frame = first frame)`, () => {
      const track = trackFor(m);
      expect(track[0]).toEqual({ t: 0, angle: m.start });
      expect(track.at(-1)?.angle).toBe(m.start);
      expect(track.at(-1)?.t).toBeCloseTo(cycleSeconds(m), 9);
      const first = flatPose(poseAt(m, 0));
      const last = flatPose(poseAt(m, cycleSeconds(m)));
      first.forEach((x, i) => expect(last[i]).toBeCloseTo(x, 9));
      // Wraps around: one loop later is the same pose.
      expect(angleAt(track, 0.7 + cycleSeconds(m))).toBeCloseTo(angleAt(track, 0.7), 9);
      // No jumps anywhere in the loop (60 fps).
      const s = sampleLoop(m);
      s.slice(1).forEach((cur, i) => {
        const prev = must(s[i]);
        expect(Math.abs(cur.angle - prev.angle), `t=${cur.t}`).toBeLessThan(6);
      });
    });

    it(`${m.exerciseId}: times strictly increase`, () => {
      const track = trackFor(m);
      track.slice(1).forEach((k, i) => expect(k.t).toBeGreaterThan(must(track[i]).t));
    });

    it(`${m.exerciseId}: bone lengths stay constant through the loop`, () => {
      const ref = boneLengths(poseAt(m, 0));
      for (const { t, pose } of sampleLoop(m)) {
        const b = boneLengths(pose);
        for (const k of Object.keys(ref) as (keyof typeof ref)[])
          expect(b[k], `${k} @ t=${t.toFixed(2)}`).toBeCloseTo(must(ref[k], k), 4);
      }
    });

    it(`${m.exerciseId}: reaches its declared start and far angles on its own joints`, () => {
      const s = sampleLoop(m);
      const angles = s.map((x) => x.angle);
      const near = (target: number) => Math.min(...angles.map((a) => Math.abs(a - target)));
      expect(near(m.start)).toBeLessThan(3);
      expect(near(m.far)).toBeLessThan(3);
      expect(Math.abs(must(s[0]).angle - m.start)).toBeLessThan(2.5);
    });
  }
});

describe('pose-tracked demos vs the rep counter thresholds', () => {
  for (const id of POSE_TRACKED) {
    it(`${id}: a full rep goes >= 10 deg past both thresholds`, () => {
      const m = must(demoFor(id));
      const rule = must(ruleFor(id), id);
      const angles = sampleLoop(m).map((x) => x.angle);
      const lo = Math.min(...angles);
      const hi = Math.max(...angles);
      if (rule.direction === 'decreasing') {
        expect(hi).toBeGreaterThanOrEqual(rule.extended + 10);
        expect(lo).toBeLessThanOrEqual(rule.contracted - 10);
      } else {
        expect(lo).toBeLessThanOrEqual(rule.extended - 10);
        expect(hi).toBeGreaterThanOrEqual(rule.contracted + 10);
      }
      // Every angle stays physically sensible (no IK blow-ups).
      for (const a of angles) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(180.0001);
      }
    });

    it(`${id}: starts where the rule's reps start, and lowers the way the rule says`, () => {
      const m = must(demoFor(id));
      const rule = must(ruleFor(id));
      const startIsExtended = rule.direction === 'decreasing' ? m.start > m.far : m.start < m.far;
      expect(startIsExtended ? 'extended' : 'contracted').toBe(rule.start);
      const outward = rule.start === 'extended' ? 'toContracted' : 'toExtended';
      expect(m.outward).toBe(outward === rule.eccentric ? 'lower' : 'lift');
      expect(m.view).toBe(DEMO_VIEW_DIFFERS[id] ?? rule.view);
    });
  }
});

describe('manual-count demos (original poses)', () => {
  it('declare the rep from the right end: presses start low, the extension starts overhead', () => {
    expect(must(demoFor('Dumbbell_Bench_Press'))).toMatchObject({ start: 70, far: 180 });
    expect(must(demoFor('Incline_Dumbbell_Press'))).toMatchObject({ start: 70, far: 180 });
    expect(must(demoFor('Standing_Dumbbell_Triceps_Extension'))).toMatchObject({
      start: 180,
      far: 45,
      outward: 'lower',
    });
  });

  for (const id of ['Dumbbell_Bench_Press', 'Incline_Dumbbell_Press']) {
    it(`${id}: lies on the bench, dumbbells stay above it, arms end straight over the chest`, () => {
      const m = must(demoFor(id));
      const benchTop = Math.max(
        ...m.props.filter((p) => !p.rotZ).map((p) => p.at[1] + p.size[1] / 2),
      );
      for (const { pose } of sampleLoop(m)) {
        expect(pose.hip[1]).toBeGreaterThan(benchTop);
        for (const b of pose.bells) expect(b.pos[1]).toBeGreaterThan(benchTop);
        // Hands stay on their own side of the body.
        expect(pose.r.h[2]).toBeGreaterThan(0);
        expect(pose.l.h[2]).toBeLessThan(0);
      }
      // At the top the hands sit over the shoulders (within 15 cm sideways, above them).
      const top = m.pose(m.far);
      for (const sd of [top.r, top.l]) {
        expect(Math.abs(sd.h[2] - sd.s[2])).toBeLessThan(0.15);
        expect(sd.h[1]).toBeGreaterThan(sd.s[1] + 0.4);
      }
    });
  }

  it('Incline_Dumbbell_Press: the torso is inclined, head higher than hips; hands end slightly in', () => {
    const inc = must(demoFor('Incline_Dumbbell_Press')).pose(180);
    const flat = must(demoFor('Dumbbell_Bench_Press')).pose(180);
    expect(inc.neck[1] - inc.hip[1]).toBeGreaterThan(0.15);
    expect(Math.abs(flat.neck[1] - flat.hip[1])).toBeLessThan(1e-9);
    expect(Math.abs(inc.r.h[2])).toBeLessThan(Math.abs(inc.r.s[2]));
  });

  it('Standing_Dumbbell_Triceps_Extension: upper arms stay still, one dumbbell goes behind the head', () => {
    const m = must(demoFor('Standing_Dumbbell_Triceps_Extension'));
    const ref = m.pose(m.start);
    for (const { pose } of sampleLoop(m)) {
      for (const k of ['r', 'l'] as const) {
        pose[k].s.forEach((x, i) => expect(x).toBeCloseTo(ref[k].s[i] ?? NaN, 9));
        pose[k].e.forEach((x, i) => expect(x).toBeCloseTo(ref[k].e[i] ?? NaN, 9));
      }
      expect(pose.bells).toHaveLength(1);
    }
    const top = must(ref.bells[0]);
    const low = must(m.pose(m.far).bells[0]);
    expect(top.pos[1]).toBeGreaterThan(ref.neck[1] + 0.5); // overhead
    expect(low.pos[0]).toBeLessThan(-0.12); // behind the head (head centre x = 0)
    expect(low.pos[1]).toBeGreaterThan(ref.neck[1]); // still above the shoulders
  });
});

describe('M4d pose-tracked demos (curl, row, goblet squat)', () => {
  const close = (a: readonly number[], b: readonly number[], what: string, digits = 9) =>
    a.forEach((x, i) => expect(x, what).toBeCloseTo(b[i] ?? NaN, digits));

  it('Dumbbell_Bicep_Curl: the upper arms stay still, the dumbbells rise to the shoulders', () => {
    const m = must(demoFor('Dumbbell_Bicep_Curl'));
    const ref = m.pose(m.start);
    for (const { pose } of sampleLoop(m))
      for (const k of ['r', 'l'] as const) {
        close(pose[k].s, ref[k].s, `${k}.s`);
        close(pose[k].e, ref[k].e, `${k}.e`);
        expect(pose.bells).toHaveLength(2);
      }
    const top = m.pose(m.far);
    // Bottom: hands below the hips' height of the elbows; top: near shoulder height, in front.
    expect(ref.r.h[1]).toBeLessThan(ref.r.e[1] - 0.2);
    expect(top.r.h[1]).toBeGreaterThan(top.r.e[1] + 0.15);
    expect(top.r.h[0]).toBeGreaterThan(top.r.e[0]);
  });

  it('One-Arm_Dumbbell_Row: torso stays roughly horizontal and still, the support arm does not move', () => {
    const m = must(demoFor('One-Arm_Dumbbell_Row'));
    const ref = m.pose(m.start);
    const bench = must(m.props[0], 'bench');
    const benchTop = bench.at[1] + bench.size[1] / 2;
    for (const { pose } of sampleLoop(m)) {
      // Within 25 deg of horizontal (hinged 70 deg from vertical).
      const dy = pose.neck[1] - pose.hip[1];
      const dx = pose.neck[0] - pose.hip[0];
      expect(Math.abs((Math.atan2(dy, dx) * 180) / Math.PI)).toBeLessThan(25);
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      for (const j of ['s', 'e', 'w', 'h', 'k', 'a', 'toe'] as const)
        close(pose.l[j], ref.l[j], `l.${j}`);
      // Feet on the floor; one dumbbell, in the rowing (right) hand, never through the floor.
      for (const k of ['r', 'l'] as const) expect(pose[k].toe[1]).toBeLessThan(0.05);
      expect(pose.bells).toHaveLength(1);
      expect(must(pose.bells[0]).pos[2]).toBeGreaterThan(0);
      expect(must(pose.bells[0]).pos[1]).toBeGreaterThan(0.1);
    }
    // The support hand rests on the bench top, inside its footprint.
    const hand = ref.l.w;
    expect(Math.abs(hand[1] - benchTop)).toBeLessThan(0.06);
    expect(Math.abs(hand[0] - bench.at[0])).toBeLessThan(bench.size[0] / 2);
    expect(Math.abs(hand[2] - bench.at[2])).toBeLessThan(bench.size[2] / 2);
    // Rowing: the elbow goes up and back past the torso line.
    const top = m.pose(m.far);
    expect(top.r.e[1]).toBeGreaterThan(ref.r.e[1] + 0.15);
    expect(top.r.e[0]).toBeLessThan(ref.r.e[0] - 0.15);
  });

  it('Goblet_Squat: feet stay flat on the floor, the dumbbell stays at the chest', () => {
    const m = must(demoFor('Goblet_Squat'));
    const ref = m.pose(m.start);
    let lowestHip = Infinity;
    for (const { pose } of sampleLoop(m)) {
      for (const k of ['r', 'l'] as const) {
        close(pose[k].a, ref[k].a, `${k}.a`);
        close(pose[k].toe, ref[k].toe, `${k}.toe`);
        expect(pose[k].toe[1]).toBeLessThan(0.05);
      }
      expect(pose.bells).toHaveLength(1);
      const bell = must(pose.bells[0]);
      // Chest height: up to 25 cm below the shoulder line along the spine, within 40 cm of it.
      const ux = (pose.neck[0] - pose.hip[0]) / 0.5;
      const uy = (pose.neck[1] - pose.hip[1]) / 0.5;
      const rx = bell.pos[0] - pose.neck[0];
      const ry = bell.pos[1] - pose.neck[1];
      const along = rx * ux + ry * uy;
      expect(along).toBeGreaterThan(-0.25);
      expect(along).toBeLessThan(0);
      expect(Math.hypot(rx, ry)).toBeLessThan(0.4);
      // In front of the chest (the side the face points to).
      expect(rx * pose.face[0] + ry * pose.face[1]).toBeGreaterThan(0.2);
      expect(bell.pos[2]).toBe(0);
      lowestHip = Math.min(lowestHip, pose.hip[1]);
    }
    // A real squat: hips drop at least 25 cm.
    expect(ref.hip[1] - lowestHip).toBeGreaterThan(0.25);
  });
});

describe('manual-count demos without a rule: the range comes from the demo itself', () => {
  for (const m of DEMOS.filter((d) => !ruleFor(d.exerciseId))) {
    it(`${m.exerciseId}: a manual program exercise with a real range of motion`, () => {
      expect(PROGRAM_TRACKING.get(m.exerciseId)).toBe('manual');
      expect(Math.abs(m.far - m.start)).toBeGreaterThanOrEqual(30);
      const angles = sampleLoop(m).map((x) => x.angle);
      const lo = Math.min(m.start, m.far);
      const hi = Math.max(m.start, m.far);
      // Stays between its declared ends (eased, no overshoot) and physically sensible.
      for (const a of angles) {
        expect(a).toBeGreaterThanOrEqual(Math.max(0, lo - 2));
        expect(a).toBeLessThanOrEqual(Math.min(180.0001, hi + 2));
      }
      // Every rep crosses the whole range: both ends within 3 deg.
      expect(Math.min(...angles)).toBeLessThan(lo + 3);
      expect(Math.max(...angles)).toBeGreaterThan(hi - 3);
    });

    it(`${m.exerciseId}: helper muscles are real M2 muscles not already in the data`, () => {
      const ex = exercises.find((e) => e.id === m.exerciseId);
      for (const h of m.helpers ?? []) {
        expect(MUSCLES as readonly string[]).toContain(h);
        expect([...(ex?.primaryMuscles ?? []), ...(ex?.secondaryMuscles ?? [])]).not.toContain(h);
      }
    });
  }
});

describe('M4d Pull A demos (hammer curl, reverse fly, lat pulldown)', () => {
  const close = (a: readonly number[], b: readonly number[], what: string, digits = 9) =>
    a.forEach((x, i) => expect(x, what).toBeCloseTo(b[i] ?? NaN, digits));
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = (a: V3): V3 => {
    const l = Math.hypot(...a);
    return [a[0] / l, a[1] / l, a[2] / l];
  };

  it('Hammer_Curls: the curl path with a neutral grip, up to shoulder height', () => {
    const m = must(demoFor('Hammer_Curls'));
    const curl = must(demoFor('Dumbbell_Bicep_Curl'));
    expect(m.helpers).toEqual(['forearms']);
    expect(HOWTO.Hammer_Curls?.focus).toMatch(/forearm/);
    const ref = m.pose(m.start);
    for (const { pose, t } of sampleLoop(m)) {
      // Elbows fixed at the sides.
      for (const k of ['r', 'l'] as const) {
        close(pose[k].s, ref[k].s, `${k}.s`);
        close(pose[k].e, ref[k].e, `${k}.e`);
      }
      expect(pose.bells).toHaveLength(2);
      for (const [i, k] of (['r', 'l'] as const).entries()) {
        const b = must(pose.bells[i]);
        const fore = unit(sub(pose[k].h, pose[k].e));
        // Handle across the forearm, inside the arm's (sagittal) plane: thumbs up, palms in.
        expect(Math.abs(dot(b.axis, fore)), `t=${t}`).toBeLessThan(1e-9);
        expect(Math.abs(b.axis[2]), `t=${t}`).toBeLessThan(1e-9);
      }
    }
    // The supinated curl holds its handles across the body instead.
    expect(Math.abs(must(curl.pose(90).bells[0]).axis[2])).toBeCloseTo(1, 9);
    // Bottom: handle points forward. Top: dumbbell at shoulder height (within 10 cm).
    expect(Math.abs(must(ref.bells[0]).axis[0])).toBeGreaterThan(0.99);
    const top = m.pose(m.far);
    expect(Math.abs(must(top.bells[0]).pos[1] - top.r.s[1])).toBeLessThan(0.1);
  });

  it('Reverse_Flyes: chest stays on the incline pad, soft elbows, arms end level with the back', () => {
    const m = must(demoFor('Reverse_Flyes'));
    const ref = m.pose(m.start);
    const [pad] = m.props;
    const padTilt = must(pad, 'pad').rotZ ?? 0;
    // Torso along the pad, head higher than the hips (howto: "Chest on an incline bench").
    const spine = unit(sub(ref.neck, ref.hip));
    expect(Math.atan2(spine[1], spine[0])).toBeCloseTo(padTilt, 9);
    expect(ref.neck[1]).toBeGreaterThan(ref.hip[1] + 0.2);
    for (const { pose } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      for (const k of ['r', 'l'] as const) {
        // Feet stay planted.
        close(pose[k].a, ref[k].a, `${k}.a`);
        expect(pose[k].toe[1]).toBeLessThan(0.05);
        // Soft elbows: 160 deg the whole rep, never locked, never a row.
        expect(measuredAngle(pose, 'elbow', k)).toBeCloseTo(160, 6);
      }
      // Both arms move together (mirror image).
      expect(measuredAngle(pose, 'shoulder', 'l')).toBeCloseTo(
        measuredAngle(pose, 'shoulder', 'r'),
        6,
      );
      expect(pose.bells).toHaveLength(2);
      for (const b of pose.bells) expect(b.pos[1]).toBeGreaterThan(0.2);
    }
    // Start: arms hang under the shoulders. Far: elbows out to the side at shoulder height.
    expect(ref.r.e[1]).toBeLessThan(ref.r.s[1] - 0.25);
    const top = m.pose(m.far);
    for (const k of ['r', 'l'] as const) {
      expect(Math.abs(top[k].e[1] - top[k].s[1])).toBeLessThan(0.03);
      expect(Math.abs(top[k].e[2])).toBeGreaterThan(Math.abs(top[k].s[2]) + 0.25);
      // Arms move sideways, not forward or back.
      expect(top[k].e[0]).toBeCloseTo(top[k].s[0], 9);
    }
    // Rear shoulders (primary) and the upper back (helper, from the focus line) light up.
    expect(m.helpers).toEqual(['middle back']);
    expect(HOWTO.Reverse_Flyes?.focus).toMatch(/[Uu]pper back/);
  });

  it('Wide-Grip_Lat_Pulldown: seated under the pad, bar from overhead to the upper chest', () => {
    const m = must(demoFor('Wide-Grip_Lat_Pulldown'));
    const [seat, thighPad] = m.props;
    const seatTop = must(seat).at[1] + must(seat).size[1] / 2;
    const padBottom = must(thighPad).at[1] - must(thighPad).size[1] / 2;
    const ref = m.pose(m.start);
    let lowestBar = Infinity;
    for (const { pose, t } of sampleLoop(m)) {
      // Hips stay on the seat, torso still, thighs under the pad.
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      expect(pose.hip[1]).toBeGreaterThan(seatTop);
      expect(pose.hip[1] - seatTop).toBeLessThan(0.12);
      for (const k of ['r', 'l'] as const) {
        expect(pose[k].k[1] + 0.075).toBeLessThanOrEqual(padBottom);
        expect(Math.abs(pose[k].k[0] - must(thighPad).at[0])).toBeLessThan(0.15);
      }
      // The hands hold the bar, wide: about twice the shoulder width.
      const bar = must(pose.rods?.[0], 'bar');
      expect(pose.rods).toHaveLength(3);
      expect(pose.blocks).toHaveLength(1);
      for (const k of ['r', 'l'] as const) {
        expect(Math.abs(pose[k].h[1] - bar.a[1]), `t=${t}`).toBeLessThan(1e-9);
        expect(Math.abs(pose[k].h[0] - bar.a[0])).toBeLessThan(1e-9);
        expect(Math.abs(pose[k].h[2])).toBeCloseTo(PULLDOWN.gripZ, 9);
        expect(Math.abs(pose[k].h[2])).toBeGreaterThan(Math.abs(pose[k].s[2]) * 1.8);
      }
      // The bar never passes through the face: in front of the head whenever it is at head height.
      const headTop = pose.neck[1] + 0.37;
      if (bar.a[1] > pose.neck[1] && bar.a[1] < headTop)
        expect(bar.a[0]).toBeGreaterThan(pose.neck[0] + 0.05);
      // Weight stack rises exactly as far as the bar comes down (1:1 cable).
      expect(must(pose.load)[1] - must(ref.load)[1]).toBeCloseTo(
        must(ref.rods?.[0]).a[1] - bar.a[1],
        9,
      );
      lowestBar = Math.min(lowestBar, bar.a[1]);
    }
    // Top: arms (all but) straight, the bar well above the shoulders' line.
    expect(measuredAngle(ref, 'elbow', 'r')).toBeGreaterThan(160);
    expect(must(ref.rods?.[0]).a[1]).toBeGreaterThan(ref.r.s[1] + 0.45);
    // Bottom: the bar at the upper chest: at or just below the shoulder line, not at the belly.
    const low = m.pose(m.far);
    expect(lowestBar).toBeLessThan(low.r.s[1] + 0.01);
    expect(lowestBar).toBeGreaterThan(low.r.s[1] - 0.1);
    // Elbows end down by the sides, below the shoulders and outside the torso.
    for (const k of ['r', 'l'] as const) {
      expect(low[k].e[1]).toBeLessThan(low[k].s[1] - 0.2);
      expect(Math.abs(low[k].e[2])).toBeGreaterThan(Math.abs(hipJoint(low, k)[2]) + 0.1);
    }
  });
});

describe('M4d Legs A + Push B demos (posture)', () => {
  const close = (a: readonly number[], b: readonly number[], what: string, digits = 9) =>
    a.forEach((x, i) => expect(x, what).toBeCloseTo(b[i] ?? NaN, digits));
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dist = (a: V3, b: V3) => Math.hypot(...sub(a, b));
  const SIDES = ['r', 'l'] as const;
  /** Degrees between the spine and vertical. */
  const tilt = (p: DemoPose) => {
    const d = sub(p.neck, p.hip);
    return (Math.acos(d[1] / Math.hypot(...d)) * 180) / Math.PI;
  };
  const fixedFeet = (pose: DemoPose, ref: DemoPose) => {
    for (const k of SIDES) {
      close(pose[k].a, ref[k].a, `${k}.a`);
      close(pose[k].toe, ref[k].toe, `${k}.toe`);
    }
  };

  it('Stiff-Legged_Dumbbell_Deadlift: soft fixed knees, straight arms, hips back, weights along the legs', () => {
    const m = must(demoFor('Stiff-Legged_Dumbbell_Deadlift'));
    const ref = m.pose(m.start);
    let lowestBell = Infinity;
    for (const { pose, t } of sampleLoop(m)) {
      fixedFeet(pose, ref);
      for (const k of SIDES) {
        close(pose[k].k, ref[k].k, `${k}.k`);
        // Knees slightly bent, never locked, never a squat.
        const knee = measuredAngle(pose, 'knee', k);
        expect(knee, `t=${t}`).toBeGreaterThan(150);
        expect(knee).toBeLessThan(178);
        // Straight arms; the dumbbells travel just in front of the legs.
        expect(measuredAngle(pose, 'elbow', k)).toBeGreaterThan(179);
        expect(pose[k].h[0] - pose[k].k[0]).toBeGreaterThan(0.08);
        expect(pose[k].h[0] - pose[k].k[0]).toBeLessThan(0.2);
        expect(pose[k].toe[1]).toBeLessThan(0.05);
      }
      expect(pose.bells).toHaveLength(2);
      for (const b of pose.bells) lowestBell = Math.min(lowestBell, b.pos[1]);
    }
    const low = m.pose(m.far);
    // Hinged well forward, hips pushed back, dumbbells down to about the knees.
    expect(tilt(ref)).toBeLessThan(15);
    expect(tilt(low)).toBeGreaterThan(60);
    expect(low.hip[0]).toBeLessThan(ref.hip[0] - 0.08);
    expect(must(ref.bells[0]).pos[1] - lowestBell).toBeGreaterThan(0.25);
    expect(lowestBell).toBeLessThan(low.r.k[1] + 0.05);
    expect(lowestBell).toBeGreaterThan(0.2);
  });

  it('Dumbbell_Lunges: split stance, hips straight down, torso upright, back knee to the floor', () => {
    const m = must(demoFor('Dumbbell_Lunges'));
    const ref = m.pose(m.start);
    let lowestHip = Infinity;
    for (const { pose } of sampleLoop(m)) {
      fixedFeet(pose, ref);
      expect(pose.r.a[0] - pose.l.a[0]).toBeGreaterThan(0.6); // a real split stance
      expect(pose.l.a[1]).toBeGreaterThan(pose.l.toe[1]); // back foot on its ball
      expect(pose.hip[0]).toBeCloseTo(ref.hip[0], 9); // straight down
      expect(tilt(pose)).toBeLessThan(10);
      // Front knee over the foot, not past the toes; back knee never through the floor.
      expect(pose.r.k[0]).toBeLessThan(pose.r.toe[0]);
      expect(pose.l.k[1]).toBeGreaterThan(0.06);
      for (const k of SIDES) {
        // Dumbbells hang straight under the shoulders.
        expect(pose[k].h[0]).toBeCloseTo(pose[k].s[0], 9);
        expect(pose[k].h[2]).toBeCloseTo(pose[k].s[2], 9);
      }
      expect(pose.bells).toHaveLength(2);
      for (const b of pose.bells) expect(b.pos[1]).toBeGreaterThan(0.2);
      lowestHip = Math.min(lowestHip, pose.hip[1]);
    }
    const low = m.pose(m.far);
    expect(ref.hip[1] - lowestHip).toBeGreaterThan(0.25);
    expect(measuredAngle(low, 'knee', 'l')).toBeLessThan(110); // both knees bent
    expect(low.l.k[1]).toBeLessThan(0.16);
  });

  it('Lying_Leg_Curls: hips and thighs stay on the pad, the roller stays on the ankles, heels come up', () => {
    const m = must(demoFor('Lying_Leg_Curls'));
    const ref = m.pose(m.start);
    const rollerRef = must(ref.rods?.[0]);
    for (const { pose, t } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      expect(pose.hip[1] - LEG_CURL.padTop).toBeGreaterThan(0.05);
      expect(pose.hip[1] - LEG_CURL.padTop).toBeLessThan(0.15);
      for (const k of SIDES) {
        close(pose[k].k, ref[k].k, `${k}.k`);
        // Knees just past the end of the pad, so they can bend.
        expect(pose[k].k[0]).toBeLessThan(LEG_CURL.padEnd);
        expect(pose[k].k[0]).toBeGreaterThan(LEG_CURL.padEnd - 0.12);
        close(pose[k].h, ref[k].h, `${k}.h`); // hands on the handles
      }
      expect(pose.rods).toHaveLength(3);
      expect(pose.blocks).toHaveLength(1);
      // Roller across both ankles, a fixed distance from them (on the back of the ankle).
      const roller = must(pose.rods?.[0]);
      const mid: V3 = [
        (roller.a[0] + roller.b[0]) / 2,
        (roller.a[1] + roller.b[1]) / 2,
        (roller.a[2] + roller.b[2]) / 2,
      ];
      expect(dist(roller.a, roller.b)).toBeCloseTo(dist(rollerRef.a, rollerRef.b), 9);
      expect(dist([mid[0], mid[1], 0], [pose.r.a[0], pose.r.a[1], 0]), `t=${t}`).toBeCloseTo(
        Math.hypot(LEG_CURL.roller, 0.04),
        9,
      );
      expect(Math.min(roller.a[2], roller.b[2])).toBeLessThan(pose.l.a[2]);
      expect(Math.max(roller.a[2], roller.b[2])).toBeGreaterThan(pose.r.a[2]);
      // The lever turns about the knee axis: rigid arm from a fixed pivot.
      const lever = must(pose.rods?.[1]);
      close(lever.a, must(ref.rods?.[1]).a, 'pivot');
      expect(dist(lever.a, lever.b)).toBeCloseTo(
        dist(must(ref.rods?.[1]).a, must(ref.rods?.[1]).b),
        9,
      );
    }
    // Straight legs at the start, heels well above the knees at the top.
    expect(ref.r.a[1]).toBeCloseTo(ref.r.k[1], 1);
    const top = m.pose(m.far);
    expect(top.r.a[1]).toBeGreaterThan(top.r.k[1] + 0.3);
  });

  it('Standing_Calf_Raises: balls of the feet on the step edge, straight body, heels from below to high', () => {
    const m = must(demoFor('Standing_Calf_Raises'));
    const ref = m.pose(m.start);
    for (const { pose } of sampleLoop(m)) {
      for (const k of SIDES) {
        close(pose[k].toe, ref[k].toe, `${k}.toe`);
        expect(pose[k].toe[0]).toBeGreaterThan(CALF.stepEdge);
        expect(pose[k].toe[1] - CALF.stepTop).toBeGreaterThan(0);
        expect(pose[k].toe[1] - CALF.stepTop).toBeLessThan(0.06);
        expect(measuredAngle(pose, 'knee', k)).toBeGreaterThan(179); // knees straight
        // Heels hang behind the step edge.
        expect(pose[k].a[0]).toBeLessThan(CALF.stepEdge);
      }
      expect(tilt(pose)).toBeLessThan(1);
      // Shoulder pads ride on the shoulders.
      for (const b of (pose.blocks ?? []).slice(0, 2)) {
        expect(b.at[1] - pose.r.s[1]).toBeCloseTo(must(ref.blocks?.[0]).at[1] - ref.r.s[1], 9);
      }
      // Hands stay on the pad handles.
      expect(must(pose.rods?.[2]).b).toEqual(pose.r.h);
      expect(must(pose.rods?.[3]).b).toEqual(pose.l.h);
    }
    // Stretch: heels below the step top. Top: up on the toes, body ~15 cm higher.
    expect(ref.r.a[1]).toBeLessThan(CALF.stepTop);
    const top = m.pose(m.far);
    expect(top.r.a[1]).toBeGreaterThan(CALF.stepTop + 0.1);
    expect(top.neck[1] - ref.neck[1]).toBeGreaterThan(0.12);
  });

  it('Dumbbell_Flyes: lying flat, soft fixed elbows, a wide arc from level with the shoulders to over the chest', () => {
    const m = must(demoFor('Dumbbell_Flyes'));
    const ref = m.pose(m.start);
    const benchTop = Math.max(...m.props.map((p) => p.at[1] + p.size[1] / 2));
    for (const { pose } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      expect(pose.hip[1]).toBeGreaterThan(benchTop);
      expect(Math.abs(pose.neck[1] - pose.hip[1])).toBeLessThan(1e-9); // flat
      for (const k of SIDES) {
        expect(measuredAngle(pose, 'elbow', k)).toBeCloseTo(160, 6);
        expect(pose[k].e[0]).toBeCloseTo(pose[k].s[0], 9); // the arc runs across the chest
      }
      expect(measuredAngle(pose, 'armOpen', 'l')).toBeCloseTo(
        measuredAngle(pose, 'armOpen', 'r'),
        6,
      );
      expect(pose.r.h[2]).toBeGreaterThan(0.05);
      expect(pose.l.h[2]).toBeLessThan(-0.05);
      expect(pose.bells).toHaveLength(2);
      for (const b of pose.bells) expect(b.pos[1]).toBeGreaterThan(benchTop);
    }
    // Open: elbows about level with the shoulders and far out. Top: hands close over the chest.
    for (const k of SIDES) {
      expect(Math.abs(ref[k].e[1] - ref[k].s[1])).toBeLessThan(0.12);
      expect(Math.abs(ref[k].e[2])).toBeGreaterThan(Math.abs(ref[k].s[2]) + 0.25);
    }
    const top = m.pose(m.far);
    expect(Math.abs(top.r.h[2])).toBeLessThan(0.2);
    expect(top.r.h[1]).toBeGreaterThan(top.r.s[1] + 0.45);
  });

  it('Dumbbell_Shoulder_Press: back on the upright pad, forearms vertical, shoulders -> straight overhead', () => {
    const m = must(demoFor('Dumbbell_Shoulder_Press'));
    const ref = m.pose(m.start);
    const [seat, back] = m.props;
    const seatTop = must(seat).at[1] + must(seat).size[1] / 2;
    const padFront = must(back).at[0] + must(back).size[0] / 2;
    for (const { pose } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      expect(pose.hip[1] - seatTop).toBeGreaterThan(0);
      expect(pose.hip[1] - seatTop).toBeLessThan(0.12);
      // The torso's back surface (11 cm behind the spine) rests against the pad.
      expect(pose.neck[0] - 0.11 - padFront).toBeGreaterThan(-0.01);
      expect(pose.neck[0] - 0.11 - padFront).toBeLessThan(0.06);
      expect(tilt(pose)).toBeLessThan(1);
      for (const k of SIDES) {
        expect(pose[k].w[0]).toBeCloseTo(pose[k].e[0], 9);
        expect(pose[k].w[2]).toBeCloseTo(pose[k].e[2], 9);
      }
    }
    // Dumbbells start at about shoulder height and end straight over the shoulders.
    for (const b of ref.bells) expect(Math.abs(b.pos[1] - ref.r.s[1])).toBeLessThan(0.2);
    const top = m.pose(m.far);
    for (const k of SIDES) {
      expect(top[k].h[1]).toBeGreaterThan(top[k].s[1] + 0.5);
      expect(Math.abs(top[k].h[2] - top[k].s[2])).toBeLessThan(0.05);
    }
  });

  it('Cable_Crossover: staggered and still, soft elbows, hands on the cables, meeting in front', () => {
    const m = must(demoFor('Cable_Crossover'));
    const ref = m.pose(m.start);
    for (const { pose } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      fixedFeet(pose, ref);
      expect(pose.r.a[0] - pose.l.a[0]).toBeGreaterThan(0.2); // one foot forward
      const lean = tilt(pose);
      expect(lean).toBeGreaterThan(5);
      expect(lean).toBeLessThan(25);
      for (const k of SIDES) expect(measuredAngle(pose, 'elbow', k)).toBeCloseTo(160, 6);
      expect(measuredAngle(pose, 'armOpen', 'l')).toBeCloseTo(
        measuredAngle(pose, 'armOpen', 'r'),
        6,
      );
      // Each hand holds a cable from its own high pulley; both stacks at the same height.
      expect(pose.rods).toHaveLength(6);
      expect(pose.blocks).toHaveLength(2);
      const [rc, , , lc] = pose.rods ?? [];
      expect(must(rc).a).toEqual(pose.r.h);
      expect(must(lc).a).toEqual(pose.l.h);
      expect(must(rc).b[1]).toBeGreaterThan(pose.neck[1] + 0.4);
      expect(must(rc).b[2]).toBeGreaterThan(0.6);
      expect(must(lc).b[2]).toBeLessThan(-0.6);
      expect(must(pose.blocks?.[0]).at[1]).toBeCloseTo(must(pose.blocks?.[1]).at[1], 9);
    }
    // Open: hands out wide at about shoulder height. Closed: hands meet in front, lower chest.
    for (const k of SIDES) {
      expect(Math.abs(ref[k].h[2])).toBeGreaterThan(0.6);
      expect(Math.abs(ref[k].h[1] - ref[k].s[1])).toBeLessThan(0.15);
    }
    const shut = m.pose(m.far);
    expect(Math.abs(shut.r.h[2] - shut.l.h[2])).toBeLessThan(0.06);
    expect(shut.r.h[0]).toBeGreaterThan(shut.neck[0] + 0.3);
    expect(shut.r.h[1]).toBeLessThan(shut.neck[1] - 0.15);
    expect(shut.r.h[1]).toBeGreaterThan(shut.hip[1]);
  });

  it('Triceps_Pushdown: elbows pinned, hands on the bar, chest height -> arms straight, cable clear of the face', () => {
    const m = must(demoFor('Triceps_Pushdown'));
    const ref = m.pose(m.start);
    for (const { pose, t } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      fixedFeet(pose, ref);
      for (const k of SIDES) {
        close(pose[k].s, ref[k].s, `${k}.s`);
        close(pose[k].e, ref[k].e, `${k}.e`);
        // Elbows at the sides, a little in front of the shoulders, below them.
        expect(pose[k].e[1]).toBeLessThan(pose[k].s[1] - 0.25);
      }
      const [bar, cable] = pose.rods ?? [];
      expect(pose.rods).toHaveLength(3);
      expect(must(bar).a[1]).toBeCloseTo(pose.r.h[1], 9);
      expect(must(bar).a[0]).toBeCloseTo(pose.r.h[0], 9);
      expect(Math.abs(must(bar).a[2])).toBeGreaterThan(Math.abs(pose.r.h[2]));
      // At the height of the face the cable is in front of it (head front ~ neck + 0.13).
      const c = must(cable);
      const faceY = pose.neck[1] + 0.25;
      const u = (faceY - c.a[1]) / (c.b[1] - c.a[1]);
      if (u > 0 && u < 1)
        expect(c.a[0] + u * (c.b[0] - c.a[0]), `t=${t}`).toBeGreaterThan(pose.neck[0] + 0.17);
    }
    // Start: bar at chest height (between elbows and shoulders). End: arms straight down.
    expect(ref.r.h[1]).toBeGreaterThan(ref.r.e[1]);
    expect(ref.r.h[1]).toBeLessThan(ref.r.s[1]);
    const low = m.pose(m.far);
    expect(low.r.h[1]).toBeLessThan(low.r.e[1] - 0.25);
  });

  it('Bench_Dips: hands on the bench edge, heels down in front, hips drop in front of the bench, elbows back', () => {
    const m = must(demoFor('Bench_Dips'));
    const ref = m.pose(m.start);
    const bench = must(m.props[0]);
    const edge = bench.at[0] + bench.size[0] / 2;
    const top = bench.at[1] + bench.size[1] / 2;
    expect(edge).toBeCloseTo(DIPS.edge, 9);
    for (const { pose, t } of sampleLoop(m)) {
      fixedFeet(pose, ref);
      for (const k of SIDES) {
        close(pose[k].w, ref[k].w, `${k}.w`);
        // Heel of the hand on the bench top, fingers over the edge.
        expect(pose[k].w[0]).toBeLessThan(edge);
        expect(pose[k].h[0]).toBeGreaterThan(edge);
        expect(pose[k].w[1] - top).toBeGreaterThan(0);
        expect(pose[k].w[1] - top).toBeLessThan(0.05);
        // Elbows point back, over the bench.
        expect(pose[k].e[0]).toBeLessThan(pose[k].s[0]);
        expect(pose[k].e[1]).toBeGreaterThan(top);
        expect(pose[k].toe[1]).toBeGreaterThan(pose[k].a[1]); // heels down, toes up
      }
      // The pelvis (10.5 cm deep) stays in front of the bench edge, above the floor.
      expect(pose.hip[0] - 0.105, `t=${t}`).toBeGreaterThan(edge - 0.005);
      expect(pose.hip[1]).toBeGreaterThan(0.25);
      expect(tilt(pose)).toBeLessThan(20);
      expect(pose.bells).toHaveLength(0);
    }
    const low = m.pose(m.far);
    expect(ref.neck[1] - low.neck[1]).toBeGreaterThan(0.15);
    expect(low.hip[1]).toBeLessThan(top);
    expect(angleAtJoint(low.r.s, low.r.e, low.r.w)).toBeCloseTo(m.far, 6);
  });
});

describe('M4d Pull B + Legs B demos (posture)', () => {
  const close = (a: readonly number[], b: readonly number[], what: string, digits = 9) =>
    a.forEach((x, i) => expect(x, what).toBeCloseTo(b[i] ?? NaN, digits));
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const dist = (a: V3, b: V3) => Math.hypot(...sub(a, b));
  const SIDES = ['r', 'l'] as const;
  /** Degrees between the spine and vertical. */
  const tilt = (p: DemoPose) => {
    const d = sub(p.neck, p.hip);
    return (Math.acos(d[1] / Math.hypot(...d)) * 180) / Math.PI;
  };
  /** Distance from p to the segment a-b. */
  const toSegment = (p: V3, a: V3, b: V3) => {
    const d = sub(b, a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), d) / dot(d, d)));
    return dist(p, [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]);
  };
  const still = (
    pose: DemoPose,
    ref: DemoPose,
    joints: readonly ('s' | 'e' | 'w' | 'h' | 'k' | 'a' | 'toe')[],
  ) => {
    for (const k of SIDES) for (const j of joints) close(pose[k][j], ref[k][j], `${k}.${j}`);
  };
  /** Inside an unrotated prop box (with a margin)? */
  const inBox = (q: V3, b: DemoProp, m = 0) =>
    [0, 1, 2].every((i) => Math.abs((q[i] ?? 0) - (b.at[i] ?? 0)) < (b.size[i] ?? 0) / 2 + m);
  const top = (b: DemoProp) => b.at[1] + b.size[1] / 2;

  it('Bent_Over_Two-Dumbbell_Row: flat back hinged forward, soft fixed knees, both elbows row back along the sides', () => {
    const m = must(demoFor('Bent_Over_Two-Dumbbell_Row'));
    const ref = m.pose(m.start);
    for (const { pose, t } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      still(pose, ref, ['s', 'k', 'a', 'toe']);
      expect(Math.abs(tilt(pose) - BENT_ROW.hinge)).toBeLessThan(1e-6);
      for (const k of SIDES) {
        const knee = measuredAngle(pose, 'knee', k);
        expect(knee).toBeGreaterThan(140); // soft, never a squat
        expect(knee).toBeLessThan(165); // never locked
        // The dumbbells hang: forearms vertical, under the elbows.
        expect(pose[k].w[0]).toBeCloseTo(pose[k].e[0], 9);
        expect(pose[k].w[1]).toBeLessThan(pose[k].e[1]);
        // Elbows close to the body: in the shoulder's plane, never flared out.
        expect(Math.abs(pose[k].e[2])).toBeCloseTo(Math.abs(pose[k].s[2]), 9);
        expect(pose[k].toe[1]).toBeLessThan(0.05);
      }
      // Both arms row together.
      expect(measuredAngle(pose, 'elbow', 'l')).toBeCloseTo(measuredAngle(pose, 'elbow', 'r'), 9);
      expect(pose.bells).toHaveLength(2);
      for (const b of pose.bells) expect(b.pos[1], `t=${t}`).toBeGreaterThan(0.3);
    }
    // Start: arms hang straight under the shoulders, dumbbells about knee height in front of them.
    for (const k of SIDES) {
      expect(ref[k].h[0]).toBeCloseTo(ref[k].s[0], 9);
      expect(ref[k].h[0]).toBeGreaterThan(ref[k].k[0] + 0.15);
    }
    // Top: elbows up past the back line and well behind the shoulders.
    const topPose = m.pose(m.far);
    for (const k of SIDES) {
      expect(topPose[k].e[1]).toBeGreaterThan(topPose[k].s[1]);
      expect(topPose[k].e[0]).toBeLessThan(topPose[k].s[0] - 0.25);
    }
  });

  it("Seated_Cable_Rows: sitting tall, feet on the plates, handle level from arms' length to the stomach", () => {
    const m = must(demoFor('Seated_Cable_Rows'));
    const ref = m.pose(m.start);
    const plates = m.props.filter((p) => p.at[0] === CABLE_ROW.plateX);
    expect(plates).toHaveLength(2);
    for (const { pose, t } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      still(pose, ref, ['s', 'k', 'a', 'toe']);
      expect(tilt(pose)).toBeLessThan(1e-9); // sit tall
      expect(pose.hip[1] - CABLE_ROW.seatTop).toBeGreaterThan(0.05);
      expect(pose.hip[1] - CABLE_ROW.seatTop).toBeLessThan(0.15);
      for (const k of SIDES) {
        // Knees soft.
        const knee = measuredAngle(pose, 'knee', k);
        expect(knee).toBeGreaterThan(120);
        expect(knee).toBeLessThan(160);
        // Soles against a plate: the foot's front surface within 3 cm of the plate face.
        const plateFace = Math.min(...plates.map((p) => p.at[0] - p.size[0] / 2));
        expect(plateFace - (pose[k].a[0] + 0.042)).toBeGreaterThan(-0.005);
        expect(plateFace - (pose[k].a[0] + 0.042)).toBeLessThan(0.03);
        // Hands on the handle, level at stomach height.
        expect(pose[k].h[1], `t=${t}`).toBeCloseTo(CABLE_ROW.handY, 9);
        expect(Math.abs(pose[k].h[2])).toBeCloseTo(CABLE_ROW.gripZ, 9);
      }
      const [handle, cable] = pose.rods ?? [];
      expect(pose.rods).toHaveLength(4);
      expect(must(handle).a[1]).toBeCloseTo(CABLE_ROW.handY, 9);
      expect(must(cable).a[1]).toBeCloseTo(must(cable).b[1], 9); // the cable runs level
      // The stack rises exactly as far as the handle comes in (1:1 cable).
      expect(must(pose.load)[1] - must(ref.load)[1]).toBeCloseTo(ref.r.h[0] - pose.r.h[0], 9);
    }
    // Start: arms reaching forward (all but straight). End: handle at the stomach, elbows back
    // past the torso, close to the sides.
    expect(ref.r.h[0] - ref.hip[0]).toBeGreaterThan(0.45);
    const end = m.pose(m.far);
    expect(end.r.h[0] - end.hip[0]).toBeGreaterThan(0.12);
    expect(end.r.h[0] - end.hip[0]).toBeLessThan(0.3);
    expect(end.r.h[1]).toBeGreaterThan(end.hip[1] + 0.1);
    expect(end.r.h[1]).toBeLessThan(end.neck[1] - 0.15);
    for (const k of SIDES) {
      expect(end[k].e[0]).toBeLessThan(end[k].s[0]);
      expect(Math.abs(end[k].e[2])).toBeLessThan(0.25);
    }
  });

  it('Face_Pull: standing still, rope to the face, hands apart, elbows high and wide, rope clear of the face', () => {
    const m = must(demoFor('Face_Pull'));
    const ref = m.pose(m.start);
    for (const { pose, t } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      still(pose, ref, ['s', 'k', 'a', 'toe']);
      expect(tilt(pose)).toBeLessThan(10);
      expect(measuredAngle(pose, 'elbow', 'l')).toBeCloseTo(measuredAngle(pose, 'elbow', 'r'), 9);
      const [ropeR, ropeL, cable] = pose.rods ?? [];
      expect(pose.rods).toHaveLength(4);
      expect(must(ropeR).a).toEqual(pose.r.h);
      expect(must(ropeL).a).toEqual(pose.l.h);
      // The knot (cable end) stays in front of the face; the pulley is above head height.
      expect(must(cable).a[0], `t=${t}`).toBeGreaterThan(pose.neck[0] + 0.15);
      expect(must(cable).b).toEqual(FACE_PULL.pulley);
      expect(FACE_PULL.pulley[1]).toBeGreaterThan(pose.neck[1] + 0.3);
      expect(pose.bells).toHaveLength(0);
    }
    // Start: arms (all but) straight toward the pulley, hands close together.
    expect(measuredAngle(ref, 'elbow', 'r')).toBeGreaterThan(160);
    expect(ref.r.h[2] - ref.l.h[2]).toBeLessThan(0.15);
    // End: hands beside the face, apart; elbows above the shoulders and out wide.
    const end = m.pose(m.far);
    expect(Math.abs(end.r.h[1] - (end.neck[1] + 0.22))).toBeLessThan(0.05);
    expect(end.r.h[0]).toBeGreaterThan(end.neck[0] + 0.13);
    expect(end.r.h[2] - end.l.h[2]).toBeGreaterThan(0.25);
    for (const k of SIDES) {
      expect(end[k].e[1]).toBeGreaterThan(end[k].s[1] + 0.1);
      expect(Math.abs(end[k].e[2])).toBeGreaterThan(Math.abs(end[k].s[2]) + 0.15);
    }
  });

  it('Incline_Dumbbell_Curl: back on the incline pad, upper arms hang still behind the torso, full stretch to the shoulders', () => {
    const m = must(demoFor('Incline_Dumbbell_Curl'));
    const ref = m.pose(m.start);
    const [seat, pad] = m.props;
    const spine = sub(ref.neck, ref.hip);
    expect(Math.atan2(spine[1], spine[0])).toBeCloseTo(must(pad).rotZ ?? NaN, 9);
    expect(ref.neck[0]).toBeLessThan(ref.hip[0] - 0.2); // leaning back
    for (const { pose, t } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      still(pose, ref, ['s', 'e', 'k', 'a', 'toe']);
      for (const k of SIDES) {
        // Upper arm straight down from the shoulder, outside the pad's width.
        expect(pose[k].e[0]).toBeCloseTo(pose[k].s[0], 9);
        expect(Math.abs(pose[k].e[2]) - 0.046).toBeGreaterThan(must(pad).size[2] / 2);
      }
      expect(pose.bells).toHaveLength(2);
      for (const b of pose.bells) {
        expect(b.pos[1], `t=${t}`).toBeGreaterThan(0.12);
        expect(inBox(b.pos, must(seat), 0.045)).toBe(false);
      }
    }
    // Bottom: arms straight down, dumbbells behind the hips. Top: up near the shoulders.
    for (const k of SIDES) {
      expect(Math.abs(ref[k].h[0] - ref[k].e[0])).toBeLessThan(0.03);
      expect(ref[k].h[0]).toBeLessThan(ref.hip[0] - 0.2);
    }
    const topPose = m.pose(m.far);
    expect(topPose.r.h[1]).toBeGreaterThan(topPose.r.s[1] - 0.12);
  });

  it('Concentration_Curls: elbow resting on the inner thigh, only the forearm moves, dumbbell ends in front of the chest', () => {
    const m = must(demoFor('Concentration_Curls'));
    const ref = m.pose(m.start);
    for (const { pose, t } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      still(pose, ref, ['k', 'a', 'toe']);
      close(pose.r.s, ref.r.s, 'r.s');
      close(pose.r.e, ref.r.e, 'r.e');
      for (const j of ['s', 'e', 'w', 'h'] as const) close(pose.l[j], ref.l[j], `l.${j}`);
      for (const k of SIDES) expect(pose[k].toe[1]).toBeLessThan(0.05);
      expect(pose.bells).toHaveLength(1);
      expect(must(pose.bells[0]).pos[1], `t=${t}`).toBeGreaterThan(0.15);
    }
    const lean = tilt(ref);
    expect(lean).toBeCloseTo(CONC_CURL.lean, 6);
    // Elbow touching the right thigh (thigh 7.5 cm + arm 4.6 cm round), on its inner side.
    const hj = hipJoint(ref, 'r');
    const gap = toSegment(ref.r.e, hj, ref.r.k);
    expect(gap).toBeGreaterThan(0.1);
    expect(gap).toBeLessThan(0.14);
    expect(ref.r.e[2]).toBeLessThan(ref.r.k[2]);
    // Left hand braced on the left knee.
    expect(dist(ref.l.h, ref.l.k)).toBeLessThan(0.1);
    // Top: the dumbbell is up in front of the chest, clear of the torso (along the face direction).
    const topPose = m.pose(m.far);
    const bell = must(topPose.bells[0]).pos;
    expect(bell[1]).toBeGreaterThan(topPose.r.e[1] + 0.12);
    expect(dot(sub(bell, topPose.hip), topPose.face)).toBeGreaterThan(0.15);
    expect(Math.abs(bell[2])).toBeLessThan(0.1); // curled in toward the middle
  });

  it('Leg_Press: back on the pad, the platform slides on its rail, knees come toward the chest but not into it', () => {
    const m = must(demoFor('Leg_Press'));
    const ref = m.pose(m.start);
    const R: V3 = [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4), 0];
    for (const { pose, t } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      still(pose, ref, ['s', 'e', 'w', 'h']);
      expect(tilt(pose)).toBeCloseTo(LEG_PRESS.back, 6);
      for (const k of SIDES) {
        // The feet move only along the rail, flat on the platform (same foot vector).
        const d = sub(pose[k].a, ref[k].a);
        const along = dot(d, R);
        close(d, [R[0] * along, R[1] * along, 0], `${k}.a on the rail`);
        close(sub(pose[k].toe, pose[k].a), sub(ref[k].toe, ref[k].a), `${k}.foot`);
        // Knees bend up (above the hip-ankle line) and stay clear of the chest.
        const hj = hipJoint(pose, k);
        const n: V3 = [-R[1], R[0], 0];
        expect(dot(sub(pose[k].k, hj), n), `t=${t}`).toBeGreaterThan(0);
        expect(toSegment(pose[k].k, pose.hip, pose.neck)).toBeGreaterThan(0.25);
      }
      // The platform rides on the feet.
      const plate = must(pose.blocks?.[0]);
      expect(dist(plate.at, must(pose.load))).toBe(0);
      expect(pose.blocks).toHaveLength(2);
    }
    // Start: knees just short of locked. Far: about 90 deg, platform ~25 cm lower.
    expect(measuredAngle(ref, 'knee', 'r')).toBeLessThan(170);
    const low = m.pose(m.far);
    expect(must(ref.load)[1] - must(low.load)[1]).toBeGreaterThan(0.15);
  });

  it('Dumbbell_Step_Ups: right foot planted on the box, the trailing foot never in it, up to a straight standing leg', () => {
    const m = must(demoFor('Dumbbell_Step_Ups'));
    const ref = m.pose(m.start);
    const box = must(m.props[0]);
    let lowestHip = Infinity;
    let highestHip = -Infinity;
    for (const { pose, t } of sampleLoop(m)) {
      close(pose.r.a, ref.r.a, 'r.a');
      close(pose.r.toe, ref.r.toe, 'r.toe');
      expect(pose.r.toe[1] - top(box)).toBeGreaterThan(0);
      expect(pose.r.toe[1] - top(box)).toBeLessThan(0.05);
      expect(inBox(pose.r.toe, box)).toBe(false);
      expect(pose.r.toe[0]).toBeGreaterThan(box.at[0] - box.size[0] / 2); // foot fully on the box
      // The trailing (left) foot never goes into the box.
      for (const q of [pose.l.a, pose.l.toe]) expect(inBox(q, box, 0.04), `t=${t}`).toBe(false);
      expect(tilt(pose)).toBeLessThan(STEP_UP.lean + 1e-9);
      for (const k of SIDES) {
        // Dumbbells hang straight under the shoulders, above the box.
        expect(pose[k].h[0]).toBeCloseTo(pose[k].s[0], 9);
        expect(pose[k].h[2]).toBeCloseTo(pose[k].s[2], 9);
      }
      for (const b of pose.bells) expect(b.pos[1] - 0.045).toBeGreaterThan(top(box));
      lowestHip = Math.min(lowestHip, pose.hip[1]);
      highestHip = Math.max(highestHip, pose.hip[1]);
    }
    // Start: the left foot on the floor behind the box. Top: standing straight over the right foot.
    expect(ref.l.toe[1]).toBeLessThan(0.05);
    expect(ref.l.a[0]).toBeLessThan(box.at[0] - box.size[0] / 2);
    const topPose = m.pose(m.far);
    expect(measuredAngle(topPose, 'knee', 'r')).toBeGreaterThan(170);
    expect(Math.abs(topPose.hip[0] - topPose.r.a[0])).toBeLessThan(0.08);
    expect(tilt(topPose)).toBeLessThan(2);
    expect(highestHip - lowestHip).toBeGreaterThan(0.35);
  });

  it('Leg_Extensions: thighs on the seat, the roller on the front of the shins, shins from hanging to straight', () => {
    const m = must(demoFor('Leg_Extensions'));
    const ref = m.pose(m.start);
    const seat = must(m.props[0]);
    const seatFront = seat.at[0] + seat.size[0] / 2;
    const rollerRef = must(ref.rods?.[0]);
    const mid = (r: { a: V3; b: V3 }): V3 => [
      (r.a[0] + r.b[0]) / 2,
      (r.a[1] + r.b[1]) / 2,
      (r.a[2] + r.b[2]) / 2,
    ];
    for (const { pose, t } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      still(pose, ref, ['s', 'e', 'w', 'h', 'k']);
      expect(pose.hip[1] - LEG_EXT.seatTop).toBeGreaterThan(0.05);
      expect(pose.hip[1] - LEG_EXT.seatTop).toBeLessThan(0.15);
      for (const k of SIDES) {
        // Knees just past the seat edge, on the lever axis; feet off the floor.
        expect(pose[k].k[0]).toBeGreaterThan(seatFront);
        expect(pose[k].k[0]).toBeLessThan(seatFront + 0.12);
        expect(pose[k].toe[1]).toBeGreaterThan(0.1);
      }
      // Roller across both shins, a fixed distance from the ankles, in front of the shins.
      const roller = must(pose.rods?.[0]);
      const c = mid(roller);
      expect(dist([c[0], c[1], 0], [pose.r.a[0], pose.r.a[1], 0]), `t=${t}`).toBeCloseTo(
        dist([mid(rollerRef)[0], mid(rollerRef)[1], 0], [ref.r.a[0], ref.r.a[1], 0]),
        9,
      );
      const shinFront: V3 = sub(pose.r.toe, pose.r.a);
      const fromAnkle: V3 = sub([c[0], c[1], 0], [pose.r.a[0], pose.r.a[1], 0]);
      expect(dot(fromAnkle, shinFront)).toBeGreaterThan(0);
      // Low on the shin, just above the ankle: the pad's centre sits in the lower quarter of the
      // shin (measured up the shin from the ankle), with its lower edge clear of the ankle joint.
      const shinLen = dist(pose.r.k, pose.r.a);
      const up = dot(fromAnkle, sub(pose.r.k, pose.r.a)) / shinLen;
      expect(up, `t=${t}`).toBeGreaterThan(roller.r);
      expect(up, `t=${t}`).toBeLessThan(shinLen / 4);
      // The lever turns about the knee axis.
      close(must(pose.rods?.[1]).a, must(ref.rods?.[1]).a, 'pivot');
    }
    // Start: shins hang under the knees. Top: legs straight out in front.
    expect(Math.abs(ref.r.a[0] - ref.r.k[0])).toBeLessThan(0.03);
    expect(ref.r.a[1]).toBeLessThan(ref.r.k[1] - 0.35);
    const topPose = m.pose(m.far);
    expect(topPose.r.a[1]).toBeGreaterThan(topPose.r.k[1] - 0.08);
    expect(topPose.r.a[0]).toBeGreaterThan(topPose.r.k[0] + 0.35);
  });

  it('Dumbbell_Seated_One-Leg_Calf_Raise: ball of the foot on the block edge, dumbbell on that knee, heel from below to high', () => {
    const m = must(demoFor('Dumbbell_Seated_One-Leg_Calf_Raise'));
    const ref = m.pose(m.start);
    const block = must(m.props[1]);
    const edge = block.at[0] - block.size[0] / 2;
    const bellOnKnee = sub(must(ref.bells[0]).pos, ref.r.k);
    for (const { pose, t } of sampleLoop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      close(pose.r.toe, ref.r.toe, 'r.toe');
      for (const j of ['k', 'a', 'toe'] as const) close(pose.l[j], ref.l[j], `l.${j}`);
      // Ball of the foot on the block's back edge, heel hanging off it.
      expect(pose.r.toe[0]).toBeGreaterThan(edge);
      expect(pose.r.toe[1] - top(block)).toBeGreaterThan(0);
      expect(pose.r.toe[1] - top(block)).toBeLessThan(0.06);
      expect(pose.r.a[0], `t=${t}`).toBeLessThan(edge);
      expect(pose.l.toe[1]).toBeLessThan(0.05);
      // The dumbbell rides on the right knee, both hands on it.
      expect(pose.bells).toHaveLength(1);
      close(sub(must(pose.bells[0]).pos, pose.r.k), bellOnKnee, 'bell on knee');
      for (const k of SIDES) expect(dist(pose[k].h, must(pose.bells[0]).pos)).toBeLessThan(0.1);
      expect(must(pose.load)).toEqual(must(pose.bells[0]).pos);
    }
    // Stretch: heel below the block top. Top: high on the toes, knee ~10 cm higher.
    expect(ref.r.a[1]).toBeLessThan(SEATED_CALF.blockTop);
    const topPose = m.pose(m.far);
    expect(topPose.r.a[1]).toBeGreaterThan(SEATED_CALF.blockTop + 0.1);
    expect(topPose.r.k[1] - ref.r.k[1]).toBeGreaterThan(0.1);
  });
});
