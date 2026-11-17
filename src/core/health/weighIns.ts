/**
 * M11 weigh-in import (SPEC M11 "Weigh-in auto-fill", rule changed 2026-11-16: Health wins).
 * Pure: samples and stored rows are passed in; only `localDate` / `getHours` read the device's
 * time zone (through `Date`).
 *
 * - Pick per local date: the earliest body-mass sample before 12:00; if that date has none before
 *   noon, the earliest sample of the day (a scale app may sync later). Source 'health'.
 * - Health wins: the pick replaces whatever is stored for that date, a typed weigh-in included.
 *   A later read updates an imported row when the pick changed (e.g. a morning sample arrived
 *   late). A typed weigh-in on a date Health has no sample for is never touched.
 * - Dates he deleted (HealthSettings.deletedHealthWeighIns) are never imported again; whatever he
 *   left on such a date (nothing, or a typed row) stays.
 */
import type { WeighIn } from '../types';
import { localDate } from '../trainer/plan';

/** Samples at or after this local hour are only used when the date has none before it. */
export const WEIGH_IN_CUTOFF_HOUR = 12;

/** One body-mass sample from Health, already in kg. `time` = epoch ms. */
export type BodyMassSample = { time: number; kg: number };

/** A stored weigh-in's origin; rows from before M11 have no source and were typed. */
export function weighInSource(w: WeighIn): 'manual' | 'health' {
  return w.source === 'health' ? 'health' : 'manual';
}

/** Same rounding as a typed weigh-in (`weighInKg` in src/core/nutrition/portions.ts): 4 decimals. */
const roundKg = (kg: number): number => Math.round(kg * 1e4) / 1e4;

const isMorning = (s: BodyMassSample): boolean =>
  new Date(s.time).getHours() < WEIGH_IN_CUTOFF_HOUR;

/** `a` is the better pick than `b` for the same date: morning first, then earliest. */
function better(a: BodyMassSample, b: BodyMassSample): boolean {
  const am = isMorning(a);
  if (am !== isMorning(b)) return am;
  return a.time < b.time;
}

/**
 * Per local date, the earliest valid sample before noon, else the earliest valid sample that
 * day, as a health weigh-in; date order.
 */
export function dailyWeighIns(samples: readonly BodyMassSample[]): WeighIn[] {
  const best = new Map<string, BodyMassSample>();
  for (const s of samples) {
    if (!Number.isFinite(s.time) || !Number.isFinite(s.kg) || s.kg <= 0) continue;
    const date = localDate(s.time);
    const prev = best.get(date);
    if (!prev || better(s, prev)) best.set(date, s);
  }
  return [...best.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, s]) => ({ date, kg: roundKg(s.kg), source: 'health' as const }));
}

/**
 * The weigh-ins to write (Health wins): every date's pick except dates he deleted and dates
 * whose stored row is already that same health value.
 */
export function planWeighInImport(input: {
  samples: readonly BodyMassSample[];
  existing: readonly WeighIn[];
  deleted: readonly string[];
}): WeighIn[] {
  const stored = new Map(input.existing.map((w) => [w.date, w]));
  const deleted = new Set(input.deleted);
  return dailyWeighIns(input.samples).filter((w) => {
    if (deleted.has(w.date)) return false;
    const old = stored.get(w.date);
    return !(old && weighInSource(old) === 'health' && old.kg === w.kg);
  });
}
