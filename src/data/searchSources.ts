/**
 * M13c task 3b: personal search over this phone's data (SPEC M13c goal 3, his q2 "Everything").
 *
 * Reads on demand, read-only, and only these tables: `sessions` + `sets` (past workouts),
 * `chatMessages` (the kept 30 days, the same window the Coach tab shows), `foodEntries` (+ the
 * `foods` / `recipes` rows they point at, for names). It never reads progress photos,
 * measurements, Health days, check-ins, day feels, weigh-ins or the developer log (a test spies
 * every table), keeps no cache, stores no query and makes no network request. Ranking is pure
 * (src/core/searchPersonal.ts). Time is passed in (`now`).
 */
import {
  personalKinds,
  personalQueryUsable,
  rankPersonal,
  splitDateQuery,
  chatSearchItems,
  mealSearchItems,
  workoutSearchItems,
  type PersonalKind,
  type PersonalResults,
  type RankPersonalOptions,
} from '../core/searchPersonal';
import type { SearchEntry } from '../core/search';
import { addDate, localDate } from '../core/trainer/plan';
import type { DateQuery, FoodEntry } from '../core/types';
import { exerciseName as catalogExerciseName, programDay } from './catalog';
import { chatCutoff } from './chat/store';
import type { GymDb } from './db';

/** Every table personal search may read (a test pins this list). */
export const PERSONAL_SEARCH_TABLES = [
  'sessions',
  'sets',
  'chatMessages',
  'foodEntries',
  'foods',
  'recipes',
] as const;

export type PersonalSearchOptions = {
  /** Wall-clock ms: today's date and the chat's 30-day window come from it. */
  now: number;
  /** Page size per kind (default 10). */
  perKind?: number;
  /** Page start: one number for every kind, or per kind ("Show more" on one section). */
  offset?: RankPersonalOptions['offset'];
  /** Only these kinds (default workout, meal, chat); other kinds' tables aren't read. */
  kinds?: readonly PersonalKind[];
  /** The effective plan's day names; default: the bundled program's ("Push A"). */
  dayName?: (dayId: string) => string | undefined;
  /** Default: the catalog name. */
  exerciseName?: (exerciseId: string) => string;
};

/** Local midnight (ms) of a YYYY-MM-DD date. */
function midnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}

/** [start, end) in ms for an inclusive date range. */
function msRange(range: NonNullable<DateQuery>): [number, number] {
  return [midnight(range.from), midnight(addDate(range.to, 1))];
}

async function workoutItems(
  db: GymDb,
  range: DateQuery,
  today: string,
  opts: PersonalSearchOptions,
): Promise<SearchEntry[]> {
  const sessions =
    range === null
      ? await db.sessions.toArray()
      : await db.sessions
          .where('startedAt')
          .between(...msRange(range), true, false)
          .toArray();
  const finished = sessions.filter((s) => s.endedAt !== undefined);
  if (finished.length === 0) return [];
  const sets = await db.sets
    .where('sessionId')
    .anyOf(finished.map((s) => s.sessionId))
    .toArray();
  return workoutSearchItems(finished, sets, {
    dayName: opts.dayName ?? ((id) => programDay(id)?.name),
    exerciseName: opts.exerciseName ?? catalogExerciseName,
    today,
  });
}

async function chatItems(
  db: GymDb,
  range: DateQuery,
  today: string,
  now: number,
): Promise<SearchEntry[]> {
  const cutoff = chatCutoff(now);
  let from = cutoff;
  let to = Infinity;
  if (range !== null) {
    const [a, b] = msRange(range);
    from = Math.max(cutoff, a);
    to = b;
  }
  if (from >= to) return [];
  const rows =
    to === Infinity
      ? await db.chatMessages.where('createdAt').aboveOrEqual(from).toArray()
      : await db.chatMessages.where('createdAt').between(from, to, true, false).toArray();
  return chatSearchItems(rows, { today });
}

async function mealItems(db: GymDb, range: DateQuery, today: string): Promise<SearchEntry[]> {
  const entries =
    range === null
      ? await db.foodEntries.toArray()
      : await db.foodEntries.where('date').between(range.from, range.to, true, true).toArray();
  if (entries.length === 0) return [];
  const foodIds = [...new Set(entries.flatMap((e) => (e.ref?.foodId ? [e.ref.foodId] : [])))];
  const recipeIds = [...new Set(entries.flatMap((e) => (e.ref?.recipeId ? [e.ref.recipeId] : [])))];
  const foods = foodIds.length > 0 ? await db.foods.bulkGet(foodIds) : [];
  const recipes = recipeIds.length > 0 ? await db.recipes.bulkGet(recipeIds) : [];
  const names = new Map<string, string[]>();
  for (const f of foods) if (f) names.set(`f:${f.id}`, [f.name, ...(f.nameTh ? [f.nameTh] : [])]);
  for (const r of recipes) if (r) names.set(`r:${r.id}`, [r.name, ...(r.nameTh ? [r.nameTh] : [])]);
  const foodNames = (e: FoodEntry): string[] => [
    ...(e.ref?.foodId ? (names.get(`f:${e.ref.foodId}`) ?? []) : []),
    ...(e.ref?.recipeId ? (names.get(`r:${e.ref.recipeId}`) ?? []) : []),
  ];
  return mealSearchItems(entries, { foodNames, today });
}

/**
 * Searches your past workouts, logged meals and coach chat for `query` (words and/or a date
 * phrase). Newest first, `perKind` per section with a `more` flag; sections in the order
 * workout, meal, chat. Blank or one-letter queries (without a date) read nothing.
 */
export async function personalSearch(
  db: GymDb,
  query: string,
  opts: PersonalSearchOptions,
): Promise<PersonalResults> {
  const today = localDate(opts.now);
  const kinds = personalKinds(opts.kinds);
  const rankOpts: RankPersonalOptions = {
    today,
    kinds,
    ...(opts.perKind !== undefined ? { perKind: opts.perKind } : {}),
    ...(opts.offset !== undefined ? { offset: opts.offset } : {}),
  };
  if (!personalQueryUsable(query, today)) return rankPersonal([], query, rankOpts);
  const { range } = splitDateQuery(query, today);
  const parts = await Promise.all(
    kinds.map((k) =>
      k === 'workout'
        ? workoutItems(db, range, today, opts)
        : k === 'chat'
          ? chatItems(db, range, today, opts.now)
          : mealItems(db, range, today),
    ),
  );
  return rankPersonal(parts.flat(), query, rankOpts);
}
