// Made-up Calendar data for the render tests and the dev-only harness (calendar.harness.html).
// November 2026, "today" Thu 19: done, partly, missed, rest, extra, planned and a chest focus
// block from Mon 16. Not imported by the app.
import { addDate, weekdayOf } from '../../core/trainer/plan';
import type { DayCompletion, PeriodScore } from '../../core/types';

export const FIX_TODAY = '2026-11-19';
export const FIX_MONTH = '2026-11';

export const FIX_NAMES: Record<string, string> = {
  bench: 'Dumbbell Bench Press',
  row: 'One-Arm Dumbbell Row',
  pushup: 'Push-up',
  curl: 'Hammer Curl',
  pushA: 'Push A',
  pullA: 'Pull A',
};
export const fixName = (id: string): string => FIX_NAMES[id] ?? id;

const PLAN = [
  { exerciseId: 'bench', sets: 5, reps: [8, 12] as [number, number] },
  { exerciseId: 'row', sets: 5, reps: [10, 12] as [number, number] },
  { exerciseId: 'pushup', sets: 4, reps: [10, 15] as [number, number] },
  { exerciseId: 'curl', sets: 4, reps: [10, 12] as [number, number] },
];

/** Sets logged per exercise for a day (same order as PLAN). */
function day(
  date: string,
  status: DayCompletion['status'],
  logged: number[] = [],
  blockId?: string,
): DayCompletion {
  if (status === 'rest')
    return {
      date,
      status,
      dayId: null,
      setsPlanned: 0,
      setsDone: 0,
      exercises: [],
      ...(blockId ? { blockId } : {}),
    };
  const exercises = PLAN.map((p, i) => {
    const n = logged[i] ?? 0;
    const reps = Array.from({ length: n }, (_, k) => p.reps[1] - (k % 3));
    return {
      exerciseId: p.exerciseId,
      setsPlanned: status === 'extra' ? 0 : p.sets,
      setsDone: n,
      repsTarget: p.reps,
      reps,
      status: (n === 0 ? 'missed' : n >= p.sets ? 'done' : 'partial') as
        'done' | 'partial' | 'missed',
    };
  }).filter((e) => status !== 'extra' || e.setsDone > 0);
  const setsPlanned = exercises.reduce((a, e) => a + e.setsPlanned, 0);
  const setsDone =
    status === 'extra'
      ? exercises.reduce((a, e) => a + e.setsDone, 0)
      : exercises.reduce((a, e) => a + Math.min(e.setsDone, e.setsPlanned), 0);
  return {
    date,
    status,
    dayId: weekdayOf(date) % 2 === 0 ? 'pullA' : 'pushA',
    ...(blockId ? { blockId } : {}),
    setsPlanned,
    setsDone,
    exercises,
  };
}

const FULL = [5, 5, 4, 4];

/** Every date of November 2026. Training Mon/Tue/Thu/Fri/Sat; Wed + Sun rest. */
export function fixtureMonth(): DayCompletion[] {
  const out: DayCompletion[] = [];
  for (let d = '2026-11-01'; d.startsWith('2026-11'); d = addDate(d, 1)) {
    const wd = weekdayOf(d);
    const block = d >= '2026-11-16' && d <= '2026-11-29' ? 'b1' : undefined;
    const train = wd !== 0 && wd !== 3;
    if (d === '2026-11-15') out.push(day(d, 'extra', [3, 3, 0, 0]));
    else if (!train) out.push(day(d, 'rest', [], block));
    else if (d === '2026-11-06') out.push(day(d, 'partial', [5, 5, 2, 0]));
    else if (d === '2026-11-10') out.push(day(d, 'missed', [], block));
    else if (d === '2026-11-17') out.push(day(d, 'partial', [5, 4, 4, 0], block));
    else if (d < FIX_TODAY) out.push(day(d, 'done', FULL, block));
    else out.push(day(d, 'planned', [], block));
  }
  return out;
}

export const FIX_WEEK: PeriodScore = {
  from: '2026-11-16',
  to: '2026-11-22',
  sessionsPlanned: 5,
  sessionsDone: 2,
  setsPlanned: 36,
  setsDone: 31,
  extra: 0,
  focus: { group: 'chest', sets: 9, target: 20 },
};

export const FIX_MONTH_SCORE: PeriodScore = {
  from: '2026-11-01',
  to: '2026-11-30',
  sessionsPlanned: 21,
  sessionsDone: 11,
  setsPlanned: 216,
  setsDone: 193,
  extra: 1,
  focus: { group: 'chest', sets: 9, target: 40 },
};
