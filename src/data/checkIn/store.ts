/**
 * M12 slice 2 weekly check-in storage (Dexie v11 `checkIns`, keyed by the week's Monday).
 * Backed up; never in the dev log or any brain context. Rules in src/core/checkIn/checkIn.ts.
 *
 * - `saveCheckIn` stores the answers given (1–5 each); no answers at all → a skipped row.
 *   Saving again replaces earlier answers, but never a skipped week (skipped stays skipped), and
 *   an empty save (a skip) never replaces answers.
 * - `skipCheckIn` never overwrites answers.
 * - Both refuse a week that isn't a Monday (YYYY-MM-DD) or a value outside 1–5 (RangeError).
 */
import { CHECK_IN_QUESTIONS, isCheckInValue } from '../../core/checkIn/checkIn';
import { weekdayOf } from '../../core/trainer/plan';
import type { CheckIn } from '../../core/types';
import type { GymDb } from '../db';

export type CheckInAnswers = Pick<CheckIn, 'weekStart' | 'energy' | 'sleep' | 'soreness'>;

function assertMonday(weekStart: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || weekdayOf(weekStart) !== 1)
    throw new RangeError(`Not a Monday: ${weekStart}`);
}

export async function getCheckIn(db: GymDb, weekStart: string): Promise<CheckIn | undefined> {
  return db.checkIns.get(weekStart);
}

/** Oldest week first. */
export async function listCheckIns(db: GymDb): Promise<CheckIn[]> {
  return db.checkIns.orderBy('weekStart').toArray();
}

export async function saveCheckIn(
  db: GymDb,
  answers: CheckInAnswers,
  now: number,
): Promise<CheckIn> {
  assertMonday(answers.weekStart);
  const row: CheckIn = { weekStart: answers.weekStart, at: now };
  for (const q of CHECK_IN_QUESTIONS) {
    const v: unknown = answers[q.id];
    if (v === undefined) continue;
    if (!isCheckInValue(v)) throw new RangeError(`${q.id} must be 1–5`);
    row[q.id] = v;
  }
  if (!CHECK_IN_QUESTIONS.some((q) => row[q.id] !== undefined)) row.skipped = true;
  return db.transaction('rw', db.checkIns, async () => {
    const old = await db.checkIns.get(row.weekStart);
    if (old && (old.skipped || row.skipped)) return old;
    await db.checkIns.put(row);
    return row;
  });
}

export async function skipCheckIn(db: GymDb, weekStart: string, now: number): Promise<CheckIn> {
  assertMonday(weekStart);
  return db.transaction('rw', db.checkIns, async () => {
    const old = await db.checkIns.get(weekStart);
    if (old) return old;
    const row: CheckIn = { weekStart, skipped: true, at: now };
    await db.checkIns.put(row);
    return row;
  });
}
