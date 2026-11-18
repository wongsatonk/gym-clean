import 'fake-indexeddb/auto';
import Dexie, { type DBCore, type DBCoreTable } from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, FoodEntry, SetLog } from '../core/types';
import { GymDb } from './db';
import { PERSONAL_SEARCH_TABLES, personalSearch } from './searchSources';

// ---- made-up data (never the real user's) ----

/** Wednesday 18 Nov 2026, noon. */
const NOW = new Date(2026, 10, 18, 12).getTime();
const at = (date: string, h = 9, min = 0): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, h, min).getTime();
};

/** Tables search must never read (SPEC M13c goal 3; PROGRESS "Personal data for search"). */
const FORBIDDEN = [
  'progressPhotos',
  'measurements',
  'healthDays',
  'checkIns',
  'dayFeels',
  'weighIns',
  'devlogSessions',
  'devlogSets',
  'devlogChunks',
] as const;
const ALLOWED = new Set(['sessions', 'sets', 'chatMessages', 'foodEntries', 'foods', 'recipes']);

type Touch = { table: string; op: string };

/** A GymDb whose every DBCore call (reads, writes, transactions) is recorded by table. */
function spiedDb(name: string): { db: GymDb; log: Touch[] } {
  const db = new GymDb(name);
  const log: Touch[] = [];
  db.use({
    stack: 'dbcore',
    name: 'searchSpy',
    create: (down: DBCore): DBCore => ({
      ...down,
      transaction: (stores, mode, opts) => {
        for (const s of stores) log.push({ table: s, op: `tx-${mode}` });
        return down.transaction(stores, mode, opts);
      },
      table: (tableName): DBCoreTable => {
        const t = down.table(tableName);
        const note = (op: string): void => void log.push({ table: tableName, op });
        return {
          ...t,
          get: (req) => (note('get'), t.get(req)),
          getMany: (req) => (note('getMany'), t.getMany(req)),
          query: (req) => (note('query'), t.query(req)),
          openCursor: (req) => (note('openCursor'), t.openCursor(req)),
          count: (req) => (note('count'), t.count(req)),
          mutate: (req) => (note('mutate'), t.mutate(req)),
        };
      },
    }),
  });
  return { db, log };
}

const set = (sessionId: string, exerciseId: string, startedAt: number): SetLog => ({
  sessionId,
  exerciseId,
  setIndex: 1,
  reps: 8,
  weightKg: 20,
  restTakenSec: 90,
  startedAt,
  endedAt: startedAt + 40_000,
});
const msg = (createdAt: number, role: 'user' | 'coach', text: string): ChatMessage => ({
  createdAt,
  role,
  text,
  source: 'rules',
  phase: 'today',
});
const entry = (
  id: string,
  date: string,
  h: number,
  label: string,
  ref?: FoodEntry['ref'],
): FoodEntry => ({
  id,
  date,
  time: at(date, h),
  slot: 'lunch',
  label,
  amount: { servings: 1 },
  estimate: false,
  kcal: 400,
  proteinG: 25,
  ...(ref !== undefined ? { ref } : {}),
});

async function seed(db: GymDb): Promise<void> {
  await db.sessions.bulkPut([
    {
      sessionId: 's-push',
      dayId: 'push-a',
      startedAt: at('2026-11-17', 18),
      endedAt: at('2026-11-17', 19),
    },
    {
      sessionId: 's-pull',
      dayId: 'pull-a',
      startedAt: at('2026-11-16', 18),
      endedAt: at('2026-11-16', 19),
    },
    { sessionId: 's-open', dayId: 'legs-a', startedAt: at('2026-11-18', 7) },
  ]);
  await db.sets.bulkAdd([
    set('s-push', 'Dumbbell_Bench_Press', at('2026-11-17', 18, 5)),
    set('s-push', 'Incline_Dumbbell_Press', at('2026-11-17', 18, 20)),
    set('s-pull', 'One_Arm_Dumbbell_Row', at('2026-11-16', 18, 5)),
    set('s-open', 'Barbell_Squat', at('2026-11-18', 7, 5)),
  ]);
  await db.chatMessages.bulkAdd([
    msg(at('2026-11-17', 20), 'user', 'My bench felt heavy today'),
    msg(at('2026-11-17', 20, 1), 'coach', 'Keep the same weight next time.'),
    msg(at('2026-09-01', 20), 'user', 'Old bench question from long ago'),
  ]);
  await db.foods.put({
    id: 'f-chicken',
    name: 'Grilled chicken breast',
    nameTh: 'อกไก่ย่าง',
    source: 'custom',
    basis: { per100g: true },
    kcal: 165,
    proteinG: 31,
  });
  await db.recipes.put({
    id: 'r-oats',
    name: 'Protein oats',
    ingredients: [],
    servings: 1,
    updatedAt: at('2026-11-01'),
  });
  await db.foodEntries.bulkPut([
    entry('e1', '2026-11-17', 8, 'Rice'),
    entry('e2', '2026-11-16', 12, 'Chicken', { foodId: 'f-chicken' }),
    entry('e3', '2026-11-16', 7, 'Morning bowl', { recipeId: 'r-oats' }),
    entry('e4', '2026-11-10', 12, 'Fried rice'),
  ]);
  // Rows in every table search must never read, so a stray read would find something.
  await db.progressPhotos.put({
    id: 'p1',
    date: '2026-11-17',
    createdAt: at('2026-11-17'),
  } as never);
  await db.measurements.put({ date: '2026-11-17', site: 'waist', cm: 80 } as never);
  await db.healthDays.put({ date: '2026-11-17' } as never);
  await db.checkIns.put({ weekStart: '2026-11-16' } as never);
  await db.dayFeels.put({ date: '2026-11-17', feel: 'good' } as never);
  await db.weighIns.put({ date: '2026-11-17', kg: 70 });
  await db.devlogSessions.put({
    id: 'd1',
    startedAt: 1,
    appVersion: 'x',
    userAgent: 'x',
    settings: {},
    dayId: 'push-a',
    bytes: 0,
  });
  await db.devlogSets.put({
    key: 'k',
    sessionId: 'd1',
    seq: 1,
    exerciseId: 'x',
    setIndex: 1,
    targetReps: [8, 8],
    weightKg: 0,
    startedAt: 1,
  });
  await db.devlogChunks.add({ sessionId: 'd1', setKey: 'k', bytes: 0 });
}

let n = 0;
let db: GymDb;
let log: Touch[];

beforeEach(async () => {
  ({ db, log } = spiedDb(`search-test-${n++}`));
  await db.open();
  await seed(db);
  log.length = 0;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await Dexie.delete(db.name);
});

const ids = (r: Awaited<ReturnType<typeof personalSearch>>) =>
  Object.fromEntries(r.sections.map((s) => [s.kind, s.hits.map((h) => h.id)]));

describe('personalSearch', () => {
  it('finds workouts by exercise name, named after the plan day', async () => {
    const r = await personalSearch(db, 'bench', { now: NOW });
    const workouts = r.sections.find((s) => s.kind === 'workout');
    expect(workouts?.hits.map((h) => [h.id, h.title, h.date])).toEqual([
      ['s-push', 'Push A · Tue 17 Nov', '2026-11-17'],
    ]);
  });

  it("uses the caller's day names when given", async () => {
    const r = await personalSearch(db, 'my push', {
      now: NOW,
      dayName: (id) => (id === 'push-a' ? 'My Push' : undefined),
    });
    expect(ids(r).workout).toEqual(['s-push']);
  });

  it('finds chat messages by words, only within the kept 30 days', async () => {
    const r = await personalSearch(db, 'bench', { now: NOW });
    const chat = r.sections.find((s) => s.kind === 'chat');
    expect(chat?.hits.map((h) => h.title)).toEqual(['My bench felt heavy today']);
    expect(chat?.hits[0]?.subtitle).toBe('You · Tue 17 Nov');
    expect(Number(chat?.hits[0]?.id)).toBeGreaterThan(0);
  });

  it('a date phrase lists that day across workouts, meals and chat', async () => {
    const r = await personalSearch(db, 'yesterday', { now: NOW });
    expect(r.range).toEqual({ from: '2026-11-17', to: '2026-11-17' });
    expect(r.sections.map((s) => [s.kind, s.hits.length])).toEqual([
      ['workout', 1],
      ['meal', 1],
      ['chat', 2],
    ]);
    expect(ids(r).meal).toEqual(['2026-11-17']);
  });

  it('meals by food name and by date', async () => {
    expect(ids(await personalSearch(db, 'rice', { now: NOW })).meal).toEqual([
      '2026-11-17',
      '2026-11-10',
    ]);
    expect(ids(await personalSearch(db, 'rice last week', { now: NOW })).meal).toEqual([
      '2026-11-10',
    ]);
    expect(ids(await personalSearch(db, 'rice 12 nov', { now: NOW })).meal).toEqual([]);
  });

  it("meals by a saved food's (Thai) name and a recipe's name", async () => {
    expect(ids(await personalSearch(db, 'อกไก่', { now: NOW })).meal).toEqual(['2026-11-16']);
    expect(ids(await personalSearch(db, 'protein oats', { now: NOW })).meal).toEqual([
      '2026-11-16',
    ]);
  });

  it('caps each kind, says when there is more, and pages with offset', async () => {
    await db.chatMessages.bulkAdd(
      Array.from({ length: 12 }, (_, i) => msg(at('2026-11-12', 8, i), 'user', `squat note ${i}`)),
    );
    const first = await personalSearch(db, 'squat', { now: NOW, perKind: 5 });
    expect(first.sections.find((s) => s.kind === 'chat')).toMatchObject({
      total: 12,
      offset: 0,
      more: true,
    });
    expect(first.sections.find((s) => s.kind === 'chat')?.hits.map((h) => h.title)[0]).toBe(
      'squat note 11',
    );
    const last = await personalSearch(db, 'squat', { now: NOW, perKind: 5, offset: { chat: 10 } });
    const chat = last.sections.find((s) => s.kind === 'chat');
    expect(chat).toMatchObject({ total: 12, offset: 10, more: false });
    expect(chat?.hits.map((h) => h.title)).toEqual(['squat note 1', 'squat note 0']);
  });

  it('"Show more" for one kind reads only that kind\'s tables', async () => {
    const r = await personalSearch(db, 'rice', { now: NOW, kinds: ['meal'] });
    expect(r.sections.map((s) => s.kind)).toEqual(['meal']);
    const touched = new Set(log.map((t) => t.table));
    expect(touched.has('sessions')).toBe(false);
    expect(touched.has('sets')).toBe(false);
    expect(touched.has('chatMessages')).toBe(false);
    expect(touched.has('foodEntries')).toBe(true);
  });

  it('without a date, workouts come from the newest 365 days; a date reaches older ones', async () => {
    await db.sessions.bulkPut([
      {
        sessionId: 's-year',
        dayId: 'push-a',
        startedAt: at('2025-11-18', 18),
        endedAt: at('2025-11-18', 19),
      },
      {
        sessionId: 's-older',
        dayId: 'push-a',
        startedAt: at('2025-11-17', 18),
        endedAt: at('2025-11-17', 19),
      },
    ]);
    await db.sets.bulkAdd([
      set('s-year', 'Dumbbell_Bench_Press', at('2025-11-18', 18, 5)),
      set('s-older', 'Dumbbell_Bench_Press', at('2025-11-17', 18, 5)),
    ]);
    expect(ids(await personalSearch(db, 'bench', { now: NOW })).workout).toEqual([
      's-push',
      's-year',
    ]);
    expect(ids(await personalSearch(db, 'bench 17 nov 2025', { now: NOW })).workout).toEqual([
      's-older',
    ]);
    expect(ids(await personalSearch(db, 'november 2025', { now: NOW })).workout).toEqual([
      's-year',
      's-older',
    ]);
  });

  it('a kind word next to a date reads only that kind (M13c review)', async () => {
    const r = await personalSearch(db, 'yesterday workout', { now: NOW });
    expect(ids(r)).toEqual({ workout: ['s-push'], meal: [], chat: [] });
    const touched = new Set(log.map((t) => t.table));
    expect(touched.has('sessions')).toBe(true);
    expect(touched.has('foodEntries')).toBe(false);
    expect(touched.has('chatMessages')).toBe(false);
    log.length = 0;
    expect(ids(await personalSearch(db, 'เมื่อวานกินอะไร', { now: NOW }))).toEqual({
      workout: [],
      meal: ['2026-11-17'],
      chat: [],
    });
    expect(new Set(log.map((t) => t.table)).has('sessions')).toBe(false);
  });

  it('empty data → empty sections', async () => {
    const empty = spiedDb(`search-empty-${n++}`);
    await empty.db.open();
    const r = await personalSearch(empty.db, 'bench', { now: NOW });
    expect(r.sections.map((s) => [s.kind, s.total, s.more])).toEqual([
      ['workout', 0, false],
      ['meal', 0, false],
      ['chat', 0, false],
    ]);
    await Dexie.delete(empty.db.name);
  });

  it('blank or one letter reads nothing', async () => {
    for (const q of ['', '  ', 'b']) {
      const r = await personalSearch(db, q, { now: NOW });
      expect(r.sections.every((s) => s.hits.length === 0)).toBe(true);
    }
    expect(log).toEqual([]);
  });
});

describe('personalSearch privacy', () => {
  it('reads only sessions, sets, chatMessages, foodEntries, foods and recipes; writes nothing; no network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    // Belt and braces: any property access to a forbidden table throws.
    for (const t of FORBIDDEN) {
      Object.defineProperty(db, t, {
        get: () => {
          throw new Error(`search touched ${t}`);
        },
      });
    }
    const tableSpy = vi.spyOn(db, 'table');

    for (const q of [
      'bench',
      'yesterday',
      'rice',
      'อกไก่',
      '12 nov',
      'last week',
      'วันจันทร์',
      'heavy',
    ]) {
      await personalSearch(db, q, { now: NOW });
    }

    const touched = new Set(log.map((t) => t.table));
    expect(touched.size).toBeGreaterThan(0);
    for (const t of FORBIDDEN) expect(touched.has(t), t).toBe(false);
    expect([...touched].filter((t) => t.startsWith('devlog'))).toEqual([]);
    expect([...touched].filter((t) => !ALLOWED.has(t))).toEqual([]);
    expect(log.filter((t) => t.op === 'mutate' || t.op === 'tx-readwrite')).toEqual([]);
    for (const call of tableSpy.mock.calls) expect(ALLOWED.has(String(call[0]))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect([...PERSONAL_SEARCH_TABLES].sort()).toEqual([...ALLOWED].sort());
  });

  it('the spy itself sees a forbidden read (so a clean result means something)', async () => {
    await db.table('weighIns').toArray();
    expect(log.some((t) => t.table === 'weighIns')).toBe(true);
  });
});
