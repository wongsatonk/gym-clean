// M10 task 16: pairs a day's rows before an adjust with the rows after it, so app.ts can show
// "Adjusted"/"Removed" in the preview and replay a mid-workout change on the running session
// (REPLACE_UPCOMING per changed row). Pure, no DOM. The trainer actions keep the row order and
// only change rows in place (lighter), swap them in place, or drop them, so:
// - a row whose exercise is still there pairs with it (same id);
// - between two kept rows, the rows that left pair with the new rows in that gap (swaps), best
//   match first (same sets, reps and rest, as swappedRow copies them); left-over rows that left
//   are removed (`to: null`).
// Candidate for src/core/trainer (requested from core-engineer in the task 16 report).
import type { PlannedExercise } from '../core/types';

export type RowPair = { from: PlannedExercise; to: PlannedExercise | null };

const likeness = (a: PlannedExercise, b: PlannedExercise): number =>
  (a.sets === b.sets ? 1 : 0) +
  (a.targetReps[0] === b.targetReps[0] && a.targetReps[1] === b.targetReps[1] ? 1 : 0) +
  (a.restSec === b.restSec ? 1 : 0);

/** One pair per `from` row, in `from` order. Rows only in `to` that pair with nothing are dropped. */
export function alignRows(
  from: readonly PlannedExercise[],
  to: readonly PlannedExercise[],
): RowPair[] {
  const toIds = new Set(to.map((p) => p.exerciseId));
  const fromIds = new Set(from.map((p) => p.exerciseId));
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
  for (const f of from) {
    if (!toIds.has(f.exerciseId)) {
      gone.push(f);
      continue;
    }
    // The kept row: everything in `to` before it is new (swapped in) for the gap before it.
    const k = to.findIndex((t, i) => i >= j && t.exerciseId === f.exerciseId);
    const added = (k < 0 ? [] : to.slice(j, k)).filter((t) => !fromIds.has(t.exerciseId));
    flush(added);
    out.push({ from: f, to: k < 0 ? null : (to[k] as PlannedExercise) });
    if (k >= 0) j = k + 1;
  }
  flush(to.slice(j).filter((t) => !fromIds.has(t.exerciseId)));
  // Back in `from` order (flushes push the gap rows after scanning past them).
  const order = new Map(from.map((p, i) => [p, i]));
  return out.sort((a, b) => (order.get(a.from) ?? 0) - (order.get(b.from) ?? 0));
}

/** The row changed (any field differs). */
export function rowChanged(a: PlannedExercise, b: PlannedExercise | null): boolean {
  return b === null || JSON.stringify(a) !== JSON.stringify(b);
}
