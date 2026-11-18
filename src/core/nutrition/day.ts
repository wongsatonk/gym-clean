/**
 * M7 day view logic (plan task 8): totals, what's left, meal slots, recents, the evening nudge,
 * the post-workout hint and the nutrition history. Pure: time is passed in.
 *
 * - A food day is the local calendar day; it ends at midnight (M7-q8).
 * - Slots (M7-q1): breakfast < 10:30, lunch < 14:30, snack < 17:30, dinner < 21:30, then snack;
 *   "post-workout" for anything within 2 h after the last workout ended.
 * - Nudge (M7-q6): only from 19:00, protein under 75% of the target, at most once a day.
 * - Copy is coaching language only and passes the M10 `checkCopy`.
 */
import type { FoodEntry, MacroSet, MealSlot, NutritionTargets } from '../types';
import { addDate, localDate } from '../trainer/plan';
import { roundMacros } from './portions';

export const POST_WORKOUT_MS = 2 * 3_600_000;
export const NUDGE_FROM_HOUR = 19;
/** The nudge shows while protein eaten is below this share of the target. */
export const NUDGE_PROTEIN_SHARE = 0.75;

/** Local YYYY-MM-DD the entry at `time` counts toward. */
export function foodDate(time: number): string {
  return localDate(time);
}

export type DayTotals = MacroSet & { count: number };

/**
 * Sum of the entries (of `date`, if given). Carbs / fat are summed from the entries that have
 * them and stay undefined when none do.
 */
export function dayTotals(entries: readonly FoodEntry[], date?: string): DayTotals {
  const sum: MacroSet = { kcal: 0, proteinG: 0 };
  let count = 0;
  for (const e of entries) {
    if (date !== undefined && e.date !== date) continue;
    count++;
    sum.kcal += e.kcal;
    sum.proteinG += e.proteinG;
    if (e.carbsG !== undefined) sum.carbsG = (sum.carbsG ?? 0) + e.carbsG;
    if (e.fatG !== undefined) sum.fatG = (sum.fatG ?? 0) + e.fatG;
  }
  return { ...roundMacros(sum), count };
}

export type MacroKey = 'kcal' | 'proteinG' | 'carbsG' | 'fatG';
export const MACRO_KEYS: readonly MacroKey[] = ['kcal', 'proteinG', 'carbsG', 'fatG'];

/** One macro against its target: `left` and `over` are never negative (one of them is 0). */
export type MacroLeft = {
  target: number;
  eaten: number;
  left: number;
  over: number;
  estimate: boolean;
};

const r1 = (x: number) => Math.round(x * 10) / 10;

/** What's left of each target. Show `left`, or "over by `over`" — never a negative number. */
export function remaining(
  totals: MacroSet,
  targets: NutritionTargets,
): Record<MacroKey, MacroLeft> {
  const one = (k: MacroKey): MacroLeft => {
    const target = targets[k].value;
    const eaten = totals[k] ?? 0;
    return {
      target,
      eaten,
      left: r1(Math.max(0, target - eaten)),
      over: r1(Math.max(0, eaten - target)),
      estimate: targets[k].estimate,
    };
  };
  return { kcal: one('kcal'), proteinG: one('proteinG'), carbsG: one('carbsG'), fatG: one('fatG') };
}

/** The `left` amounts as a MacroSet (for food suggestions). */
export function leftMacros(r: Record<MacroKey, MacroLeft>): MacroSet {
  return { kcal: r.kcal.left, proteinG: r.proteinG.left, carbsG: r.carbsG.left, fatG: r.fatG.left };
}

/** The default meal slot for an entry logged at `time` (editable by the user). */
export function slotFor(time: number, lastSessionEnd?: number): MealSlot {
  if (lastSessionEnd !== undefined) {
    const since = time - lastSessionEnd;
    if (since >= 0 && since <= POST_WORKOUT_MS) return 'post-workout';
  }
  const d = new Date(time);
  const min = d.getHours() * 60 + d.getMinutes();
  if (min < 10 * 60 + 30) return 'breakfast';
  if (min < 14 * 60 + 30) return 'lunch';
  if (min < 17 * 60 + 30) return 'snack';
  if (min < 21 * 60 + 30) return 'dinner';
  return 'snack';
}

function recentKey(e: FoodEntry): string {
  const amount = JSON.stringify(e.amount);
  if (e.ref?.recipeId !== undefined) return `r:${e.ref.recipeId}|${amount}`;
  if (e.ref?.foodId !== undefined) return `f:${e.ref.foodId}|${amount}`;
  return `q:${e.label}|${e.kcal}|${e.proteinG}|${amount}`;
}

/** The newest `n` distinct items (same food/recipe + same amount counts once). */
export function recentItems(entries: readonly FoodEntry[], n: number): FoodEntry[] {
  const seen = new Set<string>();
  const out: FoodEntry[] = [];
  for (const e of [...entries].sort((a, b) => b.time - a.time)) {
    const k = recentKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= n) break;
  }
  return out;
}

const proteinToGo = (g: number) => `${g} g protein to go today`;
export const PROTEIN_HIT = 'Protein target hit today';

export type Nudge = { kind: 'eveningProtein'; date: string; leftG: number; text: string };

/**
 * The evening protein nudge (shown when the app opens, never pushed or spoken), or null.
 * `shownToday` = it was already shown (or dismissed) on today's date.
 */
export function nudgeFor(
  now: number,
  totals: MacroSet,
  targets: NutritionTargets | null,
  shownToday: boolean,
): Nudge | null {
  if (!targets || shownToday) return null;
  if (new Date(now).getHours() < NUDGE_FROM_HOUR) return null;
  const target = targets.proteinG.value;
  if (!(target > 0) || totals.proteinG >= NUDGE_PROTEIN_SHARE * target) return null;
  const leftG = Math.round(target - totals.proteinG);
  return { kind: 'eveningProtein', date: localDate(now), leftG, text: proteinToGo(leftG) };
}

/** The Summary line after a workout; null = no targets. */
export function postWorkoutHint(totals: MacroSet, targets: NutritionTargets | null): string | null {
  if (!targets || !(targets.proteinG.value > 0)) return null;
  const left = Math.round(targets.proteinG.value - totals.proteinG);
  return left > 0 ? proteinToGo(left) : PROTEIN_HIT;
}

export type HistoryDay = { date: string; totals: DayTotals; training: boolean };

/**
 * The last `days` local days ending with `today`, oldest first. A day is a training day when a
 * finished session (with `endedAt`) started on it.
 */
export function nutritionHistory(
  entries: readonly FoodEntry[],
  sessions: readonly { startedAt: number; endedAt?: number }[],
  today: string,
  days: number,
): HistoryDay[] {
  const trained = new Set(
    sessions.filter((s) => s.endedAt !== undefined).map((s) => localDate(s.startedAt)),
  );
  const out: HistoryDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDate(today, -i);
    out.push({ date, totals: dayTotals(entries, date), training: trained.has(date) });
  }
  return out;
}
