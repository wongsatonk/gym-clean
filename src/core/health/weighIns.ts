/**
 * M11 weigh-in auto-fill (SPEC M11 "Weigh-in auto-fill"). Pure: samples and stored rows are
 * passed in; only `localDate` / `getHours` read the device's time zone (through `Date`).
 *
 * - The earliest body-mass sample of each local date before 12:00 becomes that date's weigh-in
 *   (source 'health'). Later samples that day are ignored (no afternoon fallback).
 * - A typed weigh-in on that date always wins: dates with any stored row are skipped, so an
 *   import never overwrites a typed row, nor an earlier import (a later read can't move it).
 * - Dates he deleted (HealthSettings.deletedHealthWeighIns) are never imported again.
 */
import type { WeighIn } from '../types';
import { localDate } from '../trainer/plan';

/** Samples at or after this local hour don't count as a morning weigh-in. */
export const WEIGH_IN_CUTOFF_HOUR = 12;

/** One body-mass sample from Health, already in kg. `time` = epoch ms. */
export type BodyMassSample = { time: number; kg: number };

/** A stored weigh-in's origin; rows from before M11 have no source and were typed. */
export function weighInSource(w: WeighIn): 'manual' | 'health' {
  return w.source === 'health' ? 'health' : 'manual';
}

/** Same rounding as a typed weigh-in (`weighInKg` in src/core/nutrition/portions.ts): 4 decimals. */
const roundKg = (kg: number): number => Math.round(kg * 1e4) / 1e4;

/** Per local date, the earliest valid sample before noon, as a health weigh-in; date order. */
export function morningWeighIns(samples: readonly BodyMassSample[]): WeighIn[] {
  const best = new Map<string, BodyMassSample>();
  for (const s of samples) {
    if (!Number.isFinite(s.time) || !Number.isFinite(s.kg) || s.kg <= 0) continue;
    if (new Date(s.time).getHours() >= WEIGH_IN_CUTOFF_HOUR) continue;
    const date = localDate(s.time);
    const prev = best.get(date);
    if (!prev || s.time < prev.time) best.set(date, s);
  }
  return [...best.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, s]) => ({ date, kg: roundKg(s.kg), source: 'health' as const }));
}

/** The weigh-ins to write: morning picks on dates with no stored row and not deleted by him. */
export function planWeighInImport(input: {
  samples: readonly BodyMassSample[];
  existing: readonly WeighIn[];
  deleted: readonly string[];
}): WeighIn[] {
  const taken = new Set(input.existing.map((w) => w.date));
  const deleted = new Set(input.deleted);
  return morningWeighIns(input.samples).filter((w) => !taken.has(w.date) && !deleted.has(w.date));
}
