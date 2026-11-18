/**
 * M10 swap candidates (SPEC M10 "Go easy on a body area" and "Swap an exercise"). Pure: the
 * catalog, the muscle → area lookup and the gym's kit check are passed in, because src/core
 * can't import src/data. Wire it as
 * `{ exercises: catalogExercises(), areaOf: bodyAreaOf, canDo: (id) => gymCanDo(id, profile),
 *    preferred: preferredSwaps, missingKitLabels: (id) => missingKitLabels(id, profile) }`.
 *
 * Eligible: not the exercise itself, not in `exclude`, the gym has its kit (M10e), and
 * - without `avoid`: shares a primary muscle with the exercise;
 * - with `avoid`: no primary or secondary muscle in that area, and its primary muscles share at
 *   least one of the exercise's **primary** muscles outside the area (a muscle that only helps,
 *   e.g. the triceps of a shoulder press, never picks the swap). An exercise whose primary
 *   muscles are all in the area has no candidates (it gets removed).
 * Ranked by: position in the exercise's `preferred` list (closest replacements, M10e; only
 * eligible ids count), then primary overlap, then secondary overlap, then the same `tracking`,
 * then the same equipment, then catalog order.
 */
import { ruleFor } from '../exercises';
import type { BodyArea, Exercise, PlannedExercise } from '../types';

export type TrainerCatalog = {
  exercises: readonly Exercise[];
  /** The body area of a free-exercise-db muscle (src/data `bodyAreaOf`). */
  areaOf: (muscle: string) => BodyArea | undefined;
  /** Whether the gym has the kit for this exercise (src/data `gymCanDo` with the profile). */
  canDo: (exerciseId: string) => boolean;
  /** The closest replacements for an exercise, best first (src/data `preferredSwaps`). */
  preferred?: (exerciseId: string) => readonly string[];
  /**
   * Labels of the kit the gym lacks for an exercise (src/data `missingKitLabels`), e.g.
   * ["Leg press"], for the coach's "No leg press here." line. Empty when it's doable.
   */
  missingKitLabels?: (exerciseId: string) => readonly string[];
  /** Whether the exercise has a pose rule. Defaults to the src/core/exercises registry. */
  hasRule?: (exerciseId: string) => boolean;
};

export type SwapOptions = {
  avoid?: BodyArea;
  /** Exercise ids that can't be suggested (e.g. already in the day). */
  exclude: readonly string[];
  /** The swapped row's tracking, for the tie-break. */
  tracking?: PlannedExercise['tracking'];
  /** Default 3. */
  limit?: number;
};

export type SwapCandidate = {
  exercise: Exercise;
  /** 'pose' only when a rule exists. */
  tracking: PlannedExercise['tracking'];
};

export const SWAP_LIMIT = 3;

/** How many muscles the two lists share. */
export function muscleOverlap(a: readonly string[], b: readonly string[]): number {
  const set = new Set(b);
  return new Set(a.filter((m) => set.has(m))).size;
}

/** 'pose' when the exercise has a pose rule, else 'manual'. */
export function trackingFor(
  exerciseId: string,
  catalog: Pick<TrainerCatalog, 'hasRule'>,
): PlannedExercise['tracking'] {
  const has = catalog.hasRule ?? ((id: string) => ruleFor(id) !== undefined);
  return has(exerciseId) ? 'pose' : 'manual';
}

/** Whether any of the exercise's muscles (primary or secondary) is in the area. */
export function loadsArea(e: Exercise, area: BodyArea, areaOf: TrainerCatalog['areaOf']): boolean {
  return [...e.primaryMuscles, ...e.secondaryMuscles].some((m) => areaOf(m) === area);
}

/** Whether a primary muscle of the exercise is in the area. */
export function primaryInArea(
  e: Exercise,
  area: BodyArea,
  areaOf: TrainerCatalog['areaOf'],
): boolean {
  return e.primaryMuscles.some((m) => areaOf(m) === area);
}

export function swapCandidates(
  exercise: Exercise,
  catalog: TrainerCatalog,
  opts: SwapOptions,
): SwapCandidate[] {
  const { avoid } = opts;
  const outside = (m: string) => avoid === undefined || catalog.areaOf(m) !== avoid;
  const P = exercise.primaryMuscles.filter(outside);
  const S = exercise.secondaryMuscles.filter(outside);
  const target = avoid === undefined ? exercise.primaryMuscles : P;
  const excluded = new Set([exercise.id, ...opts.exclude]);
  const preferred = catalog.preferred?.(exercise.id) ?? [];
  const rank = (id: string) => {
    const i = preferred.indexOf(id);
    return i < 0 ? 0 : preferred.length - i;
  };

  const scored = catalog.exercises.flatMap((c, order) => {
    if (excluded.has(c.id) || !catalog.canDo(c.id)) return [];
    if (avoid !== undefined && loadsArea(c, avoid, catalog.areaOf)) return [];
    if (muscleOverlap(c.primaryMuscles, target) === 0) return [];
    const tracking = trackingFor(c.id, catalog);
    const keys = [
      rank(c.id),
      muscleOverlap(c.primaryMuscles, P),
      muscleOverlap([...c.primaryMuscles, ...c.secondaryMuscles], S),
      opts.tracking !== undefined && tracking === opts.tracking ? 1 : 0,
      c.equipment === exercise.equipment ? 1 : 0,
    ];
    return [{ c: { exercise: c, tracking }, keys, order }];
  });
  scored.sort((a, b) => {
    for (let i = 0; i < a.keys.length; i++) {
      const d = (b.keys[i] ?? 0) - (a.keys[i] ?? 0);
      if (d !== 0) return d;
    }
    return a.order - b.order;
  });
  return scored.slice(0, opts.limit ?? SWAP_LIMIT).map((s) => s.c);
}

/**
 * `p`'s slot (sets, reps, rest) running the candidate instead. The weight comes from that
 * exercise's history, else 0 for a bodyweight exercise, else blank ("pick your weight").
 */
export function swappedRow(
  p: PlannedExercise,
  candidate: SwapCandidate,
  lastWeightKg: Readonly<Record<string, number>>,
  adjusted?: PlannedExercise['adjusted'],
): PlannedExercise {
  const row: PlannedExercise = {
    exerciseId: candidate.exercise.id,
    sets: p.sets,
    targetReps: [p.targetReps[0], p.targetReps[1]],
    restSec: p.restSec,
    tracking: candidate.tracking,
  };
  const weight =
    lastWeightKg[candidate.exercise.id] ??
    (candidate.exercise.equipment === 'body only' ? 0 : undefined);
  if (weight !== undefined) row.startWeightKg = weight;
  if (adjusted !== undefined) row.adjusted = adjusted;
  return row;
}
