// M13c tasks 7 + 8: 3D demos for the ten vendored abs exercises, the pelvis frame that keeps the
// hips still while the chest turns or leans, the two new measured joints (twist, waist) and the
// waist-side highlight. The generic checks every demo gets (tempo text = how-to line, bone lengths,
// continuous loop, range, frames) live in moves.test.ts and rig.test.ts.
import { describe, expect, it } from 'vitest';
import { ruleFor } from '../../core/exercises';
import exercises from '../../data/exercises.json';
import howto from '../../data/howto.json';
import { pickView } from '../bodyMap';
import { WAIST_SIDES, highlightFor } from './highlight';
import { DEMO_IDS } from './ids';
import { cycleSeconds, demoFor, phaseAt, poseAt, tempoLabel, type DemoMove } from './moves';
import {
  CABLE_CRUNCH,
  HANGING,
  LEG_RAISE,
  LIE_Y,
  PALLOF,
  angleAtJoint,
  hipJoint,
  measuredAngle,
  type DemoPose,
  type DemoProp,
  type V3,
} from './poses';
import { bodyAxes, patchesFor, pelvisAxes, phaseLabel, segmentFrames } from './rig';

/** Task 7: floor and bench. */
const FLOOR = [
  'Crunches',
  'Reverse_Crunch',
  'Flat_Bench_Lying_Leg_Raise',
  'Dead_Bug',
  'Air_Bike',
  'Russian_Twist',
];
/** Task 8: standing, cable and hanging. */
const STANDING = ['Dumbbell_Side_Bend', 'Cable_Crunch', 'Pallof_Press', 'Hanging_Leg_Raise'];
const ABS = [...FLOOR, ...STANDING];

const HOWTO = howto as Record<string, { tempo: string } | undefined>;
const STEP = 1 / 30;
const SIDES = ['r', 'l'] as const;

function must<T>(x: T | undefined, what = 'value'): T {
  if (x === undefined) throw new Error(`missing ${what}`);
  return x;
}
const demo = (id: string): DemoMove => must(demoFor(id), id);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a: V3, b: V3) => Math.hypot(...sub(a, b));
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const close = (a: readonly number[], b: readonly number[], what: string, digits = 9) =>
  a.forEach((x, i) => expect(x, what).toBeCloseTo(b[i] ?? NaN, digits));

function loop(m: DemoMove): { t: number; pose: DemoPose }[] {
  const out = [];
  for (let t = 0; t <= cycleSeconds(m) + 1e-9; t += STEP) out.push({ t, pose: poseAt(m, t) });
  return out;
}
const startPose = (m: DemoMove) => m.pose(m.start);
const farPose = (m: DemoMove) => m.pose(m.far);
/** Every joint of a pose (both sides). */
const joints = (p: DemoPose): V3[] => [
  p.hip,
  p.neck,
  ...SIDES.flatMap((k) => [p[k].s, p[k].e, p[k].w, p[k].h, p[k].k, p[k].a, p[k].toe]),
];
/** These joints of both sides stay where they are in `ref`. */
const still = (
  pose: DemoPose,
  ref: DemoPose,
  keys: readonly ('s' | 'e' | 'w' | 'h' | 'k' | 'a' | 'toe')[],
) => {
  for (const k of SIDES) for (const j of keys) close(pose[k][j], ref[k][j], `${k}.${j}`);
};
/** Distance from p to the segment a-b. */
const toSegment = (p: V3, a: V3, b: V3) => {
  const d = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), d) / dot(d, d)));
  return dist(p, [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]);
};
/** Head centre (as the player draws it: 0.25 m up the spine from the neck). */
const headOf = (p: DemoPose): V3 => {
  const up = bodyAxes(p).up;
  return [p.neck[0] + up[0] * 0.25, p.neck[1] + up[1] * 0.25, p.neck[2] + up[2] * 0.25];
};
const top = (b: DemoProp) => b.at[1] + b.size[1] / 2;

describe('M13c abs: registry', () => {
  it('every vendored abs exercise has a 3D demo (none left "Info")', () => {
    for (const id of ABS) {
      expect(
        exercises.some((e) => e.id === id),
        id,
      ).toBe(true);
      expect(DEMO_IDS, id).toContain(id);
      expect(demoFor(id)?.exerciseId).toBe(id);
    }
  });

  it('the abs demos come last in the registry, floor/bench first, then standing/cable/hanging', () => {
    expect(DEMO_IDS.slice(-ABS.length)).toEqual(ABS);
  });

  it('no abs exercise has a camera rule (all count by hand)', () => {
    for (const id of ABS) expect(ruleFor(id), id).toBeUndefined();
  });

  it.each(ABS)('%s: the tempo text is the how-to tempo line', (id) => {
    expect(tempoLabel(demo(id))).toBe(must(HOWTO[id], id).tempo);
  });

  it('the how-to tempo words come through as phase labels', () => {
    expect(phaseLabel(demo('Dead_Bug'), 'lower')).toBe('Lower');
    expect(phaseLabel(demo('Dead_Bug'), 'lift')).toBe('Return');
    expect(phaseLabel(demo('Russian_Twist'), 'lift')).toBe('Twist');
    expect(phaseLabel(demo('Air_Bike'), 'lower')).toBe('Return');
    expect(phaseLabel(demo('Cable_Crunch'), 'lift')).toBe('Crunch');
    expect(phaseLabel(demo('Pallof_Press'), 'lift')).toBe('Push');
    expect(phaseLabel(demo('Pallof_Press'), 'hold')).toBe('Hold');
    expect(phaseLabel(demo('Dumbbell_Side_Bend'), 'lower')).toBe('Down');
    expect(phaseLabel(demo('Crunches'), 'lift')).toBe('Lift');
  });

  it('Dead_Bug starts with the lowering (leg out), so the loop opens on "Lower"', () => {
    const m = demo('Dead_Bug');
    expect(m.outward).toBe('lower');
    expect(phaseAt(m, 0.6)).toBe('lower');
  });

  it('opens on the side view, except the side bend (front) and the Pallof press (3/4 front)', () => {
    for (const id of ABS) {
      const m = demo(id);
      if (id === 'Dumbbell_Side_Bend') expect(m.view, id).toBe('front');
      else if (id === 'Pallof_Press') {
        expect(m.view).toBe('front');
        // Between the presets: the press goes away from the chest, the cable comes in from the side.
        expect(m.openYaw).toBeGreaterThan(-Math.PI / 2 + 0.3);
        expect(m.openYaw).toBeLessThan(-0.3);
      } else expect(m.view, id).toBe('side');
      if (id !== 'Pallof_Press') expect(m.openYaw, id).toBeUndefined();
    }
  });

  it('pickView gives the front 2D map for abdominals-only exercises', () => {
    expect(pickView(['abdominals'])).toBe('front');
    for (const id of ABS) {
      const ex = must(exercises.find((e) => e.id === id));
      expect(pickView(ex.primaryMuscles), id).toBe('front');
    }
  });
});

describe('measured joints: twist and waist', () => {
  it('twist is the turn of the shoulder line against the hip line (0 = square)', () => {
    const p = startPose(demo('Russian_Twist'));
    expect(measuredAngle(p, 'twist', 'r')).toBeCloseTo(0, 6);
    expect(measuredAngle(farPose(demo('Russian_Twist')), 'twist', 'r')).toBeCloseTo(
      demo('Russian_Twist').far,
      6,
    );
  });

  it('waist is 90 standing tall and shrinks leaning toward that side', () => {
    const m = demo('Dumbbell_Side_Bend');
    expect(measuredAngle(startPose(m), 'waist', 'r')).toBeCloseTo(90, 6);
    expect(measuredAngle(farPose(m), 'waist', 'r')).toBeLessThan(65);
    // The other side opens by as much.
    expect(measuredAngle(farPose(m), 'waist', 'l')).toBeGreaterThan(115);
  });
});

describe('M13c abs: the pelvis frame keeps the hips still', () => {
  it.each(ABS)('%s: the drawn hip joints sit where the tests measure them', (id) => {
    const m = demo(id);
    for (const { pose } of loop(m)) {
      const right = pelvisAxes(pose).right;
      for (const [k, sg] of [
        ['r', 1],
        ['l', -1],
      ] as const) {
        const drawn: V3 = [
          pose.hip[0] + right[0] * pose.hipW * sg,
          pose.hip[1] + right[1] * pose.hipW * sg,
          pose.hip[2] + right[2] * pose.hipW * sg,
        ];
        close(drawn, hipJoint(pose, k), `${id} ${k} hip`, 6);
      }
    }
  });

  it('pelvisAxes is the body frame for a pose without its own pelvis', () => {
    const p = poseAt(must(demoFor('Goblet_Squat')), 1);
    expect(p.pelvis).toBeUndefined();
    expect(pelvisAxes(p)).toEqual(bodyAxes(p));
  });

  for (const id of ['Russian_Twist', 'Air_Bike', 'Dumbbell_Side_Bend', 'Crunches']) {
    it(`${id}: the pelvis frame does not move while the chest does`, () => {
      const m = demo(id);
      const ref = pelvisAxes(startPose(m));
      for (const { pose } of loop(m)) {
        const a = pelvisAxes(pose);
        close(a.up, ref.up, 'pelvis up');
        close(a.front, ref.front, 'pelvis front');
        close(pose.hip, startPose(m).hip, 'hip');
      }
      // ...while the chest frame turns, leans or curls away from it.
      const match = (p: DemoPose) => {
        const b = bodyAxes(p);
        return dot(b.up, ref.up) + dot(b.front, ref.front);
      };
      expect(match(farPose(m))).toBeLessThan(match(startPose(m)) - 0.04);
    });

    it(`${id}: the pelvis segment and the thighs follow the pelvis, not the chest`, () => {
      const p = farPose(demo(id));
      const pel = must(segmentFrames(p).find((f) => f.segment === 'pelvis'));
      close(pel.front, pelvisAxes(p).front, 'pelvis frame front');
      const torso = must(segmentFrames(p).find((f) => f.segment === 'torso'));
      close(torso.front, bodyAxes(p).front, 'torso frame front');
    });
  }
});

describe('M13c abs: floor demos (lying on the back, head toward -x)', () => {
  const LYING = ['Crunches', 'Reverse_Crunch', 'Dead_Bug', 'Air_Bike'];

  it.each(LYING)(
    '%s: nothing goes through the floor, the figure lies with its right side at +z',
    (id) => {
      const m = demo(id);
      for (const { pose } of loop(m)) {
        for (const j of joints(pose)) expect(j[1], id).toBeGreaterThan(0.02);
        // Lying on the back: the spine runs toward -x (head end), the pelvis faces up.
        expect(pose.neck[0]).toBeLessThan(pose.hip[0]);
        expect(pelvisAxes(pose).front[1]).toBeGreaterThan(0.7);
        expect(pelvisAxes(pose).right[2]).toBeGreaterThan(0.9);
        expect(pose.r.s[2]).toBeGreaterThan(pose.l.s[2]);
      }
    },
  );

  it('Crunches: hips and feet still, feet flat, shoulders curl up, hands stay by the head', () => {
    const m = demo('Crunches');
    const ref = startPose(m);
    expect(ref.hip[1]).toBeCloseTo(LIE_Y, 9);
    expect(ref.neck[1]).toBeCloseTo(LIE_Y, 2);
    for (const { pose } of loop(m)) {
      still(pose, ref, ['k', 'a', 'toe']);
      close(pose.hip, ref.hip, 'hip');
      for (const k of SIDES) {
        expect(pose[k].a[1]).toBeCloseTo(0.09, 6);
        expect(pose[k].toe[1]).toBeCloseTo(0.03, 6);
        expect(dist(pose[k].h, headOf(pose))).toBeLessThan(0.2);
      }
    }
    // A crunch, not a sit-up: the shoulder blades come 15-30 cm off the floor.
    const rise = farPose(m).neck[1] - ref.neck[1];
    expect(rise).toBeGreaterThan(0.15);
    expect(rise).toBeLessThan(0.3);
  });

  it('Reverse_Crunch: shoulders stay down, hips roll up, knees come toward the chest', () => {
    const m = demo('Reverse_Crunch');
    const ref = startPose(m);
    const far = farPose(m);
    for (const { pose } of loop(m)) {
      close(pose.neck, ref.neck, 'neck');
      still(pose, ref, ['s', 'e', 'w', 'h']);
      // Arms by the sides, on the floor.
      for (const k of SIDES) expect(pose[k].h[1]).toBeLessThan(0.08);
    }
    expect(ref.hip[1]).toBeCloseTo(LIE_Y, 6);
    expect(far.hip[1]).toBeGreaterThan(ref.hip[1] + 0.1);
    expect(dist(far.r.k, far.neck)).toBeLessThan(dist(ref.r.k, ref.neck) - 0.15);
    // Knees bent up high from the start (thighs about vertical).
    expect(ref.r.k[1]).toBeGreaterThan(ref.hip[1] + 0.38);
  });

  it('Flat_Bench_Lying_Leg_Raise: on the bench, hands on its sides, straight legs from level to straight up', () => {
    const m = demo('Flat_Bench_Lying_Leg_Raise');
    const bench = must(m.props[0]);
    const benchTop = top(bench);
    expect(benchTop).toBeCloseTo(LEG_RAISE.top, 9);
    const ref = startPose(m);
    for (const { pose } of loop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      still(pose, ref, ['s', 'e', 'w', 'h']);
      expect(pose.hip[1] - benchTop).toBeCloseTo(LIE_Y, 6);
      for (const k of SIDES) {
        // Legs (all but) straight.
        expect(angleAtJoint(hipJoint(pose, k), pose[k].k, pose[k].a)).toBeGreaterThan(170);
        // Hands grip the bench edges, a little under the top.
        expect(Math.abs(pose[k].h[2])).toBeCloseTo(bench.size[2] / 2 + 0.025, 2);
        expect(pose[k].h[1]).toBeLessThan(benchTop);
        expect(pose[k].h[1]).toBeGreaterThan(benchTop - 0.08);
        // The legs are off the end of the bench.
        expect(pose[k].k[0]).toBeGreaterThan(bench.at[0] + bench.size[0] / 2);
      }
    }
    // Start: legs about level with the hips. Far: pointing straight up.
    expect(Math.abs(ref.r.a[1] - ref.hip[1])).toBeLessThan(0.1);
    const far = farPose(m);
    expect(far.r.a[1]).toBeGreaterThan(far.hip[1] + 0.75);
    expect(Math.abs(far.r.a[0] - far.hip[0])).toBeLessThan(0.15);
  });

  it('Dead_Bug: back flat, arms straight up, the left leg holds the table-top, the right leg reaches long and hovers', () => {
    const m = demo('Dead_Bug');
    const ref = startPose(m);
    for (const { pose } of loop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      still(pose, ref, ['s', 'e', 'w', 'h']);
      close(pose.l.k, ref.l.k, 'l.k');
      close(pose.l.a, ref.l.a, 'l.a');
      for (const k of SIDES) expect(pose[k].h[1]).toBeGreaterThan(pose[k].s[1] + 0.5);
      // The reaching foot never touches down.
      expect(pose.r.a[1]).toBeGreaterThan(0.12);
    }
    // Table-top: hips and knees at about 90 deg.
    for (const k of SIDES) {
      expect(measuredAngle(ref, 'hip', k)).toBeGreaterThan(80);
      expect(measuredAngle(ref, 'hip', k)).toBeLessThan(100);
      expect(measuredAngle(ref, 'knee', k)).toBeCloseTo(90, 0);
    }
    const far = farPose(m);
    expect(measuredAngle(far, 'knee', 'r')).toBeGreaterThan(165);
    expect(far.r.a[1]).toBeLessThan(0.35);
  });

  it('Air_Bike: shoulders up, the left elbow turns toward the right knee as it comes in', () => {
    const m = demo('Air_Bike');
    const ref = startPose(m);
    const far = farPose(m);
    for (const { pose } of loop(m)) {
      expect(pose.neck[1]).toBeGreaterThan(0.25);
      for (const k of SIDES) expect(dist(pose[k].h, headOf(pose))).toBeLessThan(0.2);
    }
    expect(dist(far.l.e, far.r.k)).toBeLessThan(dist(ref.l.e, ref.r.k) - 0.15);
    // The right knee comes in, the left leg goes long.
    expect(measuredAngle(far, 'hip', 'r')).toBeLessThan(measuredAngle(ref, 'hip', 'r') - 25);
    expect(measuredAngle(far, 'knee', 'l')).toBeGreaterThan(160);
    // The chest turns toward the right knee (+z).
    expect(bodyAxes(far).front[2]).toBeGreaterThan(0.3);
  });

  it('Russian_Twist: a V-sit with feet down, hands together in front, the chest turns to the right', () => {
    const m = demo('Russian_Twist');
    const ref = startPose(m);
    for (const { pose } of loop(m)) {
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      still(pose, ref, ['k', 'a', 'toe']);
      for (const k of SIDES) expect(pose[k].a[1]).toBeCloseTo(0.09, 6);
      expect(dist(pose.r.h, pose.l.h)).toBeLessThan(0.1);
      // Hands out in front of the chest, never through the thighs.
      const front = bodyAxes(pose).front;
      expect(dot(sub(mid(pose.r.h, pose.l.h), pose.neck), front)).toBeGreaterThan(0.3);
      for (const k of SIDES)
        for (const h of [pose.r.h, pose.l.h])
          expect(toSegment(h, hipJoint(pose, k), pose[k].k)).toBeGreaterThan(0.1);
    }
    // Leaning back into a V: hip angle about 90, torso 35-55 deg back from vertical.
    const lean = (Math.acos(bodyAxes(ref).up[1]) * 180) / Math.PI;
    expect(lean).toBeGreaterThan(35);
    expect(lean).toBeLessThan(55);
    expect(measuredAngle(ref, 'hip', 'r')).toBeGreaterThan(75);
    expect(measuredAngle(ref, 'hip', 'r')).toBeLessThan(105);
    expect(bodyAxes(farPose(m)).front[2]).toBeGreaterThan(0.4);
  });
});

describe('M13c abs: standing, cable and hanging demos', () => {
  it('Dumbbell_Side_Bend: feet still, one dumbbell in the right hand hanging straight, left hand on the waist, leaning right', () => {
    const m = demo('Dumbbell_Side_Bend');
    const ref = startPose(m);
    for (const { pose } of loop(m)) {
      still(pose, ref, ['k', 'a', 'toe']);
      close(pose.hip, ref.hip, 'hip');
      expect(pose.bells).toHaveLength(1);
      const bell = must(pose.bells[0]);
      expect(dist(bell.pos, pose.r.h)).toBeLessThan(0.06);
      // The working arm hangs straight down.
      expect(Math.abs(pose.r.h[0] - pose.r.s[0])).toBeLessThan(1e-6);
      expect(Math.abs(pose.r.h[2] - pose.r.s[2])).toBeLessThan(1e-6);
      // The free hand rests on the left side of the waist (in the leaning body's own frame).
      const b = bodyAxes(pose);
      expect(dot(sub(pose.l.h, pose.hip), b.right)).toBeLessThan(-0.15);
      expect(Math.abs(dot(sub(pose.l.h, pose.hip), b.up) - 0.15)).toBeLessThan(0.08);
      // No turning: the chest keeps facing forward.
      expect(bodyAxes(pose).front[0]).toBeGreaterThan(0.999);
    }
    const far = farPose(m);
    expect(far.neck[2]).toBeGreaterThan(0.2);
    expect(far.r.h[1]).toBeLessThan(ref.r.h[1] - 0.08);
  });

  it('Cable_Crunch: kneeling still, hands by the head on the rope, the torso curls down, the cable never cuts the head', () => {
    const m = demo('Cable_Crunch');
    const ref = startPose(m);
    for (const { pose } of loop(m)) {
      still(pose, ref, ['k', 'a', 'toe']);
      close(pose.hip, ref.hip, 'hip');
      for (const k of SIDES) {
        expect(pose[k].k[1]).toBeLessThan(0.08); // knees on the floor
        expect(pose[k].a[1]).toBeLessThan(0.08); // shins down
        expect(dist(pose[k].h, headOf(pose))).toBeLessThan(0.2);
      }
      const rods = must(pose.rods);
      // Rope from each hand to the knot, cable from the knot to the pulley.
      const cable = must(rods[2]);
      close(cable.b, CABLE_CRUNCH.pulley, 'pulley');
      expect(dist(must(rods[0]).a, pose.r.h)).toBeLessThan(1e-9);
      expect(dist(must(rods[1]).a, pose.l.h)).toBeLessThan(1e-9);
      const head = headOf(pose);
      expect(toSegment(head, cable.a, cable.b)).toBeGreaterThan(0.12);
    }
    // Hips stay over the knees; the spine goes from about upright to well forward.
    const tilt = (p: DemoPose) => (Math.acos(bodyAxes(p).up[1]) * 180) / Math.PI;
    expect(tilt(ref)).toBeLessThan(25);
    expect(tilt(farPose(m))).toBeGreaterThan(55);
    // Elbows come down toward the thighs.
    const far = farPose(m);
    expect(far.r.e[1]).toBeLessThan(ref.r.e[1] - 0.3);
  });

  it('Pallof_Press: side to the column, the handle presses straight out at chest height, no turning', () => {
    const m = demo('Pallof_Press');
    const ref = startPose(m);
    const far = farPose(m);
    for (const { pose } of loop(m)) {
      still(pose, ref, ['s', 'k', 'a', 'toe']);
      close(pose.hip, ref.hip, 'hip');
      close(pose.neck, ref.neck, 'neck');
      expect(bodyAxes(pose).front[0]).toBeGreaterThan(0.999);
      // Both hands on one handle, at chest height, on the midline.
      expect(dist(pose.r.h, pose.l.h)).toBeLessThan(0.1);
      const g = mid(pose.r.h, pose.l.h);
      expect(g[1]).toBeCloseTo(PALLOF.handleY, 6);
      expect(Math.abs(g[2])).toBeLessThan(1e-9);
      // The cable comes in from the column on the left.
      const cable = must(must(pose.rods)[0]);
      close(cable.a, PALLOF.pulley, 'pulley');
      expect(PALLOF.pulley[2]).toBeLessThan(-0.6);
    }
    const g0 = mid(ref.r.h, ref.l.h);
    const g1 = mid(far.r.h, far.l.h);
    expect(g1[0] - g0[0]).toBeGreaterThan(0.3);
    expect(measuredAngle(far, 'elbow', 'r')).toBeGreaterThan(170);
  });

  it('Hanging_Leg_Raise: hands on the bar, arms straight, body still, feet clear of the floor, legs up to hip level', () => {
    const m = demo('Hanging_Leg_Raise');
    const ref = startPose(m);
    for (const { pose } of loop(m)) {
      still(pose, ref, ['s', 'e', 'w', 'h']);
      close(pose.hip, ref.hip, 'hip');
      for (const k of SIDES) {
        expect(Math.abs(pose[k].h[1] - HANGING.barY)).toBeLessThan(1e-6);
        expect(measuredAngle(pose, 'elbow', k)).toBeGreaterThan(178);
        expect(angleAtJoint(hipJoint(pose, k), pose[k].k, pose[k].a)).toBeGreaterThan(170);
        expect(pose[k].toe[1]).toBeGreaterThan(0.08);
      }
    }
    const bar = must(m.props.find((p) => p.size[2] > 0.8));
    expect(bar.at[1]).toBeCloseTo(HANGING.barY, 9);
    const far = farPose(m);
    expect(Math.abs(far.r.a[1] - far.hip[1])).toBeLessThan(0.1);
    expect(ref.r.a[1]).toBeLessThan(ref.hip[1] - 0.75);
  });
});

describe('M13c abs: highlights', () => {
  const lit = (id: string, t = 1.2) => {
    const m = demo(id);
    const ex = must(exercises.find((e) => e.id === id));
    const p = poseAt(m, t);
    return {
      pose: p,
      patches: patchesFor(
        segmentFrames(p),
        highlightFor(ex.primaryMuscles, ex.secondaryMuscles, m.abs),
      ).filter((x) => x.muscle === 'abdominals'),
    };
  };

  it('WAIST_SIDES is a span on the outer face of the torso, below the lats', () => {
    expect(WAIST_SIDES).toEqual({ segment: 'torso', face: 'outer', span: [0.08, 0.5] });
  });

  it('highlightFor defaults to the front of the abs; "sides" lights only the waist sides; "both" both', () => {
    const front = highlightFor(['abdominals'], []);
    expect(front.map((h) => h.face)).toEqual(['front']);
    const sides = highlightFor(['abdominals'], [], 'sides');
    expect(sides).toEqual([{ ...WAIST_SIDES, muscle: 'abdominals', level: 'primary' }]);
    const both = highlightFor(['abdominals'], [], 'both');
    expect(both.map((h) => h.face)).toEqual(['front', 'outer']);
    // Secondary abs keep their level wherever they light.
    expect(highlightFor([], ['abdominals'], 'sides')[0]?.level).toBe('secondary');
    // Other muscles don't change.
    expect(highlightFor(['lats'], [], 'sides')).toEqual(highlightFor(['lats'], []));
  });

  it('side bends light the sides of the waist: two mirrored outer-face patches, none on the front', () => {
    const { pose, patches } = lit('Dumbbell_Side_Bend');
    expect(demo('Dumbbell_Side_Bend').abs).toBe('sides');
    expect(patches).toHaveLength(2);
    const right = bodyAxes(pose).right;
    const n = patches.map((x) => dot(x.normal, right)).sort();
    expect(n[0]).toBeCloseTo(-1, 6);
    expect(n[1]).toBeCloseTo(1, 6);
    // Low on the torso: below the lats' span (0.35-0.85 up the spine).
    const spine = sub(pose.neck, pose.hip);
    for (const x of patches) {
      const along = dot(sub(x.centre, pose.hip), spine) / dot(spine, spine);
      expect(along).toBeLessThan(0.35);
      expect(along).toBeGreaterThan(0.2);
    }
  });

  it.each(['Russian_Twist', 'Air_Bike'])(
    '%s: twists light the front of the abs and both sides',
    (id) => {
      const { pose, patches } = lit(id);
      expect(demo(id).abs).toBe('both');
      const f = bodyAxes(pose);
      expect(patches).toHaveLength(3);
      expect(patches.filter((x) => dot(x.normal, f.front) > 0.99)).toHaveLength(1);
      expect(patches.filter((x) => Math.abs(dot(x.normal, f.right)) > 0.99)).toHaveLength(2);
    },
  );

  it.each([
    'Crunches',
    'Reverse_Crunch',
    'Flat_Bench_Lying_Leg_Raise',
    'Dead_Bug',
    'Cable_Crunch',
    'Pallof_Press',
    'Hanging_Leg_Raise',
  ])('%s: crunches, leg raises and the anti-turn press light the front of the abs only', (id) => {
    const { pose, patches } = lit(id);
    expect(demo(id).abs ?? 'front').toBe('front');
    expect(patches).toHaveLength(1);
    expect(dot(must(patches[0]).normal, bodyAxes(pose).front)).toBeGreaterThan(0.99);
  });

  it('lying on the back, the abs patch faces up (the camera above sees it)', () => {
    for (const id of ['Crunches', 'Dead_Bug', 'Flat_Bench_Lying_Leg_Raise']) {
      const { patches } = lit(id, 0);
      expect(must(patches[0]).normal[1], id).toBeGreaterThan(0.9);
    }
  });

  it('Pallof_Press: the data secondaries (chest, shoulders, triceps) light as secondary', () => {
    const m = demo('Pallof_Press');
    const ex = must(exercises.find((e) => e.id === 'Pallof_Press'));
    const patches = patchesFor(
      segmentFrames(poseAt(m, 1)),
      highlightFor(ex.primaryMuscles, ex.secondaryMuscles, m.abs),
    );
    for (const s of ['chest', 'shoulders', 'triceps']) {
      const x = patches.filter((p) => p.muscle === s);
      expect(x.length, s).toBeGreaterThan(0);
      expect(x.every((p) => p.level === 'secondary')).toBe(true);
    }
  });
});
