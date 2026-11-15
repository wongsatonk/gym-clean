/**
 * M10: pairs a day's rows before an adjust with the rows after it, so the UI can show
 * "Adjusted"/"Removed" in the preview and replay a mid-workout change on the running session
 * (REPLACE_UPCOMING per changed row). Pure.
 *
 * - A row whose exercise is still there pairs with it (same id).
 * - A row that left pairs by the adjust's row map (`DayAdjust.replaced`) when it has a usable
 *   entry: `toId` null = removed; a `toId` that is a new row in `to` (not kept from `from`, not
 *   already paired) = swapped. Stale entries are ignored.
 * - Rows the map doesn't cover (older overrides have no map) fall back to likeness: the trainer
 *   actions keep the row order and only change rows in place, swap them in place, or drop them,
 *   so between two kept rows the rows that left pair with the new rows in that gap, best match
 *   first (same sets, reps and rest, as swappedRow copies them); left-over rows are removed.
 */
import type { DayAdjust, PlannedExercise } from '../types';

export type RowPair = { from: PlannedExercise; to: PlannedExercise | null };
export type RowReplacement = NonNullable<DayAdjust['replaced']>[number];

const likeness = (a: PlannedExercise, b: PlannedExercise): number =>
  (a.sets === b.sets ? 1 : 0) +
  (a.targetReps[0] === b.targetReps[0] && a.targetReps[1] === b.targetReps[1] ? 1 : 0) +
  (a.restSec === b.restSec ? 1 : 0);

/**
 * One pair per `from` row, in `from` order. Rows only in `to` that pair with nothing are
 * dropped. `replaced` is the adjust's row map, when it has one.
 */
export function alignRows(
  from: readonly PlannedExercise[],
  to: readonly PlannedExercise[],
  replaced: readonly RowReplacement[] = [],
): RowPair[] {
  const toIds = new Set(to.map((p) => p.exerciseId));
  const fromIds = new Set(from.map((p) => p.exerciseId));
  const isNew = (t: PlannedExercise) => !fromIds.has(t.exerciseId);

  // Explicit pairs from the row map first.
  const explicit = new Map<PlannedExercise, PlannedExercise | null>();
  const claimed = new Set<PlannedExercise>();
  for (const f of from) {
    if (toIds.has(f.exerciseId)) continue;
    const entry = replaced.find((r) => r.fromId === f.exerciseId);
    if (!entry) continue;
    if (entry.toId === null) {
      explicit.set(f, null);
      continue;
    }
    const t = to.find((x) => x.exerciseId === entry.toId);
    if (t && isNew(t) && !claimed.has(t)) {
      explicit.set(f, t);
      claimed.add(t);
    }
  }

  const out: RowPair[] = [];
  let j = 0;
  let gone: PlannedExercise[] = [];
  const flush = (added: PlannedExercise[]) => {
    // Each new row goes to the gone row it looks most like (ties: the earlier one).
    const match = new Map<PlannedExercise, PlannedExercise>();
    for (const t of added) {
      let best: PlannedExercise | undefined;
      for (const f of gone) {
        if (match.has(f)) continue;
        if (!best || likeness(f, t) > likeness(best, t)) best = f;
      }
      if (best) match.set(best, t);
    }
    for (const f of gone) out.push({ from: f, to: match.get(f) ?? null });
    gone = [];
  };
  const unclaimedNew = (rows: readonly PlannedExercise[]) =>
    rows.filter((t) => isNew(t) && !claimed.has(t));
  for (const f of from) {
    if (explicit.has(f)) {
      out.push({ from: f, to: explicit.get(f) ?? null });
      continue;
    }
    if (!toIds.has(f.exerciseId)) {
      gone.push(f);
      continue;
    }
    // The kept row: everything new in `to` before it is swapped in for the gap before it.
    const k = to.findIndex((t, i) => i >= j && t.exerciseId === f.exerciseId);
    flush(k < 0 ? [] : unclaimedNew(to.slice(j, k)));
    out.push({ from: f, to: k < 0 ? null : (to[k] as PlannedExercise) });
    if (k >= 0) j = k + 1;
  }
  flush(unclaimedNew(to.slice(j)));
  // Back in `from` order (flushes push the gap rows after scanning past them).
  const order = new Map(from.map((p, i) => [p, i]));
  return out.sort((a, b) => (order.get(a.from) ?? 0) - (order.get(b.from) ?? 0));
}

/** The row changed (any field differs). */
export function rowChanged(a: PlannedExercise, b: PlannedExercise | null): boolean {
  return b === null || JSON.stringify(a) !== JSON.stringify(b);
}
