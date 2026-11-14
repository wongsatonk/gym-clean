// Small derived facts about a program day, shared by Today and the day preview (M4e A8).
// Pure (no DOM). Candidates to move into src/core/ (requested from core-engineer); they stay
// here until then so the screens can ship.
import type { Exercise, ProgramDay } from '../../core/types';

/** Seconds of work assumed per set for the time estimate (setup + reps). */
export const WORK_SEC_PER_SET = 40;

/**
 * Rough minutes for a day: every set's work plus every planned rest except the last one,
 * rounded to the nearest 5 (at least 5). Shown as "~45 min".
 */
export function estimateMinutes(day: ProgramDay): number {
  let sec = 0;
  for (const p of day.exercises) sec += p.sets * (WORK_SEC_PER_SET + p.restSec);
  const last = day.exercises.at(-1);
  if (last) sec -= last.restSec;
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}

/** Total planned sets. */
export function setCount(day: ProgramDay): number {
  return day.exercises.reduce((n, e) => n + e.sets, 0);
}

export type DayMuscles = { primary: string[]; secondary: string[] };

/**
 * Primary muscles of the day, most-worked first (weighted by sets), plus the secondary ones
 * that aren't primary anywhere. `lookup` is `exerciseById` from src/data/catalog.ts.
 */
export function dayMuscles(
  day: ProgramDay,
  lookup: (id: string) => Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles'> | undefined,
): DayMuscles {
  const weight = new Map<string, number>();
  const secondary = new Set<string>();
  for (const p of day.exercises) {
    const ex = lookup(p.exerciseId);
    for (const m of ex?.primaryMuscles ?? []) weight.set(m, (weight.get(m) ?? 0) + p.sets);
    for (const m of ex?.secondaryMuscles ?? []) secondary.add(m);
  }
  // Stable: ties keep first-seen order (Map iteration order).
  const primary = [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  return { primary, secondary: [...secondary].filter((m) => !weight.has(m)) };
}

/** "middle back" → "Middle back". */
export function muscleLabel(m: string): string {
  return m.charAt(0).toUpperCase() + m.slice(1);
}
