/**
 * M10 persistence: the trainer state (one row, key 'current') and the plan change log.
 * The pure Apply / Undo / Reset logic is in src/core/trainer/changes.ts; this only stores results.
 *
 * Re-seeding (M10-q11): when program.json's hash differs from `plan.seededFrom`,
 * - an unedited plan is re-seeded (plan + rotation from the new program; rest weekdays and dated
 *   overrides kept; version + 1 so older proposals go stale). No change record: it isn't the
 *   user's change, and Undo of older changes then reports 'conflict' instead of undoing it;
 * - an edited plan is kept as is; `defaultProgramChanged` tells the UI to offer
 *   "a new default program is available" (Use it = resetToProgram / Keep mine).
 */
import type { PlanChange, Program, TrainerState } from '../core/types';
import { programHash, seedPlan } from '../core/trainer/plan';
import type { GymDb } from './db';

const KEY = 'current';

function isTrainerState(v: unknown): v is TrainerState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<TrainerState>;
  return (
    typeof s.version === 'number' &&
    typeof s.plan === 'object' &&
    s.plan !== null &&
    Array.isArray(s.plan.days) &&
    typeof s.plan.seededFrom === 'string' &&
    typeof s.schedule === 'object' &&
    s.schedule !== null &&
    Array.isArray(s.schedule.rotation) &&
    Array.isArray(s.schedule.restWeekdays) &&
    Array.isArray(s.overrides)
  );
}

/** True when the stored plan came from another program.json than `program` (edited plans only stay so). */
export function defaultProgramChanged(state: TrainerState, program: Program): boolean {
  // A starter plan (M12 1b intake) isn't built from the default program, so its updates don't apply.
  if (state.plan.seededFrom?.startsWith('starter:')) return false;
  return state.plan.seededFrom !== programHash(program);
}

export async function saveTrainerState(db: GymDb, state: TrainerState): Promise<void> {
  await db.trainer.put({ key: KEY, state });
}

/**
 * The current trainer state. Seeds (and stores) it on first read or when the stored row is
 * unreadable; re-seeds an unedited plan when the program changed (see the file comment).
 */
export async function loadTrainerState(db: GymDb, program: Program): Promise<TrainerState> {
  return db.transaction('rw', db.trainer, async () => {
    const stored = (await db.trainer.get(KEY))?.state;
    if (!isTrainerState(stored)) {
      const seed = seedPlan(program);
      await saveTrainerState(db, seed);
      return seed;
    }
    if (stored.plan.edited || !defaultProgramChanged(stored, program)) return stored;
    const seed = seedPlan(program);
    const next: TrainerState = {
      version: stored.version + 1,
      plan: seed.plan,
      schedule: { rotation: seed.schedule.rotation, restWeekdays: stored.schedule.restWeekdays },
      overrides: stored.overrides,
    };
    await saveTrainerState(db, next);
    return next;
  });
}

/** Adds a change, or rewrites it when it has an `id` (e.g. an undo's `undoneAt`). Returns the id. */
export async function saveChange(db: GymDb, change: PlanChange): Promise<number> {
  return db.planChanges.put(change);
}

/**
 * Stores the new state and the change in one transaction: after Apply / Reset (`change` new)
 * or Undo (`change` = the undone record with its id and `undoneAt`). Returns the change id.
 */
export async function commitChange(
  db: GymDb,
  state: TrainerState,
  change: PlanChange,
): Promise<number> {
  return db.transaction('rw', db.trainer, db.planChanges, async () => {
    await saveTrainerState(db, state);
    return saveChange(db, change);
  });
}

/** Changes newest first (createdAt, then id), at most `limit` of them (all when omitted). */
export async function listChanges(db: GymDb, limit?: number): Promise<PlanChange[]> {
  const q = db.planChanges.orderBy('createdAt').reverse();
  return limit === undefined ? q.toArray() : q.limit(Math.max(0, Math.floor(limit))).toArray();
}
