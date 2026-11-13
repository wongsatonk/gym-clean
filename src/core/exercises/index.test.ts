import { describe, expect, it } from 'vitest';
import program from '../../data/program.json';
import { LANDMARK, LANDMARK_COUNT } from '../poseTopology';
import type { LandmarkFrame } from '../types';
import { extendedGatePasses, RULES, ruleFor, ruleForFolder } from './index';
import type { ExerciseRule } from './types';

const L = LANDMARK;

const poseIds = [
  ...new Set(
    program.days.flatMap((d) =>
      d.exercises.filter((e) => e.tracking === 'pose').map((e) => e.exerciseId),
    ),
  ),
];

describe('rule coverage', () => {
  it('program has the six pose-tracked exercises', () => {
    expect(poseIds.sort()).toEqual(
      [
        'Dumbbell_Bicep_Curl',
        'Goblet_Squat',
        'One-Arm_Dumbbell_Row',
        'Pushups',
        'Seated_Dumbbell_Press',
        'Side_Lateral_Raise',
      ].sort(),
    );
  });

  it('every pose exercise has exactly one rule', () => {
    for (const id of poseIds) {
      expect(
        RULES.filter((r) => r.exerciseId === id),
        id,
      ).toHaveLength(1);
      expect(ruleFor(id)?.exerciseId).toBe(id);
    }
  });

  it("every rule's exerciseId is a pose exercise", () => {
    for (const r of RULES) expect(poseIds).toContain(r.exerciseId);
  });

  it('folder names are unique and match the fixture folders', () => {
    const folders = RULES.map((r) => r.folder);
    expect(new Set(folders).size).toBe(folders.length);
    expect([...folders].sort()).toEqual(
      ['curl', 'goblet-squat', 'lateral-raise', 'push-up', 'row', 'shoulder-press'].sort(),
    );
    for (const r of RULES) expect(ruleForFolder(r.folder)).toBe(r);
  });

  it('unknown ids and folders return undefined', () => {
    expect(ruleFor('Dumbbell_Bench_Press')).toBeUndefined();
    expect(ruleFor('')).toBeUndefined();
    expect(ruleForFolder('bench')).toBeUndefined();
  });
});

describe.each(RULES.map((r) => [r.folder, r] as const))('rule %s', (_folder, r: ExerciseRule) => {
  it('thresholds are ordered for its direction, with room for hysteresis', () => {
    if (r.direction === 'decreasing') {
      expect(r.contracted + r.hysteresisDeg).toBeLessThan(r.extended - r.hysteresisDeg);
    } else {
      expect(r.contracted - r.hysteresisDeg).toBeGreaterThan(r.extended + r.hysteresisDeg);
    }
    for (const v of [r.extended, r.contracted]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(180);
    }
  });

  it('a partial (start threshold ± minPartialDepth) is past the hysteresis and short of the far threshold', () => {
    expect(r.minPartialDepthDeg).toBeGreaterThan(r.hysteresisDeg);
    const span = Math.abs(r.extended - r.contracted);
    expect(r.minPartialDepthDeg).toBeLessThan(span);
  });

  it('triplets are valid landmark indices, distinct per side, mirrored left/right', () => {
    for (const side of ['left', 'right'] as const) {
      const t = r.triplets[side];
      expect(new Set(t).size).toBe(3);
      for (const i of t) {
        expect(Number.isInteger(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(LANDMARK_COUNT);
      }
    }
    // BlazePose: every left landmark (≥ 11) is odd, its right twin is +1.
    r.triplets.left.forEach((i, k) => {
      expect(r.triplets.right[k]).toBe(i + 1);
    });
  });

  it('counter tuning values are sane', () => {
    expect(r.emaAlpha).toBeGreaterThan(0);
    expect(r.emaAlpha).toBeLessThanOrEqual(1);
    expect(r.minPhaseMs).toBeGreaterThan(0);
    expect(r.minVisibility).toBeGreaterThan(0);
    expect(r.minVisibility).toBeLessThan(1);
  });
});

// SPEC §2 M4 table as tuned on the fixtures in M4 task 7 (see the 2026-11-13 Decision).
describe('per-exercise data (SPEC §2 M4 table)', () => {
  const get = (folder: string): ExerciseRule => {
    const r = ruleForFolder(folder);
    if (!r) throw new Error(folder);
    return r;
  };

  it.each([
    ['curl', 'Dumbbell_Bicep_Curl', 'side', 150, 70],
    ['push-up', 'Pushups', 'side', 150, 95],
    ['shoulder-press', 'Seated_Dumbbell_Press', 'front', 155, 100],
    ['row', 'One-Arm_Dumbbell_Row', 'side', 145, 90],
    ['goblet-squat', 'Goblet_Squat', 'side', 160, 100],
    ['lateral-raise', 'Side_Lateral_Raise', 'front', 25, 75],
  ] as const)('%s → %s, %s view, extended %d, contracted %d', (folder, id, view, ext, con) => {
    const r = get(folder);
    expect(r.exerciseId).toBe(id);
    expect(r.view).toBe(view);
    expect(r.extended).toBe(ext);
    expect(r.contracted).toBe(con);
  });

  it('joint triplets: elbow for arms, knee for squat, shoulder for lateral raise', () => {
    const elbow = {
      left: [L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST],
      right: [L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST],
    };
    for (const f of ['curl', 'push-up', 'shoulder-press', 'row'])
      expect(get(f).triplets).toEqual(elbow);
    expect(get('goblet-squat').triplets).toEqual({
      left: [L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE],
      right: [L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
    });
    expect(get('lateral-raise').triplets).toEqual({
      left: [L.LEFT_HIP, L.LEFT_SHOULDER, L.LEFT_ELBOW],
      right: [L.RIGHT_HIP, L.RIGHT_SHOULDER, L.RIGHT_ELBOW],
    });
  });

  it('lateral raise is the only inverted (increasing) rule', () => {
    for (const r of RULES) {
      expect(r.direction).toBe(r.folder === 'lateral-raise' ? 'increasing' : 'decreasing');
    }
  });

  it('shoulder press starts contracted, the rest start extended', () => {
    for (const r of RULES) {
      expect(r.start).toBe(r.folder === 'shoulder-press' ? 'contracted' : 'extended');
    }
  });

  it('eccentric (lowering) phase: toward extended for curl/row/raise, toward contracted for push-up/squat/press', () => {
    expect(get('curl').eccentric).toBe('toExtended');
    expect(get('row').eccentric).toBe('toExtended');
    expect(get('lateral-raise').eccentric).toBe('toExtended');
    expect(get('push-up').eccentric).toBe('toContracted');
    expect(get('goblet-squat').eccentric).toBe('toContracted');
    expect(get('shoulder-press').eccentric).toBe('toContracted');
  });

  it('side views use the best-visible side, front views use both', () => {
    for (const r of RULES) expect(r.sideMode).toBe(r.view === 'side' ? 'best' : 'both');
  });

  it('limb label: leg for squat, arm otherwise', () => {
    for (const r of RULES) expect(r.limb).toBe(r.folder === 'goblet-squat' ? 'leg' : 'arm');
  });

  it('only the shoulder press has an extended gate (wrist above shoulder)', () => {
    for (const r of RULES) {
      if (r.folder === 'shoulder-press') {
        expect(r.extendedGate).toEqual({
          upper: { left: L.LEFT_WRIST, right: L.RIGHT_WRIST },
          lower: { left: L.LEFT_SHOULDER, right: L.RIGHT_SHOULDER },
        });
      } else {
        expect(r.extendedGate).toBeUndefined();
      }
    }
  });

  it('SPEC §3 counter defaults: EMA 0.4, 10° hysteresis, 250 ms phase, visibility 0.5', () => {
    for (const r of RULES) {
      expect(r.emaAlpha).toBe(0.4);
      expect(r.hysteresisDeg).toBe(10);
      expect(r.minPhaseMs).toBe(250);
      expect(r.minVisibility).toBe(0.5);
    }
  });
});

describe('extendedGatePasses', () => {
  const press = ruleForFolder('shoulder-press');
  const curl = ruleForFolder('curl');
  if (!press || !curl) throw new Error('rules missing');

  /** Image y grows downward. */
  function frameWith(wristY: number, shoulderY: number): LandmarkFrame {
    const landmarks = Array.from({ length: LANDMARK_COUNT }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.9,
    }));
    for (const [w, s] of [
      [L.LEFT_WRIST, L.LEFT_SHOULDER],
      [L.RIGHT_WRIST, L.RIGHT_SHOULDER],
    ] as const) {
      landmarks[w] = { x: 0.5, y: wristY, z: 0, visibility: 0.9 };
      landmarks[s] = { x: 0.5, y: shoulderY, z: 0, visibility: 0.9 };
    }
    return { t: 0, landmarks };
  }

  it('passes when the wrist is above the shoulder (smaller image y)', () => {
    expect(extendedGatePasses(press, frameWith(0.1, 0.3), 'right')).toBe(true);
    expect(extendedGatePasses(press, frameWith(0.1, 0.3), 'left')).toBe(true);
  });

  it('fails with arms hanging at the sides (wrist below shoulder)', () => {
    expect(extendedGatePasses(press, frameWith(0.6, 0.3), 'right')).toBe(false);
  });

  it('fails when the gate landmarks are missing', () => {
    expect(extendedGatePasses(press, { t: 0, landmarks: [] }, 'right')).toBe(false);
  });

  it('always passes for rules without a gate', () => {
    expect(extendedGatePasses(curl, frameWith(0.6, 0.3), 'right')).toBe(true);
    expect(extendedGatePasses(curl, { t: 0, landmarks: [] }, 'left')).toBe(true);
  });
});
