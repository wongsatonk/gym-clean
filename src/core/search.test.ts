import { describe, expect, it } from 'vitest';
import bodyAreasJson from '../data/bodyAreas.json';
import exercisesJson from '../data/exercises.json';
import programJson from '../data/program.json';
import {
  SEARCH_SCORE,
  SEARCH_SYNONYMS,
  buildSearchIndex,
  exerciseSearchItems,
  foodSearchHit,
  learnSearchItems,
  normalizeSearchText,
  search,
  type ExerciseSearchCtx,
  type SearchEntry,
} from './search';
import type { BodyArea, Exercise, Program, SearchItem } from './types';

// ---- made-up data (never the real user's) ----

const ex = (
  id: string,
  name: string,
  primary: string[],
  equipment: string | null,
  secondary: string[] = [],
): Exercise => ({
  id,
  name,
  force: 'pull',
  level: 'beginner',
  mechanic: 'isolation',
  equipment,
  category: 'strength',
  primaryMuscles: primary,
  secondaryMuscles: secondary,
  instructions: [],
});

/** A made-up catalog with abdominals entries (the vendored abs land in task 2). */
const CATALOG: Exercise[] = [
  ex('crunch', 'Crunches', ['abdominals'], 'body only'),
  ex('rev', 'Reverse Crunch', ['abdominals'], 'body only'),
  ex('cablecrunch', 'Cable Crunch', ['abdominals'], 'cable'),
  ex('sidebend', 'Dumbbell Side Bend', ['abdominals'], 'dumbbell', ['lower back']),
  ex('twist', 'Russian Twist', ['abdominals'], 'body only'),
  ex('deadlift', 'Stiff-Legged Deadlift', ['hamstrings'], 'dumbbell', ['abdominals', 'glutes']),
  ex('bench', 'Dumbbell Bench Press', ['chest'], 'dumbbell', ['triceps']),
  ex('crossover', 'Cable Crossover', ['chest'], 'cable'),
  ex('pulldown', 'Wide-Grip Lat Pulldown', ['lats'], 'cable', ['biceps']),
  ex('lateral', 'Side Lateral Raise', ['shoulders'], 'dumbbell'),
  ex('shrug', 'Dumbbell Shrug', ['traps'], 'dumbbell'),
  ex('squat', 'Goblet Squat', ['quadriceps'], 'kettlebells', ['glutes']),
  ex('bridge', 'Single Leg Glute Bridge', ['glutes'], 'body only'),
  ex('legpress', 'Leg Press', ['quadriceps'], 'machine'),
  ex('pushdown', 'Triceps Pushdown', ['triceps'], 'cable'),
  ex('pushups', 'Pushups', ['chest'], 'body only', ['triceps']),
];

const AREA_OF: Record<string, BodyArea> = {};
for (const [area, a] of Object.entries(bodyAreasJson.areas)) {
  for (const m of a.muscles) AREA_OF[m] = area as BodyArea;
}
const LABEL: Record<BodyArea, string> = Object.fromEntries(
  Object.entries(bodyAreasJson.areas).map(([k, a]) => [k, a.label]),
) as Record<BodyArea, string>;

const PLAN = [
  {
    id: 'push-a',
    name: 'Push A',
    exercises: [{ exerciseId: 'bench' }, { exerciseId: 'pushdown' }],
  },
  {
    id: 'push-b',
    name: 'Push B',
    exercises: [{ exerciseId: 'crossover' }, { exerciseId: 'pushups' }],
  },
  {
    id: 'legs-a',
    name: 'Legs A',
    exercises: [{ exerciseId: 'squat' }, { exerciseId: 'legpress' }],
  },
];

const CTX: ExerciseSearchCtx = {
  planDays: PLAN,
  areaOf: (m) => AREA_OF[m],
  areaLabel: (a) => LABEL[a],
  muscleLabel: (m) => m.charAt(0).toUpperCase() + m.slice(1),
};

const SETTINGS: SearchItem[] = [
  {
    kind: 'setting',
    id: 'voice',
    title: 'Voice',
    keywords: ['speaker', 'rudeness', 'drill sergeant'],
  },
  { kind: 'setting', id: 'units', title: 'Units', keywords: ['kg', 'lb', 'pounds'] },
  { kind: 'setting', id: 'about', title: 'About', keywords: ['privacy', 'licenses'] },
];

const LEARN = learnSearchItems([
  {
    id: 'warmups',
    title: 'Why warm-up sets',
    body: 'A couple of lighter sets before your first heavy lift get you used to the movement.',
  },
  { id: 'protein', title: 'Protein across the day', body: 'Your body builds muscle from protein.' },
]);

const exerciseIndex = () => buildSearchIndex(exerciseSearchItems(CATALOG, CTX));
const ids = (hits: { id: string }[]): string[] => hits.map((h) => h.id);
const ABS = ['cablecrunch', 'crunch', 'sidebend', 'rev', 'twist'];

describe('normalizeSearchText', () => {
  it('lowercases, strips Latin accents, turns punctuation into spaces, drops apostrophes', () => {
    expect(normalizeSearchText('  Crème BRÛLÉE  ')).toBe('creme brulee');
    expect(normalizeSearchText('Stiff-Legged   Deadlift')).toBe('stiff legged deadlift');
    expect(normalizeSearchText("Farmer's walk")).toBe('farmers walk');
    expect(normalizeSearchText('Six-Pack!')).toBe('six pack');
  });

  it('keeps Thai text whole (vowel and tone marks are not accents)', () => {
    expect(normalizeSearchText('หน้าท้อง')).toBe('หน้าท้อง');
    expect(normalizeSearchText(' ท้อง ')).toBe('ท้อง');
  });
});

describe('search: basics', () => {
  it('an empty or blank query finds nothing', () => {
    const index = exerciseIndex();
    expect(search(index, '')).toEqual([]);
    expect(search(index, '   ')).toEqual([]);
    expect(search(index, '-!')).toEqual([]);
  });

  it('one letter matches only titles that start with it', () => {
    const index = buildSearchIndex([...exerciseSearchItems(CATALOG, CTX), ...SETTINGS]);
    const hits = search(index, 'c');
    expect(ids(hits)).toEqual(['crossover', 'cablecrunch', 'crunch']);
    expect(hits.every((h) => h.score === SEARCH_SCORE.titlePrefix)).toBe(true);
    // "v" is Voice's first letter; "speaker" etc. are never searched with one letter.
    expect(ids(search(index, 'V'))).toEqual(['voice']);
    expect(search(index, 's').map((h) => h.id)).not.toContain('voice');
  });

  it('is case- and accent-insensitive', () => {
    const index = buildSearchIndex([
      { kind: 'learn', id: 'x', title: 'Crème brûlée', keywords: [] },
    ]);
    expect(ids(search(index, 'CREME'))).toEqual(['x']);
    expect(ids(search(index, 'brûl'))).toEqual(['x']);
  });

  it('matches token prefixes, not the middle of a word', () => {
    const index = exerciseIndex();
    expect(ids(search(index, 'press'))).toEqual(['bench', 'legpress']);
    expect(ids(search(index, 'ress'))).toEqual([]);
  });

  it('needs every word of the query, across title and keywords', () => {
    const index = exerciseIndex();
    // "dumbbell" + "chest": only the bench press has both.
    expect(ids(search(index, 'dumbbell chest'))).toEqual(['bench']);
    expect(ids(search(index, 'cable chest'))).toEqual(['crossover']);
  });

  it('respects limit', () => {
    expect(search(exerciseIndex(), 'dumbbell', { limit: 2 })).toHaveLength(2);
  });

  it('is deterministic whatever the input order', () => {
    const items = exerciseSearchItems(CATALOG, CTX);
    const a = search(buildSearchIndex(items), 'cable');
    const b = search(buildSearchIndex([...items].reverse()), 'cable');
    expect(b).toEqual(a);
  });
});

describe('search: ranking', () => {
  const items: SearchEntry[] = [
    { kind: 'learn', id: 'other', title: 'Zeta', keywords: [], otherKeywords: ['rows'] },
    { kind: 'learn', id: 'keyword', title: 'Yak', keywords: ['rows'] },
    { kind: 'learn', id: 'word', title: 'Seated Rows', keywords: [] },
    { kind: 'learn', id: 'prefix', title: 'Rows Done Right', keywords: [] },
    { kind: 'learn', id: 'exact', title: 'Rows', keywords: [] },
  ];

  it('exact title > title prefix > title word > keyword > other keyword', () => {
    const hits = search(buildSearchIndex(items), 'rows');
    expect(ids(hits)).toEqual(['exact', 'prefix', 'word', 'keyword', 'other']);
    expect(hits.map((h) => h.score)).toEqual([
      SEARCH_SCORE.exactTitle,
      SEARCH_SCORE.titlePrefix,
      SEARCH_SCORE.titleWord,
      SEARCH_SCORE.keyword,
      SEARCH_SCORE.otherKeyword,
    ]);
  });

  it('a hit carries the item as given plus its score', () => {
    const [hit] = search(buildSearchIndex(items), 'rows');
    expect(hit).toEqual({
      kind: 'learn',
      id: 'exact',
      title: 'Rows',
      keywords: [],
      score: SEARCH_SCORE.exactTitle,
    });
  });

  it('done exercises first on ties, then title', () => {
    const index = exerciseIndex();
    // Two title-prefix ties, then two equipment-keyword ties; each tie by title.
    expect(ids(search(index, 'cable'))).toEqual([
      'crossover',
      'cablecrunch',
      'pushdown',
      'pulldown',
    ]);
    expect(ids(search(index, 'cable', { doneIds: new Set(['pulldown', 'crossover']) }))).toEqual([
      'crossover',
      'cablecrunch',
      'pulldown',
      'pushdown',
    ]);
  });

  it('done ids only reorder exercises', () => {
    const index = buildSearchIndex([
      { kind: 'setting', id: 'b', title: 'Beta', keywords: ['tag'] },
      { kind: 'setting', id: 'a', title: 'Alpha', keywords: ['tag'] },
    ]);
    expect(ids(search(index, 'tag', { doneIds: new Set(['b']) }))).toEqual(['a', 'b']);
  });
});

describe('search: synonyms and body words (made-up catalog with abs)', () => {
  const index = exerciseIndex();

  for (const q of [
    'abs',
    'Abs',
    'six pack',
    'sixpack',
    'six-pack',
    'core',
    'abdominals',
    'stomach',
  ]) {
    it(`"${q}" lists abdominals-primary exercises first`, () => {
      const hits = ids(search(index, q));
      expect(hits.slice(0, ABS.length)).toEqual(ABS);
      // An exercise that only works abs as a helper comes after them.
      expect(hits).toContain('deadlift');
      expect(hits.indexOf('deadlift')).toBe(ABS.length);
    });
  }

  for (const q of ['ท้อง', 'หน้าท้อง', 'เอว']) {
    it(`Thai "${q}" finds the abs through the body-area words`, () => {
      expect(ids(search(index, q)).slice(0, ABS.length)).toEqual(ABS);
    });
  }

  it('quads, lats, traps, glutes', () => {
    expect(ids(search(index, 'quads'))).toEqual(['squat', 'legpress']);
    expect(ids(search(index, 'lats'))).toEqual(['pulldown']);
    expect(ids(search(index, 'traps'))).toEqual(['shrug']);
    // Title word first, then glutes-primary, then glutes as a helper.
    expect(ids(search(index, 'glutes'))).toEqual(['bridge', 'squat', 'deadlift']);
  });

  it('"lats" does not pull in "Lateral" by prefix', () => {
    expect(ids(search(index, 'lats'))).not.toContain('lateral');
  });

  it('"machine" finds machine exercises', () => {
    expect(ids(search(index, 'machine'))).toEqual(['legpress']);
    expect(ids(search(index, 'machines'))).toEqual(['legpress']);
  });

  it('a body-area word finds the area (Thai ขา → legs)', () => {
    const hits = ids(search(index, 'ขา'));
    expect(hits.slice(0, 4).sort()).toEqual(['bridge', 'deadlift', 'legpress', 'squat']);
  });

  it('the synonyms table is data: lowercase keys, non-empty targets', () => {
    for (const [k, v] of Object.entries(SEARCH_SYNONYMS)) {
      expect(normalizeSearchText(k)).toBe(k);
      expect(v.length).toBeGreaterThan(0);
    }
    expect(SEARCH_SYNONYMS.abs).toContain('abdominals');
    expect(SEARCH_SYNONYMS['six pack']).toContain('abdominals');
    expect(SEARCH_SYNONYMS.core).toContain('abdominals');
    expect(SEARCH_SYNONYMS.quads).toContain('quadriceps');
  });
});

describe('search: plan days', () => {
  it('"push a" lists that day first', () => {
    const hits = ids(search(exerciseIndex(), 'push a'));
    expect(hits.slice(0, 2)).toEqual(['bench', 'pushdown']);
    expect(hits).not.toContain('crossover');
  });

  it('"push" finds both push days, titles first', () => {
    const hits = ids(search(exerciseIndex(), 'push'));
    expect(hits.slice(0, 2)).toEqual(['pushups', 'pushdown']);
    expect(hits).toContain('crossover');
    expect(hits).toContain('bench');
  });
});

describe('search: settings, learn cards and other kinds', () => {
  const index = buildSearchIndex([...exerciseSearchItems(CATALOG, CTX), ...SETTINGS, ...LEARN]);

  it('"voice" → the Voice setting first; a keyword finds it too', () => {
    expect(search(index, 'voice')[0]).toMatchObject({ kind: 'setting', id: 'voice' });
    expect(search(index, 'speak')[0]).toMatchObject({ kind: 'setting', id: 'voice' });
    expect(search(index, 'drill serg')[0]).toMatchObject({ kind: 'setting', id: 'voice' });
  });

  it('a learn card by its title and by a word of its text', () => {
    expect(search(index, 'warm up')[0]).toMatchObject({ kind: 'learn', id: 'warmups' });
    expect(search(index, 'warm')[0]).toMatchObject({ kind: 'learn', id: 'warmups' });
    const heavy = search(index, 'heavy');
    expect(heavy).toHaveLength(1);
    expect(heavy[0]).toMatchObject({
      kind: 'learn',
      id: 'warmups',
      score: SEARCH_SCORE.otherKeyword,
    });
  });

  it('learn items skip short words', () => {
    const [warm] = LEARN;
    expect(warm?.otherKeywords).not.toContain('a');
    expect(warm?.otherKeywords).toContain('movement');
  });

  it('takes workout / chat / meal items as they are (task 3b plugs in)', () => {
    const personal = buildSearchIndex([
      {
        kind: 'workout',
        id: 's1',
        title: 'Push A · Tue 12 Nov',
        keywords: ['Push A', 'Dumbbell Bench Press'],
        date: '2026-11-12',
      },
      { kind: 'chat', id: 'm1', title: 'วันนี้ปวดขานิดหน่อย', keywords: [], date: '2026-11-13' },
      {
        kind: 'meal',
        id: 'd1',
        title: 'Meals · Fri 13 Nov',
        keywords: ['Jasmine rice'],
        date: '2026-11-13',
      },
    ]);
    expect(search(personal, 'bench')[0]).toMatchObject({
      kind: 'workout',
      id: 's1',
      date: '2026-11-12',
    });
    expect(search(personal, 'rice')[0]).toMatchObject({ kind: 'meal', id: 'd1' });
    // Thai has no spaces: a Thai word is found inside a longer Thai run.
    expect(search(personal, 'ปวดขา')[0]).toMatchObject({ kind: 'chat', id: 'm1' });
  });
});

describe('foodSearchHit', () => {
  it('is the "Search foods for …" row with the typed text, or null when blank', () => {
    expect(foodSearchHit('  khao man gai ')).toEqual({
      kind: 'food',
      id: 'food',
      title: "Search foods for 'khao man gai'",
      keywords: ['khao man gai'],
      score: 0,
    });
    expect(foodSearchHit('   ')).toBeNull();
  });
});

describe('exerciseSearchItems', () => {
  it('title, subtitle, muscles, area, equipment and plan days as keywords', () => {
    const items = exerciseSearchItems(CATALOG, CTX);
    expect(items.find((i) => i.id === 'bench')).toEqual({
      kind: 'exercise',
      id: 'bench',
      title: 'Dumbbell Bench Press',
      subtitle: 'Chest · Dumbbell',
      keywords: ['chest', 'Dumbbell', 'Push A'],
      otherKeywords: ['triceps', 'Arms'],
    });
    const deadlift = items.find((i) => i.id === 'deadlift');
    expect(deadlift?.keywords).not.toContain('abdominals');
    expect(deadlift?.otherKeywords).toContain('abdominals');
  });
});

describe('search: the real catalog (no abs needed)', () => {
  const catalog = exercisesJson as Exercise[];
  const program = programJson as Program;
  const ctx: ExerciseSearchCtx = { ...CTX, planDays: program.days };
  const index = buildSearchIndex(exerciseSearchItems(catalog, ctx));

  it('"push a" lists the Push A exercises first', () => {
    const pushA =
      program.days.find((d) => d.id === 'push-a')?.exercises.map((e) => e.exerciseId) ?? [];
    const hits = ids(search(index, 'push a', { limit: 100 }));
    expect(new Set(hits.slice(0, pushA.length))).toEqual(new Set(pushA));
  });

  it('"cable" finds every cable exercise, the ones named Cable first', () => {
    const cable = catalog.filter((e) => e.equipment === 'cable').map((e) => e.id);
    const hits = search(index, 'cable', { limit: 100 });
    expect(new Set(ids(hits))).toEqual(new Set(cable));
    const named = hits.filter((h) => /^cable/i.test(h.title));
    expect(ids(hits.slice(0, named.length))).toEqual(ids(named));
  });

  it('"quads" and Thai "ขา" find quadriceps work', () => {
    const quads = catalog.filter((e) => e.primaryMuscles[0] === 'quadriceps').map((e) => e.id);
    expect(new Set(ids(search(index, 'quads', { limit: 100 })).slice(0, quads.length))).toEqual(
      new Set(quads),
    );
    expect(ids(search(index, 'ขา', { limit: 100 }))).toEqual(expect.arrayContaining(quads));
  });
});
