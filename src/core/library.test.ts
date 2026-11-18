import { describe, expect, it } from 'vitest';
import bodyAreasJson from '../data/bodyAreas.json';
import exercisesJson from '../data/exercises.json';
import programJson from '../data/program.json';
import {
  EQUIPMENT_GROUPS,
  LIBRARY_AREA_ORDER,
  equipmentGroupOf,
  groupExercises,
  movementGroupOf,
  type LibraryCtx,
} from './library';
import type { BodyArea, Exercise, Program } from './types';

// Made-up catalog (not the vendored one): a few areas, every equipment kind, every movement.
const ex = (
  id: string,
  name: string,
  primary: string[],
  equipment: string | null,
  force: string | null = 'push',
  mechanic: string | null = 'compound',
  secondary: string[] = [],
): Exercise => ({
  id,
  name,
  force,
  level: 'beginner',
  mechanic,
  equipment,
  category: 'strength',
  primaryMuscles: primary,
  secondaryMuscles: secondary,
  instructions: [],
});

const CATALOG: Exercise[] = [
  ex('bench', 'Bench Press', ['chest'], 'barbell', 'push', 'compound', ['triceps']),
  ex('fly', 'Cable Fly', ['chest'], 'cable', 'push', 'isolation'),
  ex('curl', 'Curl', ['biceps'], 'dumbbell', 'pull', 'isolation'),
  ex('ezcurl', 'EZ Curl', ['biceps'], 'e-z curl bar', 'pull', 'isolation'),
  ex('pushdown', 'Pushdown', ['triceps'], 'cable', 'push', 'isolation'),
  ex('crunch', 'Crunch', ['abdominals'], 'body only', 'pull', 'isolation'),
  ex('plankish', 'Hold Thing', ['abdominals'], null, 'static', 'compound'),
  ex('squat', 'Squat', ['quadriceps'], 'kettlebells', 'push', 'compound'),
  ex('legpress', 'Leg Press', ['quadriceps'], 'machine', 'push', 'compound'),
  ex('curlleg', 'Leg Curl', ['hamstrings'], 'machine', 'pull', 'isolation'),
  ex('band', 'Band Pull', ['shoulders'], 'bands', null, null),
  ex('mystery', 'Mystery Move', ['spleen'], 'dumbbell', 'push', 'compound'),
];

const AREA: Record<string, BodyArea> = {
  chest: 'chest',
  biceps: 'arms',
  triceps: 'arms',
  abdominals: 'core',
  quadriceps: 'legs',
  hamstrings: 'legs',
  shoulders: 'shoulders',
};

const PLAN = [
  { id: 'push', name: 'Push', exercises: [{ exerciseId: 'pushdown' }, { exerciseId: 'bench' }] },
  { id: 'legs', name: 'Legs', exercises: [{ exerciseId: 'squat' }, { exerciseId: 'crunch' }] },
  {
    id: 'upper',
    name: 'Upper',
    exercises: [{ exerciseId: 'bench' }, { exerciseId: 'curl' }, { exerciseId: 'bench' }],
  },
  { id: 'empty', name: 'Rest-ish', exercises: [{ exerciseId: 'not-in-catalog' }] },
];

const CTX: LibraryCtx = {
  planDays: PLAN,
  areaOf: (m) => AREA[m],
  muscleLabel: (m) => m.charAt(0).toUpperCase() + m.slice(1),
};

const flatIds = (groups: { ids: string[] }[]): string[] => groups.flatMap((g) => g.ids);

describe('LIBRARY_AREA_ORDER', () => {
  it('is the body-area order of bodyAreas.json', () => {
    expect(LIBRARY_AREA_ORDER).toEqual(Object.keys(bodyAreasJson.areas));
  });
});

describe('equipmentGroupOf', () => {
  it('folds free-exercise-db equipment into the six groups, else Other', () => {
    expect(equipmentGroupOf('dumbbell')).toBe('dumbbell');
    expect(equipmentGroupOf('barbell')).toBe('barbell');
    expect(equipmentGroupOf('e-z curl bar')).toBe('barbell');
    expect(equipmentGroupOf('cable')).toBe('cable');
    expect(equipmentGroupOf('machine')).toBe('machine');
    expect(equipmentGroupOf('kettlebells')).toBe('kettlebell');
    expect(equipmentGroupOf('body only')).toBe('body');
    expect(equipmentGroupOf('bands')).toBe('other');
    expect(equipmentGroupOf(null)).toBe('other');
  });

  it('has the fixed order and labels', () => {
    expect(EQUIPMENT_GROUPS.map((g) => g.label)).toEqual([
      'Dumbbell',
      'Barbell',
      'Cable',
      'Machine',
      'Kettlebell',
      'Body only',
      'Other',
    ]);
  });
});

describe('movementGroupOf', () => {
  it('is force × mechanic, static = hold, missing = other', () => {
    expect(movementGroupOf({ force: 'push', mechanic: 'compound' })).toBe('push-compound');
    expect(movementGroupOf({ force: 'pull', mechanic: 'isolation' })).toBe('pull-isolation');
    expect(movementGroupOf({ force: 'static', mechanic: 'compound' })).toBe('hold-compound');
    expect(movementGroupOf({ force: null, mechanic: null })).toBe('other');
    expect(movementGroupOf({ force: 'push', mechanic: null })).toBe('other');
  });
});

describe('groupExercises: muscle', () => {
  it('orders by body area, then muscle; unknown muscles go to Other last', () => {
    const groups = groupExercises(CATALOG, 'muscle', CTX);
    expect(groups.map((g) => g.key)).toEqual([
      'muscle:biceps',
      'muscle:triceps',
      'muscle:shoulders',
      'muscle:chest',
      'muscle:quadriceps',
      'muscle:hamstrings',
      'muscle:abdominals',
      'muscle:other',
    ]);
    expect(groups.map((g) => g.area)).toEqual([
      'arms',
      'arms',
      'shoulders',
      'chest',
      'legs',
      'legs',
      'core',
      undefined,
    ]);
    expect(groups[0]).toEqual({
      key: 'muscle:biceps',
      label: 'Biceps',
      area: 'arms',
      ids: ['curl', 'ezcurl'],
    });
    expect(groups.at(-1)).toEqual({ key: 'muscle:other', label: 'Other', ids: ['mystery'] });
  });

  it('puts each exercise once, under its main (first primary) muscle, A–Z inside', () => {
    const groups = groupExercises(CATALOG, 'muscle', CTX);
    expect(flatIds(groups).sort()).toEqual(CATALOG.map((e) => e.id).sort());
    expect(groups.find((g) => g.key === 'muscle:chest')?.ids).toEqual(['bench', 'fly']);
    expect(groups.find((g) => g.key === 'muscle:abdominals')?.ids).toEqual(['crunch', 'plankish']);
  });

  it('lists exercises you have done first inside a group', () => {
    const groups = groupExercises(CATALOG, 'muscle', { ...CTX, doneIds: new Set(['fly']) });
    expect(groups.find((g) => g.key === 'muscle:chest')?.ids).toEqual(['fly', 'bench']);
  });
});

describe('groupExercises: equipment', () => {
  it('uses the fixed order and drops empty groups', () => {
    const groups = groupExercises(CATALOG, 'equipment', CTX);
    expect(groups.map((g) => [g.key, g.label, g.ids])).toEqual([
      ['equipment:dumbbell', 'Dumbbell', ['curl', 'mystery']],
      ['equipment:barbell', 'Barbell', ['bench', 'ezcurl']],
      ['equipment:cable', 'Cable', ['fly', 'pushdown']],
      ['equipment:machine', 'Machine', ['curlleg', 'legpress']],
      ['equipment:kettlebell', 'Kettlebell', ['squat']],
      ['equipment:body', 'Body only', ['crunch']],
      ['equipment:other', 'Other', ['band', 'plankish']],
    ]);
  });
});

describe('groupExercises: day', () => {
  it('follows the rotation, lists a multi-day exercise under every day, "Not in your plan" last', () => {
    const groups = groupExercises(CATALOG, 'day', CTX);
    expect(groups.map((g) => [g.key, g.label, g.ids])).toEqual([
      ['day:push', 'Push', ['pushdown', 'bench']],
      ['day:legs', 'Legs', ['squat', 'crunch']],
      // Plan order inside a day; a repeated row is listed once; unknown ids are skipped.
      ['day:upper', 'Upper', ['bench', 'curl']],
      [
        'day:none',
        'Not in your plan',
        ['band', 'fly', 'ezcurl', 'plankish', 'curlleg', 'legpress', 'mystery'],
      ],
    ]);
  });

  it('drops a day whose exercises are all filtered out, and an empty "Not in your plan"', () => {
    const inPlan = new Set(['pushdown', 'bench', 'squat', 'crunch', 'curl']);
    const groups = groupExercises(
      CATALOG.filter((e) => inPlan.has(e.id)),
      'day',
      CTX,
    );
    expect(groups.map((g) => g.key)).toEqual(['day:push', 'day:legs', 'day:upper']);
  });
});

describe('groupExercises: movement', () => {
  it('Push / Pull / Hold × compound / isolation, then Other', () => {
    const groups = groupExercises(CATALOG, 'movement', CTX);
    expect(groups.map((g) => [g.key, g.label, g.ids])).toEqual([
      ['movement:push-compound', 'Push · compound', ['bench', 'legpress', 'mystery', 'squat']],
      ['movement:push-isolation', 'Push · isolation', ['fly', 'pushdown']],
      ['movement:pull-isolation', 'Pull · isolation', ['crunch', 'curl', 'ezcurl', 'curlleg']],
      ['movement:hold-compound', 'Hold · compound', ['plankish']],
      ['movement:other', 'Other', ['band']],
    ]);
  });
});

describe('groupExercises: A–Z', () => {
  it('is one group, sorted by name (case-insensitive), done ids not moved', () => {
    const groups = groupExercises(CATALOG, 'az', { ...CTX, doneIds: new Set(['squat']) });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('az');
    expect(groups[0]?.label).toBe('A–Z');
    expect(groups[0]?.ids).toEqual([
      'band',
      'bench',
      'fly',
      'crunch',
      'curl',
      'ezcurl',
      'plankish',
      'curlleg',
      'legpress',
      'mystery',
      'pushdown',
      'squat',
    ]);
  });
});

describe('groupExercises: My gym only', () => {
  const canDo = (id: string): boolean => !['legpress', 'curlleg', 'bench'].includes(id);

  it('filters with canDo when My gym only is on; empty groups vanish', () => {
    const groups = groupExercises(CATALOG, 'equipment', { ...CTX, canDo, myGymOnly: true });
    expect(groups.map((g) => g.key)).not.toContain('equipment:machine');
    expect(groups.find((g) => g.key === 'equipment:barbell')?.ids).toEqual(['ezcurl']);
    const day = groupExercises(CATALOG, 'day', { ...CTX, canDo, myGymOnly: true });
    expect(day.find((g) => g.key === 'day:upper')?.ids).toEqual(['curl']);
  });

  it('keeps everything when the switch is off (canDo alone does not filter)', () => {
    const groups = groupExercises(CATALOG, 'az', { ...CTX, canDo, myGymOnly: false });
    expect(groups[0]?.ids).toHaveLength(CATALOG.length);
  });
});

describe('groupExercises: the real catalog', () => {
  const catalog = exercisesJson as Exercise[];
  const program = programJson as Program;
  const areaOf = (m: string): BodyArea | undefined =>
    (Object.entries(bodyAreasJson.areas) as [BodyArea, { muscles: string[] }][]).find(([, a]) =>
      a.muscles.includes(m),
    )?.[0];
  const ctx: LibraryCtx = { planDays: program.days, areaOf, muscleLabel: (m) => m };

  it('lists every exercise exactly once in the single-placement groupings', () => {
    const all = catalog.map((e) => e.id).sort();
    for (const by of ['muscle', 'equipment', 'movement', 'az'] as const) {
      const ids = flatIds(groupExercises(catalog, by, ctx));
      expect(ids.sort(), by).toEqual(all);
    }
  });

  it('has a group per program day in rotation order, then "Not in your plan"', () => {
    const groups = groupExercises(catalog, 'day', ctx);
    expect(groups.map((g) => g.label)).toEqual([
      ...program.days.map((d) => d.name),
      'Not in your plan',
    ]);
    // Lying Leg Curls sits on both leg days.
    const legDays = groups.filter((g) => g.ids.includes('Lying_Leg_Curls')).map((g) => g.label);
    expect(legDays).toEqual(['Legs A', 'Legs B']);
  });

  it('is deterministic', () => {
    const a = groupExercises(catalog, 'muscle', ctx);
    const b = groupExercises([...catalog].reverse(), 'muscle', ctx);
    expect(b).toEqual(a);
  });
});
