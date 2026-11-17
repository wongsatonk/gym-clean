/**
 * M12 slice 2 weekly check-in (SPEC M12 trainer-kit item 6, Decision "M12 slices 1b + 2"). Pure.
 *
 * - Three questions as data (energy, sleep, soreness), each 1–5 chips labelled "Low" … "High".
 * - The check-in for a Mon–Sun week opens on its Sunday and stays open through the next Saturday
 *   (`checkInWeek`), so it's offered on the first Coach-tab open from Sunday on.
 * - Due once per week: any row for that week (answered, partly answered or skipped) closes it;
 *   skipped stays skipped for that week.
 * - The week recap gains one line from the answers ("You rated energy 4, sleep 3, soreness 2.").
 * - Answers never go into any brain context (task 4 test) or the dev log.
 */
import { addDate, weekdayOf } from '../trainer/plan';
import type { CheckIn } from '../types';

export type CheckInQuestionId = 'energy' | 'sleep' | 'soreness';
export type CheckInValue = 1 | 2 | 3 | 4 | 5;

export const CHECK_IN_QUESTIONS: readonly { id: CheckInQuestionId; label: string }[] = [
  { id: 'energy', label: 'Energy this week' },
  { id: 'sleep', label: 'Sleep this week' },
  { id: 'soreness', label: 'Soreness this week' },
];

export const CHECK_IN_SCALE = { values: [1, 2, 3, 4, 5], low: 'Low', high: 'High' } as const;

export const isCheckInValue = (v: unknown): v is CheckInValue =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;

/** Monday of the week whose check-in is open on `today` (the latest Sunday on or before it). */
export function checkInWeek(today: string): string {
  const sunday = addDate(today, -weekdayOf(today));
  return addDate(sunday, -6);
}

/** The open week's Monday when it has no row yet, else null. */
export function checkInDue(today: string, checkIns: readonly CheckIn[]): string | null {
  const week = checkInWeek(today);
  return checkIns.some((c) => c.weekStart === week) ? null : week;
}

const answered = (c: CheckIn) => CHECK_IN_QUESTIONS.filter((q) => c[q.id] !== undefined);

export function checkInStatus(c: CheckIn | undefined): 'none' | 'skipped' | 'answered' {
  if (!c) return 'none';
  if (c.skipped) return 'skipped';
  return answered(c).length > 0 ? 'answered' : 'none';
}

/** "You rated energy 4, sleep 3, soreness 2." (answered questions only), else null. */
export function checkInLine(c: CheckIn | undefined): string | null {
  if (!c || c.skipped) return null;
  const parts = answered(c).map((q) => `${q.id} ${String(c[q.id])}`);
  return parts.length > 0 ? `You rated ${parts.join(', ')}.` : null;
}
