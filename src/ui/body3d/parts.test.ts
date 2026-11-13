import { describe, expect, it } from 'vitest';
import exercises from '../../data/exercises.json';
import { MUSCLES } from '../bodyMap';
import { BODY_SEGMENTS, MUSCLE_PARTS, facingAngle } from './parts';

const flat = (xs: readonly (readonly number[])[]) => xs.flat();

describe('3D body layout', () => {
  it('has at least one 3D part for every muscle group, and for every muscle in the data', () => {
    const covered = new Set(MUSCLE_PARTS.map((p) => p.muscle));
    for (const m of MUSCLES) expect(covered.has(m), m).toBe(true);
    for (const e of exercises) {
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles])
        expect(covered.has(m as never), m).toBe(true);
    }
  });

  it('is symmetric: every off-centre part has a mirrored twin', () => {
    for (const p of MUSCLE_PARTS) {
      if (Math.abs(p.at[0]) < 1e-9) continue;
      const twin = MUSCLE_PARTS.find(
        (q) =>
          q.muscle === p.muscle &&
          Math.abs(q.at[0] + p.at[0]) < 1e-9 &&
          q.at[1] === p.at[1] &&
          q.at[2] === p.at[2],
      );
      expect(twin, `${p.muscle} @ ${p.at.join(',')}`).toBeDefined();
    }
  });

  it('uses only finite, positive sizes', () => {
    for (const p of MUSCLE_PARTS) {
      for (const n of [...p.at, ...p.scale]) expect(Number.isFinite(n)).toBe(true);
      for (const n of p.scale) expect(n).toBeGreaterThan(0);
    }
    for (const s of BODY_SEGMENTS) {
      const nums = s.kind === 'capsule' ? [...flat([s.a, s.b]), s.r] : [...s.at, ...s.size];
      for (const n of nums) expect(Number.isFinite(n)).toBe(true);
    }
  });

  it('puts front muscles in front of the body and back muscles behind it', () => {
    const z = (m: string) => MUSCLE_PARTS.filter((p) => p.muscle === m).map((p) => p.at[2]);
    for (const m of ['chest', 'abdominals', 'quadriceps', 'biceps'])
      for (const v of z(m)) expect(v, m).toBeGreaterThan(0);
    for (const m of [
      'lats',
      'middle back',
      'lower back',
      'glutes',
      'hamstrings',
      'triceps',
      'calves',
    ])
      for (const v of z(m)) expect(v, m).toBeLessThan(0);
  });
});

describe('facingAngle', () => {
  it('turns the body so the working muscles face the camera, with a slight 3/4 angle', () => {
    expect(Math.cos(facingAngle(['chest']))).toBeGreaterThan(0.8);
    expect(Math.cos(facingAngle(['quadriceps']))).toBeGreaterThan(0.8);
    expect(Math.cos(facingAngle(['lats']))).toBeLessThan(-0.8);
    expect(Math.cos(facingAngle(['hamstrings', 'glutes']))).toBeLessThan(-0.8);
    expect(Math.abs(Math.sin(facingAngle(['chest'])))).toBeGreaterThan(0.1); // never dead-on flat
    expect(Number.isFinite(facingAngle([]))).toBe(true);
    expect(Number.isFinite(facingAngle(['shoulders']))).toBe(true);
  });
});
