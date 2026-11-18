// Small derived facts about a program day, shared by Today, the day preview and the exercise
// screen (M4e A8). Pure: no DOM, no data imports (the exercise lookup is passed in).
import { estimateSeconds } from './trainer/estimate';
import type { Exercise, ProgramDay } from './types';

/**
 * Rough minutes for a day, shown as "~45 min": the coach's time estimate (trainer/estimate.ts:
 * set-up, reps and rests from timeRules.ts) rounded to the nearest 5 (at least 5). A day fitted
 * to N minutes (short on time, starter plans) never shows more than N.
 */
export function estimateMinutes(day: Pick<ProgramDay, 'exercises'>): number {
  return Math.max(5, Math.round(estimateSeconds(day) / 300) * 5);
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
