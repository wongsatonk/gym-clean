/**
 * M10 Apply / Undo (SPEC M10 core principle). Pure: `now` (ms) is passed in. Every applied change
 * returns a record with copies of the state before and after, so Undo can restore it.
 *
 * - `version` only ever rises (apply and undo both bump it), so a Proposal built before an undo
 *   is stale after it, even if the content matches an older version.
 * - Undo is LIFO: only the newest change that isn't undone, and only while the state still is
 *   that change's `after` (anything else means the state moved on without a record).
 * - Overrides older than 14 days (by the local date of `now`) are pruned whenever a change is
 *   applied; Undo restores `before` as it was. Focus blocks (M12) are never pruned (the Calendar
 *   reads past blocks) and are part of the Undo conflict check.
 */
import { addDate, localDate, seedPlan } from './plan';
import type { DayOverride, PlanChange, Program, Proposal, TrainerState } from '../types';

/** Overrides dated today − 14 or later are kept. */
export const OVERRIDE_KEEP_DAYS = 14;

export const RESET_TITLE = 'Reset to default program';

/**
 * A plan change, including Reset. `PlanChange['action']` doesn't list 'reset' yet (shared type,
 * see the M10 task 4 report); this widens it, and a `PlanChange` is always a `TrainerChange`.
 */
export type TrainerChange = Omit<PlanChange, 'action'> & { action: PlanChange['action'] | 'reset' };

export type ChangeError = 'stale' | 'nothingToUndo' | 'alreadyUndone' | 'notNewest' | 'conflict';

export type ChangeResult<C extends TrainerChange = TrainerChange> =
  { ok: true; state: TrainerState; change: C } | { ok: false; reason: ChangeError };

/** Overrides dated `today − 14` or later, in their order. */
export function pruneOverrides(overrides: readonly DayOverride[], today: string): DayOverride[] {
  const oldest = addDate(today, -OVERRIDE_KEEP_DAYS);
  return overrides.filter((o) => o.date >= oldest);
}

/** Structural equality for plain JSON-like data (key order doesn't matter). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

const sameContent = (a: TrainerState, b: TrainerState): boolean =>
  same(a.plan, b.plan) &&
  same(a.schedule, b.schedule) &&
  same(a.overrides, b.overrides) &&
  same(a.blocks ?? [], b.blocks ?? []);

/** `next` (copied) with version + 1 and old overrides pruned. */
function commit(state: TrainerState, next: TrainerState, now: number): TrainerState {
  const copy = structuredClone(next);
  return {
    ...copy,
    version: state.version + 1,
    overrides: pruneOverrides(copy.overrides, localDate(now)),
  };
}

/** Applies a Proposal the user tapped Apply on. Rejects it if the state changed since. */
export function applyProposal(
  state: TrainerState,
  proposal: Proposal,
  now: number,
  source: PlanChange['source'],
): ChangeResult<PlanChange> {
  if (proposal.baseVersion !== state.version) return { ok: false, reason: 'stale' };
  const after = commit(state, proposal.next, now);
  if (!after.plan.edited && !same(after.plan.days, state.plan.days)) {
    after.plan = { ...after.plan, edited: true };
  }
  const change: PlanChange = {
    createdAt: now,
    action: proposal.action,
    title: proposal.title,
    source,
    before: structuredClone(state),
    after: structuredClone(after),
  };
  return { ok: true, state: after, change };
}

/** The newest change not undone: createdAt, then id, then the later list position. */
function newestStanding<C extends TrainerChange>(changes: readonly C[]): C | null {
  let best: C | null = null;
  for (const c of changes) {
    if (c.undoneAt !== undefined) continue;
    // `>=` on ties: the later list position wins when createdAt and id are equal.
    if (
      !best ||
      c.createdAt > best.createdAt ||
      (c.createdAt === best.createdAt && (c.id ?? -1) >= (best.id ?? -1))
    ) {
      best = c;
    }
  }
  return best;
}

/**
 * Undoes the newest change that isn't undone (LIFO), restoring its `before` with version + 1.
 * With `id`, that change must be the one (else 'alreadyUndone' / 'notNewest').
 * Returns the change with `undoneAt` set, for the caller to store.
 */
export function undoLast<C extends TrainerChange>(
  state: TrainerState,
  changes: readonly C[],
  now: number,
  id?: number,
): ChangeResult<C> {
  const newest = newestStanding(changes);
  if (id !== undefined) {
    const target = changes.find((c) => c.id === id);
    if (!target) return { ok: false, reason: 'nothingToUndo' };
    if (target.undoneAt !== undefined) return { ok: false, reason: 'alreadyUndone' };
    if (target !== newest) return { ok: false, reason: 'notNewest' };
  }
  if (!newest) return { ok: false, reason: 'nothingToUndo' };
  if (!sameContent(state, newest.after)) return { ok: false, reason: 'conflict' };
  const restored = structuredClone(newest.before);
  return {
    ok: true,
    state: { ...restored, version: state.version + 1 },
    change: { ...newest, undoneAt: now },
  };
}

/**
 * Back to the default program as a change (so it can be undone): the plan and rotation are
 * re-seeded from `program`; rest weekdays and dated overrides stay.
 */
export function resetToProgram(
  state: TrainerState,
  program: Program,
  now: number,
  source: PlanChange['source'] = 'chip',
): ChangeResult {
  const seed = seedPlan(program);
  const next: TrainerState = {
    version: state.version,
    plan: seed.plan,
    schedule: { rotation: seed.schedule.rotation, restWeekdays: [...state.schedule.restWeekdays] },
    overrides: state.overrides,
    ...(state.blocks ? { blocks: state.blocks } : {}),
  };
  const after = commit(state, next, now);
  const change: TrainerChange = {
    createdAt: now,
    action: 'reset',
    title: RESET_TITLE,
    source,
    before: structuredClone(state),
    after: structuredClone(after),
  };
  return { ok: true, state: after, change };
}
