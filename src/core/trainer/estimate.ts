/**
 * M12 1b time estimate and "fit the day into N minutes" (SPEC M12 trainer kit item 5). Pure.
 *
 * - `estimateSeconds`: per exercise, the set-up time + every set's reps (top of the range) + the
 *   rests between its sets. A paired row (`pairWith`) rests the pair rest. Numbers: timeRules.ts.
 * - `estimateMinutes`: that, rounded **up** to whole minutes (so "≤ 30" is never an under-count).
 *   Today's "~45 min" chip is the older rough figure in src/core/dayInfo.ts (rounded to 5).
 * - `fitToMinutes`: shortens rows in this order, stopping as soon as the day fits:
 *   1. (`pair`) pair neighbouring accessories back to back, the last ones first: both rows get
 *      `pairWith` and the pair rest;
 *   2. trim accessory sets one at a time, from the last accessory up, never below `minSets`;
 *   3. drop the last accessories (a row left without its partner gets its own rest back);
 *   4. last resort, only when the main lifts alone don't fit: trim, then drop, the later main
 *      lifts, then trim the first one. `fits` is false when even that is too long.
 *   Rows in `fixed` (exercises with logged sets) are never changed.
 */
import type { PlannedExercise } from '../types';
import { SHORT_ON_TIME, TIME_RULES, type TimeRules } from './timeRules';

type Rows = { readonly exercises: readonly PlannedExercise[] };

const restOf = (p: PlannedExercise, rules: TimeRules): number =>
  p.pairWith === undefined ? p.restSec : Math.min(p.restSec, rules.pairRestSec);

/** Estimated seconds for the day as planned. */
export function estimateSeconds(day: Rows, rules: TimeRules = TIME_RULES): number {
  let sec = 0;
  for (const p of day.exercises) {
    const sets = Math.max(0, p.sets);
    sec += rules.setupSec + sets * p.targetReps[1] * rules.secPerRep;
    sec += Math.max(0, sets - 1) * restOf(p, rules);
  }
  return sec;
}

/** Estimated whole minutes for the day (rounded up; 0 for an empty day). */
export function estimateMinutes(day: Rows, rules: TimeRules = TIME_RULES): number {
  return Math.ceil(estimateSeconds(day, rules) / 60);
}

export type FitOptions = {
  /** The day must take at most this many minutes. */
  minutes: number;
  /** Exercise ids of the main lifts, kept whole unless they don't fit on their own. */
  main: readonly string[];
  /** Pair neighbouring accessories first (short on time). Default false. */
  pair?: boolean;
  /** Exercise ids that are never changed. */
  fixed?: readonly string[];
  /** Default `SHORT_ON_TIME.minSets`. */
  minSets?: number;
  rules?: TimeRules;
};

export type FitResult = {
  /** The shortened rows (copies), in day order. */
  rows: PlannedExercise[];
  fits: boolean;
  /** `estimateMinutes` of `rows`. */
  minutes: number;
  /** Exercise ids dropped, in the order they went. */
  dropped: string[];
};

export function fitToMinutes(input: readonly PlannedExercise[], opts: FitOptions): FitResult {
  const rules = opts.rules ?? TIME_RULES;
  const minSets = opts.minSets ?? SHORT_ON_TIME.minSets;
  const main = new Set(opts.main);
  const fixed = new Set(opts.fixed ?? []);
  const ownRest = new Map(input.map((p) => [p.exerciseId, p.restSec]));
  let rows: PlannedExercise[] = structuredClone([...input]);
  const dropped: string[] = [];

  const minutes = () => estimateMinutes({ exercises: rows }, rules);
  const fits = () => minutes() <= opts.minutes;
  const done = (): FitResult => ({ rows, fits: fits(), minutes: minutes(), dropped });
  const free = (p: PlannedExercise) => !fixed.has(p.exerciseId);
  const isAccessory = (p: PlannedExercise) => free(p) && !main.has(p.exerciseId);
  const isMain = (p: PlannedExercise) => free(p) && main.has(p.exerciseId);
  /** The matching rows, last first. */
  const lastFirst = (pick: (p: PlannedExercise) => boolean) => rows.filter(pick).reverse();

  /** −1 set per row per pass, last row first, until nothing can go lower. */
  const trim = (pick: (p: PlannedExercise) => boolean): boolean => {
    for (let changed = true; changed;) {
      changed = false;
      for (const p of lastFirst(pick)) {
        if (p.sets <= minSets) continue;
        p.sets -= 1;
        changed = true;
        if (fits()) return true;
      }
    }
    return false;
  };
  const drop = (p: PlannedExercise) => {
    rows = rows.filter((r) => r !== p);
    dropped.push(p.exerciseId);
    for (const r of rows) {
      if (r.pairWith !== p.exerciseId) continue;
      delete r.pairWith;
      r.restSec = ownRest.get(r.exerciseId) ?? r.restSec;
    }
  };
  const dropAll = (pick: (p: PlannedExercise) => boolean): boolean => {
    for (const p of lastFirst(pick)) {
      drop(p);
      if (fits()) return true;
    }
    return false;
  };

  if (fits()) return done();

  // 1. Pair neighbouring accessories, the last ones first.
  if (opts.pair) {
    const open = (p: PlannedExercise | undefined): p is PlannedExercise =>
      p !== undefined && isAccessory(p) && p.pairWith === undefined;
    for (let i = rows.length - 1; i > 0; i--) {
      const a = rows[i - 1];
      const b = rows[i];
      if (!open(a) || !open(b)) continue;
      a.pairWith = b.exerciseId;
      b.pairWith = a.exerciseId;
      a.restSec = Math.min(a.restSec, rules.pairRestSec);
      b.restSec = Math.min(b.restSec, rules.pairRestSec);
      i--;
      if (fits()) return done();
    }
  }
  // 2–3. Accessories: fewer sets, then fewer rows.
  if (trim(isAccessory) || dropAll(isAccessory)) return done();
  // 4. Last resort: the main lifts themselves, the first one last.
  const first = rows.find(isMain);
  const later = (p: PlannedExercise) => isMain(p) && p !== first;
  if (trim(later) || dropAll(later)) return done();
  trim((p) => p === first);
  return done();
}
