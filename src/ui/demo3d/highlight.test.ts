import { describe, expect, it } from 'vitest';
import exercises from '../../data/exercises.json';
import { MUSCLES } from '../bodyMap';
import { MANNEQUIN_SEGMENTS, MUSCLE_TO_PARTS, highlightFor, partsFor } from './highlight';
import { DEMO_IDS } from './moves';

const byId = new Map(exercises.map((e) => [e.id, e]));

describe('muscle -> mannequin part map', () => {
  it('maps every M2 muscle to at least one known mannequin part', () => {
    for (const m of MUSCLES) {
      const parts = MUSCLE_TO_PARTS[m];
      expect(parts.length, m).toBeGreaterThan(0);
      for (const p of parts) {
        expect(MANNEQUIN_SEGMENTS, `${m} -> ${p.segment}`).toContain(p.segment);
        const [a, b] = p.span ?? [0, 1];
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
        expect(b).toBeGreaterThan(a);
      }
    }
  });

  for (const id of DEMO_IDS) {
    it(`${id}: every primary and secondary muscle lights at least one part`, () => {
      const ex = byId.get(id);
      expect(ex, id).toBeDefined();
      if (!ex) return;
      expect(ex.primaryMuscles.length).toBeGreaterThan(0);
      for (const m of [...ex.primaryMuscles, ...ex.secondaryMuscles])
        expect(partsFor(m).length, `${id}: ${m}`).toBeGreaterThan(0);
      const lit = highlightFor(ex.primaryMuscles, ex.secondaryMuscles);
      expect(lit.some((h) => h.level === 'primary')).toBe(true);
      if (ex.secondaryMuscles.length) expect(lit.some((h) => h.level === 'secondary')).toBe(true);
    });
  }

  it('unknown muscle names map to nothing (no throw)', () => {
    expect(partsFor('wings')).toEqual([]);
    expect(highlightFor(['wings'], [])).toEqual([]);
  });

  it('primary wins over secondary when both light the same part', () => {
    // Shoulders (primary) and triceps (secondary) both live on the arm, but on different parts;
    // listing a muscle as both keeps it primary only.
    const lit = highlightFor(['shoulders'], ['shoulders', 'triceps']);
    const shoulder = lit.filter((h) => h.muscle === 'shoulders');
    expect(shoulder.every((h) => h.level === 'primary')).toBe(true);
    expect(lit.some((h) => h.muscle === 'triceps' && h.level === 'secondary')).toBe(true);
  });

  it('chest and back muscles sit on opposite faces of the torso', () => {
    const face = (m: string) => partsFor(m).find((p) => p.segment === 'torso')?.face;
    expect(face('chest')).toBe('front');
    expect(face('abdominals')).toBe('front');
    expect(face('middle back')).toBe('back');
    expect(face('lower back')).toBe('back');
  });
});
