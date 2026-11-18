/**
 * M10e equipment-aware swaps. Pure: kit needs, the gym's equipment and the catalog are passed in
 * (src/data `kitNeeds`, `gymCanDo`, the stored `GymProfile`), because src/core can't import
 * src/data.
 *
 * Kit needs are "any one of these lists, each list all-of": `[['dumbbells'], ['kettlebell']]` is
 * a dumbbell or the kettlebell, `[['half-rack', 'barbell']]` is both, `[[]]` is bodyweight.
 */
import type { TrainerState } from '../types';
import { effectiveDay, type PlanSession } from './plan';
import type { TrainerCatalog } from './swapCandidates';

export type KitNeeds = readonly (readonly string[])[];

/** Whether the equipment covers at least one of the need lists. */
export function kitSatisfied(needs: KitNeeds, equipment: readonly string[]): boolean {
  const have = new Set(equipment);
  return needs.some((list) => list.every((item) => have.has(item)));
}

/**
 * The items missing for the closest need list (fewest missing; the first list on a tie), for a
 * "No leg press here." line. Empty when the kit is there.
 */
export function missingItems(needs: KitNeeds, equipment: readonly string[]): string[] {
  const have = new Set(equipment);
  let best: string[] | undefined;
  for (const list of needs) {
    const miss = list.filter((item) => !have.has(item));
    if (best === undefined || miss.length < best.length) best = miss;
    if (miss.length === 0) return [];
  }
  return best ?? [];
}

/** An exercise in a day that the gym lacks the kit for. */
export type MissingKit = { dayId: string; exerciseId: string };

/**
 * The exercises on `date`'s day (as it runs: overrides included) that the gym can't do, minus
 * `kept` (he chose to keep them). Nothing on a rest day or a day already done.
 */
export function missingKit(
  state: TrainerState,
  sessions: readonly PlanSession[],
  catalog: Pick<TrainerCatalog, 'canDo'>,
  date: string,
  kept: readonly string[],
): MissingKit[] {
  const e = effectiveDay(state, sessions, date);
  if (e.rest || e.done || !e.day) return [];
  const dayId = e.day.id;
  return e.day.exercises
    .filter((p) => !kept.includes(p.exerciseId) && !catalog.canDo(p.exerciseId))
    .map((p) => ({ dayId, exerciseId: p.exerciseId }));
}

/** Every plan day's exercises the gym can't do, minus `kept`, in plan order. */
export function missingInPlan(
  state: TrainerState,
  catalog: Pick<TrainerCatalog, 'canDo'>,
  kept: readonly string[],
): MissingKit[] {
  return state.plan.days.flatMap((d) =>
    d.exercises
      .filter((p) => !kept.includes(p.exerciseId) && !catalog.canDo(p.exerciseId))
      .map((p) => ({ dayId: d.id, exerciseId: p.exerciseId })),
  );
}
