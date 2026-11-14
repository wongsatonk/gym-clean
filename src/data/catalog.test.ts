import { describe, expect, it } from 'vitest';
import howtoJson from './howto.json';
import cuesJson from './cues.json';
import bodyAreasJson from './bodyAreas.json';
import equipmentJson from './equipment.json';
import type { BodyArea } from '../core/types';
import { MUSCLES, bodyMapSvg } from '../ui/bodyMap';
import {
  areaForWord,
  bodyAreaOf,
  catalogExercises,
  cueFor,
  exerciseById,
  gymHas,
  howToFor,
  musclesIn,
  program,
  programDay,
} from './catalog';

const allPlanned = program.days.flatMap((d) => d.exercises);
// Tracked exercises: the demo timing pins eccentric 2 s / concentric 1 s. The only extra allowed
// is a 1 s squeeze between lift and lower (concentration curl).
const TRACKED_TEMPO = /^(Lift 1 s · (Hold 1 s · )?Lower 2 s|Down 2 s · Up 1 s)$/;

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

// Coaching language only (CLAUDE.md "No medical claims"); same spirit as the hint denylist, plus
// the SPEC M10 diagnosis terms.
const banned =
  /\b(pain\w*|injur\w*|hurt\w*|damag\w*|safe\w*|risk\w*|medical\w*|doctor\w*|diagnos\w*|therap\w*|rehab\w*|heal\w*|strain\w*|sprain\w*|tear\w*|tendin\w*|tendon\w*|inflam\w*|cure\w*|prevent\w*)\b/i;

describe('how-to text (M4b)', () => {
  // M10: the how-to text covers the whole catalog (program + swap pool).
  const ids = catalogExercises().map((e) => e.id);

  it('covers every catalog exercise (the 30 program ones included) and nothing else', () => {
    const programIds = new Set(allPlanned.map((p) => p.exerciseId));
    expect(programIds.size).toBe(30);
    for (const id of programIds) expect(ids, id).toContain(id);
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
    // Lift 1 s / Lower 2 s (or Down 2 s / Up 1 s) is what the demo timing pins. The only extra
    // allowed is a 1 s squeeze between lift and lower ("Hold 1 s", concentration curl): it adds a
    // pause at the top but leaves eccentric 2 s / concentric 1 s unchanged.
    for (const p of allPlanned.filter((x) => x.tracking === 'pose')) {
      expect(howToFor(p.exerciseId)?.tempo, p.exerciseId).toMatch(TRACKED_TEMPO);
    }
  });

  it('the tracked tempo check accepts a top hold and nothing looser', () => {
    expect('Lift 1 s · Hold 1 s · Lower 2 s').toMatch(TRACKED_TEMPO);
    for (const bad of [
      'Lift 1 s · Hold 2 s · Lower 2 s',
      'Lift 1 s · Lower 3 s',
      'Down 2 s · Hold 1 s · Up 1 s',
      'Lift 1 s · Hold 1 s · Hold 1 s · Lower 2 s',
      'Hold 1 s · Lift 1 s · Lower 2 s',
    ])
      expect(bad).not.toMatch(TRACKED_TEMPO);
    expect(howToFor('Concentration_Curls')?.tempo).toBe('Lift 1 s · Hold 1 s · Lower 2 s');
  });

  it('returns undefined for an unknown id', () => {
    expect(howToFor('Nope')).toBeUndefined();
  });
});

const ALL_AREAS: BodyArea[] = ['arms', 'shoulders', 'chest', 'back', 'legs', 'core'];

describe('catalog (M10 swap pool)', () => {
  const catalog = catalogExercises();
  const programIds = [...new Set(allPlanned.map((p) => p.exerciseId))];

  it('lists the program exercises plus a 20-30 exercise swap pool, ids unique', () => {
    const ids = catalog.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of programIds) expect(ids, id).toContain(id);
    const pool = ids.filter((id) => !programIds.includes(id));
    expect(pool.length).toBeGreaterThanOrEqual(20);
    expect(pool.length).toBeLessThanOrEqual(30);
  });

  it('keeps the vendored free-exercise-db shape (strength only)', () => {
    for (const e of catalog) {
      expect(Object.keys(e), e.id).toEqual([
        'id',
        'name',
        'force',
        'level',
        'mechanic',
        'equipment',
        'category',
        'primaryMuscles',
        'secondaryMuscles',
        'instructions',
      ]);
      expect(e.category, e.id).toBe('strength');
      expect(e.instructions.length, e.id).toBeGreaterThan(0);
      expect(exerciseById(e.id), e.id).toBe(e);
    }
  });

  it('every catalog exercise has muscles, a cue of at most 8 words and 2-3 how-to lines', () => {
    expect(Object.keys(cuesJson).sort()).toEqual(catalog.map((e) => e.id).sort());
    for (const e of catalog) {
      expect(e.primaryMuscles.length, e.id).toBeGreaterThan(0);
      const cue = cueFor(e.id);
      expect(cue, e.id).toBeTruthy();
      expect(cue.trim(), e.id).toBe(cue);
      expect(cue.split(/\s+/).length, cue).toBeLessThanOrEqual(8);
      expect(cue, e.id).not.toMatch(banned);
      const h = howToFor(e.id);
      expect(h?.lines.length ?? 0, e.id).toBeGreaterThanOrEqual(2);
      expect(h?.lines.length ?? 0, e.id).toBeLessThanOrEqual(3);
    }
  });

  it('every muscle maps to exactly one body area and to an SVG path', () => {
    const svgMuscles = new Set(
      (['front', 'back'] as const).flatMap((view) =>
        [
          ...bodyMapSvg({ view, primary: [], secondary: [] }).matchAll(/data-muscle="([^"]+)"/g),
        ].map((m) => m[1]),
      ),
    );
    const listed = Object.values(bodyAreasJson.areas).flatMap((a) => a.muscles);
    expect([...listed].sort()).toEqual([...MUSCLES].sort());
    expect(new Set(listed).size).toBe(listed.length);
    for (const m of MUSCLES) expect(bodyAreaOf(m), m).toBeDefined();
    for (const e of catalog) {
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) {
        expect(bodyAreaOf(m), `${e.id}: ${m}`).toBeDefined();
        expect(svgMuscles.has(m), `${e.id}: ${m}`).toBe(true);
      }
    }
  });

  it('has exactly the six SPEC body areas, each with a label and muscles', () => {
    expect(Object.keys(bodyAreasJson.areas).sort()).toEqual([...ALL_AREAS].sort());
    for (const area of ALL_AREAS) {
      expect(bodyAreasJson.areas[area].label, area).toBeTruthy();
      expect(musclesIn(area).length, area).toBeGreaterThan(0);
      for (const m of musclesIn(area)) expect(bodyAreaOf(m)).toBe(area);
    }
    expect(bodyAreaOf('biceps')).toBe('arms');
    expect(bodyAreaOf('lats')).toBe('back');
    expect(bodyAreaOf('quadriceps')).toBe('legs');
    expect(bodyAreaOf('abdominals')).toBe('core');
    expect(bodyAreaOf('nope')).toBeUndefined();
  });

  it('maps joint and body words (English and Thai) to an area', () => {
    for (const [word, area] of Object.entries(bodyAreasJson.words)) {
      expect(word, word).toBe(word.trim().toLowerCase());
      expect(ALL_AREAS, word).toContain(area);
      expect(areaForWord(word), word).toBe(area);
    }
    expect(areaForWord('Elbow')).toBe('arms');
    expect(areaForWord(' wrists ')).toBe('arms');
    expect(areaForWord('knee')).toBe('legs');
    expect(areaForWord('shoulder')).toBe('shoulders');
    expect(areaForWord('lower back')).toBe('back');
    expect(areaForWord('แขน')).toBe('arms');
    expect(areaForWord('เข่า')).toBe('legs');
    expect(areaForWord('ไหล่')).toBe('shoulders');
    expect(areaForWord('banana')).toBeUndefined();
    // Every area can be named in words.
    for (const area of ALL_AREAS) expect(Object.values(bodyAreasJson.words), area).toContain(area);
  });

  it('every equipment value in the catalog is on the gym equipment list', () => {
    const { available, substitutes } = equipmentJson as {
      available: string[];
      substitutes: Record<string, string>;
    };
    for (const to of Object.values(substitutes)) expect(available).toContain(to);
    for (const e of catalog) {
      expect(e.equipment, e.id).not.toBeNull();
      expect(gymHas(e.equipment), `${e.id}: ${e.equipment}`).toBe(true);
    }
    expect(gymHas('barbell')).toBe(false);
    expect(gymHas(null)).toBe(false);
  });

  it('every program exercise has at least one swap candidate (same primary muscle, kit he has, not in the day)', () => {
    for (const day of program.days) {
      const inDay = new Set(day.exercises.map((p) => p.exerciseId));
      for (const p of day.exercises) {
        const ex = exerciseById(p.exerciseId);
        const primary = ex?.primaryMuscles[0];
        const candidates = catalog.filter(
          (c) => !inDay.has(c.id) && c.primaryMuscles[0] === primary && gymHas(c.equipment),
        );
        expect(candidates.length, `${day.id}: ${p.exerciseId}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
