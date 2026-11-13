import { describe, expect, it } from 'vitest';
import exercises from '../../data/exercises.json';
import { highlightFor } from './highlight';
import { DEMOS, cycleSeconds, poseAt, type DemoMove, type Phase, type V3 } from './moves';
import {
  armTwist,
  bodyAxes,
  demoBounds,
  fitCamera,
  limbFrame,
  patchesFor,
  phaseLabel,
  segmentFrames,
} from './rig';

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const STAND = { up: [0, 1, 0] as V3, front: [1, 0, 0] as V3, right: [0, 0, 1] as V3 };

function demo(id: string): DemoMove {
  const m = DEMOS.find((d) => d.exerciseId === id);
  if (!m) throw new Error(`no demo ${id}`);
  return m;
}

function muscles(id: string) {
  const ex = (
    exercises as { id: string; primaryMuscles: string[]; secondaryMuscles: string[] }[]
  ).find((e) => e.id === id);
  return { primary: ex?.primaryMuscles ?? [], secondary: ex?.secondaryMuscles ?? [] };
}

describe('limbFrame', () => {
  it('keeps the standing frame for a hanging limb', () => {
    const f = limbFrame([0, -1, 0], STAND, 1);
    expect(f.front[0]).toBeCloseTo(1);
    expect(f.outer[2]).toBeCloseTo(1);
    expect(limbFrame([0, -1, 0], STAND, -1).outer[2]).toBeCloseTo(-1);
  });

  it('turns the front up for a limb flexed forward (seated thigh, push-up arm)', () => {
    const f = limbFrame([1, 0, 0], STAND, 1);
    expect(f.front[1]).toBeCloseTo(1);
    expect(f.outer[2]).toBeCloseTo(1);
  });

  it('keeps the front forward for a sideways raise and straight overhead', () => {
    expect(limbFrame([0, 0, 1], STAND, 1).front[0]).toBeCloseTo(1);
    expect(limbFrame([0, 0, 1], STAND, 1).outer[1]).toBeCloseTo(1);
    const over = limbFrame([0, 1, 0], STAND, 1);
    expect(over.front[0]).toBeCloseTo(1);
    expect(over.outer[2]).toBeCloseTo(-1);
  });

  it('is continuous approaching overhead from the side', () => {
    const near = limbFrame([0, Math.cos(1e-4), Math.sin(1e-4)], STAND, 1);
    const at = limbFrame([0, 1, 0], STAND, 1);
    expect(
      len([near.front[0] - at.front[0], near.front[1] - at.front[1], near.front[2] - at.front[2]]),
    ).toBeLessThan(1e-3);
  });
});

describe('segmentFrames', () => {
  for (const m of DEMOS) {
    it(`${m.exerciseId}: orthonormal frames over the whole loop`, () => {
      const T = cycleSeconds(m);
      for (let i = 0; i <= 20; i++) {
        for (const f of segmentFrames(poseAt(m, (T * i) / 20))) {
          expect(len(f.axis)).toBeCloseTo(1, 6);
          expect(len(f.front)).toBeCloseTo(1, 6);
          expect(len(f.outer)).toBeCloseTo(1, 6);
          expect(Math.abs(dot(f.axis, f.front))).toBeLessThan(1e-6);
          expect(Math.abs(dot(f.axis, f.outer))).toBeLessThan(1e-6);
          expect(Math.abs(dot(f.front, f.outer))).toBeLessThan(1e-6);
        }
      }
    });
  }

  it('push-up: the chest faces the floor, the right arm is on the right', () => {
    const p = poseAt(demo('Pushups'), 0);
    expect(bodyAxes(p).front[1]).toBeLessThan(-0.8);
    const frames = segmentFrames(p);
    const torso = frames.find((f) => f.segment === 'torso');
    expect(torso?.front[1]).toBeLessThan(-0.8);
    const rUpper = frames.find((f) => f.segment === 'upperArm' && f.side === 1);
    expect(rUpper?.a[2]).toBeGreaterThan(0);
  });

  it('has every mannequin segment, limbs on both sides', () => {
    const frames = segmentFrames(poseAt(demo('Side_Lateral_Raise'), 0));
    expect(
      frames
        .filter((f) => f.segment === 'forearm')
        .map((f) => f.side)
        .sort(),
    ).toEqual([-1, 1]);
    expect(frames.filter((f) => f.side === 0).map((f) => f.segment)).toEqual([
      'torso',
      'pelvis',
      'neck',
      'head',
    ]);
  });
});

describe('patchesFor', () => {
  it('lights both shoulders for a lateral raise, primary level', () => {
    const m = demo('Side_Lateral_Raise');
    const { primary, secondary } = muscles(m.exerciseId);
    const patches = patchesFor(segmentFrames(poseAt(m, 1)), highlightFor(primary, secondary));
    const shoulders = patches.filter((p) => p.muscle === 'shoulders');
    expect(shoulders).toHaveLength(2);
    expect(shoulders.every((p) => p.level === 'primary')).toBe(true);
    expect(shoulders.map((p) => Math.sign(p.centre[2])).sort()).toEqual([-1, 1]);
  });

  it('push-up chest patch sits on the floor side of the torso; triceps secondary on both arms', () => {
    const m = demo('Pushups');
    const { primary, secondary } = muscles(m.exerciseId);
    const p = poseAt(m, 0);
    const patches = patchesFor(segmentFrames(p), highlightFor(primary, secondary));
    const chest = patches.find((x) => x.muscle === 'chest');
    expect(chest?.level).toBe('primary');
    // Chest span [0.6, 0.95] of hip -> neck: below the spine line at that point.
    const onSpine = p.hip[1] + (p.neck[1] - p.hip[1]) * 0.775;
    expect(chest?.centre[1]).toBeLessThan(onSpine - 0.04);
    const tri = patches.filter((x) => x.muscle === 'triceps');
    expect(tri).toHaveLength(2);
    expect(tri.every((x) => x.level === 'secondary')).toBe(true);
  });

  it('lats (torso outer) give two mirrored patches', () => {
    const p = poseAt(demo('Side_Lateral_Raise'), 0);
    const lats = patchesFor(segmentFrames(p), highlightFor(['lats'], []));
    expect(lats).toHaveLength(2);
    expect(lats[0]?.centre[2]).toBeCloseTo(-(lats[1]?.centre[2] ?? 0));
  });

  it('patch sizes are positive and finite for every demo', () => {
    for (const m of DEMOS) {
      const { primary, secondary } = muscles(m.exerciseId);
      for (const x of patchesFor(segmentFrames(poseAt(m, 1.2)), highlightFor(primary, secondary)))
        for (const v of [...x.half, ...x.centre]) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('armTwist', () => {
  it('is 0 for straight-arm and forward-fold demos, well over 90 deg for the overhead triceps extension', () => {
    expect(armTwist(demo('Side_Lateral_Raise'))).toEqual({ r: 0, l: 0 });
    expect(Math.abs(armTwist(demo('Pushups')).r)).toBeLessThan(0.5);
    const tri = armTwist(demo('Standing_Dumbbell_Triceps_Extension'));
    expect(Math.abs(tri.r)).toBeGreaterThan(2);
    expect(Math.abs(tri.l)).toBeGreaterThan(2);
  });

  it('puts the triceps on the forward side in the triceps extension', () => {
    const m = demo('Standing_Dumbbell_Triceps_Extension');
    const p = poseAt(m, 1.5);
    const patches = patchesFor(segmentFrames(p, armTwist(m)), highlightFor(['triceps'], []));
    expect(patches).toHaveLength(2);
    for (const x of patches) expect(x.normal[0]).toBeGreaterThan(0.5);
  });

  it('turns the seated-press biceps up (the forearm folds upward)', () => {
    const m = demo('Seated_Dumbbell_Press');
    const f = segmentFrames(m.pose(m.start), armTwist(m)).find(
      (x) => x.segment === 'upperArm' && x.side === 1,
    );
    const fore = m.pose(m.start).r;
    const d: V3 = [fore.w[0] - fore.e[0], fore.w[1] - fore.e[1], fore.w[2] - fore.e[2]];
    expect(dot(f?.front ?? [0, 0, 0], d)).toBeGreaterThan(0.1);
  });
});

describe('camera fit', () => {
  it('bounds contain every joint and the floor', () => {
    for (const m of DEMOS) {
      const b = demoBounds(m);
      expect(b.min[1]).toBeLessThanOrEqual(0);
      const p = poseAt(m, 1);
      for (const j of [p.neck, p.hip, p.r.h, p.l.h, p.r.toe])
        for (let i = 0; i < 3; i++) {
          expect(j[i]).toBeGreaterThanOrEqual(b.min[i] ?? 0);
          expect(j[i]).toBeLessThanOrEqual(b.max[i] ?? 0);
        }
    }
  });

  it('a narrower canvas moves the camera back', () => {
    const b = demoBounds(demo('Pushups'));
    expect(fitCamera(b, 32, 0.6).distance).toBeGreaterThan(fitCamera(b, 32, 1.5).distance);
    expect(fitCamera(b, 32, 1).distance).toBeGreaterThan(1);
  });
});

describe('phaseLabel', () => {
  const cases: [string, Phase, string][] = [
    ['Pushups', 'lower', 'Down'],
    ['Pushups', 'lift', 'Up'],
    ['Side_Lateral_Raise', 'lift', 'Lift'],
    ['Side_Lateral_Raise', 'lower', 'Lower'],
    ['Side_Lateral_Raise', 'hold', 'Hold'],
    ['Pushups', 'pause', 'Hold'],
  ];
  it.each(cases)('%s %s -> %s', (id, phase, label) => {
    expect(phaseLabel(demo(id), phase)).toBe(label);
  });
});
