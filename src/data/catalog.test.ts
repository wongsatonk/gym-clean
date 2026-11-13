import { describe, expect, it } from 'vitest';
import howtoJson from './howto.json';
import { cueFor, exerciseById, howToFor, program, programDay } from './catalog';

const allPlanned = program.days.flatMap((d) => d.exercises);

describe('program data', () => {
  it('has six PPL days with unique ids', () => {
    expect(program.days.map((d) => d.id)).toEqual([
      'push-a',
      'pull-a',
      'legs-a',
      'push-b',
      'pull-b',
      'legs-b',
    ]);
  });

  it('every planned exercise has vendored data and a cue of at most 8 words', () => {
    for (const p of allPlanned) {
      expect(exerciseById(p.exerciseId), p.exerciseId).toBeDefined();
      const cue = cueFor(p.exerciseId);
      expect(cue, p.exerciseId).toBeTruthy();
      expect(cue.split(/\s+/).length, cue).toBeLessThanOrEqual(8);
    }
  });

  it('has valid set, rep, rest and weight values', () => {
    for (const p of allPlanned) {
      expect(p.sets).toBeGreaterThan(0);
      const [min, max] = p.targetReps;
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThanOrEqual(min);
      expect(p.restSec).toBeGreaterThanOrEqual(30);
      expect(p.startWeightKg ?? 0).toBeGreaterThanOrEqual(0);
      expect((p.startWeightKg ?? 0) % 2.5, `${p.exerciseId} weight on a 2.5 kg step`).toBe(0);
      expect(['pose', 'manual']).toContain(p.tracking);
    }
  });

  it('weights chest, arms and back above legs', () => {
    const muscleSets = (muscles: string[]) =>
      allPlanned
        .filter((p) => muscles.includes(exerciseById(p.exerciseId)?.primaryMuscles[0] ?? ''))
        .reduce((n, p) => n + p.sets, 0);
    const upperPriority = muscleSets(['chest', 'biceps', 'triceps', 'lats', 'middle back']);
    const legs = muscleSets(['quadriceps', 'hamstrings', 'calves']);
    expect(upperPriority).toBeGreaterThan(legs);
  });

  it('never repeats an exercise within a day (logs are keyed by exerciseId)', () => {
    for (const d of program.days) {
      const ids = d.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size, d.id).toBe(ids.length);
    }
  });

  it('looks up a day by id', () => {
    expect(programDay('pull-a')?.name).toBe('Pull A');
    expect(programDay('nope')).toBeUndefined();
  });
});

describe('how-to text (M4b)', () => {
  const ids = [...new Set(allPlanned.map((p) => p.exerciseId))];
  // Coaching language only (CLAUDE.md "No medical claims"); same spirit as the hint denylist.
  const banned =
    /\b(pain\w*|injur\w*|hurt\w*|damag\w*|safe\w*|risk\w*|medical\w*|doctor\w*|diagnos\w*|therap\w*|rehab\w*|heal\w*|strain\w*|tear\w*|cure\w*|prevent\w*)\b/i;

  it('covers all 30 program exercises and nothing else', () => {
    expect(ids).toHaveLength(30);
    expect(Object.keys(howtoJson).sort()).toEqual([...ids].sort());
  });

  it('every exercise has 2-3 lines, a focus line and a tempo line, each at most 70 chars', () => {
    for (const id of ids) {
      const h = howToFor(id);
      expect(h, id).toBeDefined();
      if (!h) continue;
      expect(h.lines.length, id).toBeGreaterThanOrEqual(2);
      expect(h.lines.length, id).toBeLessThanOrEqual(3);
      for (const text of [...h.lines, h.focus, h.tempo]) {
        expect(text.trim(), id).toBe(text);
        expect(text.length, `${id}: ${text}`).toBeGreaterThan(0);
        expect(text.length, `${id}: ${text}`).toBeLessThanOrEqual(70);
      }
      // The slow, controlled half is always spelled out (SPEC M4b tempo).
      expect(h.tempo, id).toMatch(/\b(Lower|Return|Down) 2 s\b/);
    }
  });

  it('uses no medical words', () => {
    for (const id of ids) {
      const h = howToFor(id);
      for (const text of [...(h?.lines ?? []), h?.focus ?? '', h?.tempo ?? '']) {
        expect(text, `${id}: ${text}`).not.toMatch(banned);
      }
    }
  });

  it('uses the SPEC default tempo for every tracked exercise (matches the demo timing)', () => {
    for (const p of allPlanned.filter((x) => x.tracking === 'pose')) {
      expect(howToFor(p.exerciseId)?.tempo, p.exerciseId).toMatch(
        /^(Lift 1 s · Lower 2 s|Down 2 s · Up 1 s)$/,
      );
    }
  });

  it('returns undefined for an unknown id', () => {
    expect(howToFor('Nope')).toBeUndefined();
  });
});
