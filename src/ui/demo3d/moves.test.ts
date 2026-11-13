import { describe, expect, it } from 'vitest';
import { ruleFor } from '../../core/exercises';
import exercises from '../../data/exercises.json';
import {
  DEMO_IDS,
  DEMOS,
  TEMPO,
  angleAt,
  cycleSeconds,
  demoFor,
  hasDemo,
  phaseAt,
  poseAt,
  tempoLabel,
  trackFor,
  type DemoMove,
  type Phase,
} from './moves';
import { boneLengths, measuredAngle, type DemoPose } from './poses';

const PUSH_A_TRACKED = ['Pushups', 'Seated_Dumbbell_Press', 'Side_Lateral_Raise'];
const M4D_TRACKED = ['Dumbbell_Bicep_Curl', 'One-Arm_Dumbbell_Row', 'Goblet_Squat'];
const POSE_TRACKED = [...PUSH_A_TRACKED, ...M4D_TRACKED];
const MANUAL = [
  'Dumbbell_Bench_Press',
  'Incline_Dumbbell_Press',
  'Standing_Dumbbell_Triceps_Extension',
];
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
  it('has demos for all six pose-tracked exercises (Push A + curl, row, goblet squat)', () => {
    for (const id of POSE_TRACKED) {
      expect(hasDemo(id), id).toBe(true);
      expect(DEMO_IDS).toContain(id);
      expect(demoFor(id)?.exerciseId).toBe(id);
    }
  });

  it('has demos for all six Push A exercises, and none of the manual ones has a counter rule', () => {
    for (const id of [...PUSH_A_TRACKED, ...MANUAL]) expect(hasDemo(id), id).toBe(true);
    for (const id of MANUAL) expect(ruleFor(id), id).toBeUndefined();
  });

  it('has no demo for a manual Pull exercise or an unknown id', () => {
    expect(hasDemo('Hammer_Curls')).toBe(false);
    expect(hasDemo('nope')).toBe(false);
    expect(demoFor('Hammer_Curls')).toBeUndefined();
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
  });

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
      expect(total).toBeCloseTo(TEMPO.lift + TEMPO.hold + TEMPO.lower + TEMPO.pause, 9);
      const time: Record<Phase, number> = { lift: 0, hold: 0, lower: 0, pause: 0 };
      for (let t = STEP / 2; t < total; t += STEP) time[phaseAt(m, t)] += STEP;
      expect(time.lift).toBeCloseTo(TEMPO.lift, 1);
      expect(time.lower).toBeCloseTo(TEMPO.lower, 1);
      expect(time.hold).toBeCloseTo(TEMPO.hold, 1);
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
      // Push-up: the "weight" is the body, so track the shoulder; otherwise the hand.
      const y = (t: number) => {
        const p = poseAt(m, t);
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
      const rule = ruleFor(id);
      expect(rule, id).toBeDefined();
      if (!rule) return;
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
      expect(m.view).toBe(rule.view);
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
