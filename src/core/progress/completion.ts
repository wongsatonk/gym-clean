/**
 * M12 proof of completion (SPEC M12 goal 7, Decision "M12 plan"). Pure: the trainer state,
 * sessions, set logs and `today` (local YYYY-MM-DD) are passed in.
 *
 * - Planned for a date = the plan.ts projection from the current state (plan + focus blocks +
 *   dated overrides incl. lighter / deload rows + the sessions before that date). No daily
 *   snapshot is stored, so a later "from now on" edit can change how an old missed day reads;
 *   done days always use what was logged (the session's day).
 * - Done = sets logged in **finished** sessions that **started** that local date (a session past
 *   midnight counts on its start date). Unfinished sessions are ignored everywhere.
 * - Per exercise: done (all planned sets), partial (some), missed (none); a day is done when
 *   every exercise is, partial with any set logged, missed with none (past) or planned (today /
 *   future). A session on a rest date is `extra`: shown, never in a denominator.
 * - Dates before his first finished session plan nothing (rest), so a new install has no misses.
 * - Past dates are projected on their own (a missed day doesn't use up a rotation day); later
 *   dates walk forward from today, so they match the Calendar and Today.
 * - Scores: sessions planned = every training date in the period (future too); sessions done =
 *   done + partial days; sets planned / done = only days already due (done, partial, missed), so
 *   "% of planned sets" is about what was due.  An exercise's `setsDone` is what was logged; the day's
 *   `setsDone` counts each exercise up to its plan.
 * - Focus (with a catalog, while a block overlaps the period): focus-group sets logged on the
 *   block's dates in the period vs the block's weekly target × overlapping dates / 7.
 * - Weeks are Mon–Sun (same as stats.ts `weekStartOf`); date strings, so DST can't shift them.
 */
import { blockEnd, isFocusExercise } from '../trainer/focusBlock';
import {
  addDate,
  baseDay,
  effectiveDay,
  effectiveDays,
  localDate,
  weekdayOf,
} from '../trainer/plan';
import type { PlanSession } from '../trainer/plan';
import type { TrainerCatalog } from '../trainer/swapCandidates';
import type { DayCompletion, PeriodScore, PlannedExercise, SetLog, TrainerState } from '../types';

export type CompletionSession = PlanSession & { sessionId: string };
export type CompletionSet = Pick<SetLog, 'sessionId' | 'exerciseId' | 'reps'>;

export type CompletionInput = {
  state: TrainerState;
  /** `SessionRow` fits. */
  sessions: readonly CompletionSession[];
  /** `SetLog` fits. */
  sets: readonly CompletionSet[];
  /** Local YYYY-MM-DD. */
  today: string;
  /** For focus-block sets in the scores; without it, scores have no `focus`. */
  catalog?: Pick<TrainerCatalog, 'exercises' | 'areaOf'>;
};

type Prepared = {
  input: CompletionInput;
  finished: CompletionSession[];
  byDate: Map<string, CompletionSession[]>;
  setsBySession: Map<string, CompletionSet[]>;
  since: string | null;
};

const prepared = new WeakMap<CompletionInput, Prepared>();

function prepare(input: CompletionInput): Prepared {
  const hit = prepared.get(input);
  if (hit) return hit;
  const finished = input.sessions
    .filter((s) => s.endedAt !== undefined)
    .sort((a, b) => a.startedAt - b.startedAt);
  const byDate = new Map<string, CompletionSession[]>();
  for (const s of finished) {
    const d = localDate(s.startedAt);
    byDate.set(d, [...(byDate.get(d) ?? []), s]);
  }
  const setsBySession = new Map<string, CompletionSet[]>();
  for (const x of input.sets)
    setsBySession.set(x.sessionId, [...(setsBySession.get(x.sessionId) ?? []), x]);
  const first = finished[0];
  const p: Prepared = {
    input,
    finished,
    byDate,
    setsBySession,
    since: first ? localDate(first.startedAt) : null,
  };
  prepared.set(input, p);
  return p;
}

function daysBetween(from: string, to: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

/** Monday of the Mon–Sun week holding `date`. */
export function weekStart(date: string): string {
  return addDate(date, -((weekdayOf(date) + 6) % 7));
}

function rowsDone(rows: readonly PlannedExercise[], logged: readonly CompletionSet[]) {
  return rows.map((p) => {
    const reps = logged.filter((x) => x.exerciseId === p.exerciseId).map((x) => x.reps);
    const setsDone = reps.length;
    const status: 'done' | 'partial' | 'missed' =
      reps.length === 0 ? 'missed' : reps.length >= p.sets ? 'done' : 'partial';
    return {
      exerciseId: p.exerciseId,
      setsPlanned: p.sets,
      setsDone,
      repsTarget: [p.targetReps[0], p.targetReps[1]] as [number, number],
      reps,
      status,
    };
  });
}

function completionOf(p: Prepared, date: string): DayCompletion {
  const { state, today } = p.input;
  const daySessions = p.byDate.get(date) ?? [];
  const logged = daySessions.flatMap((s) => p.setsBySession.get(s.sessionId) ?? []);
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

  if (daySessions.length === 0 && (p.since === null ? date < today : date < p.since))
    return { date, status: 'rest', dayId: null, setsPlanned: 0, setsDone: 0, exercises: [] };

  // What the date planned, without its own sessions. Past dates stand alone (a missed day
  // doesn't use up a rotation day); later dates walk forward from today like the Calendar.
  const others = p.finished.filter((s) => localDate(s.startedAt) !== date);
  const planned =
    date > today
      ? (effectiveDays(state, others, today, daysBetween(today, date) + 1).at(-1) ??
        effectiveDay(state, others, date))
      : effectiveDay(state, others, date);
  const block = planned.blockId ? { blockId: planned.blockId } : {};
  const last = daySessions.at(-1);

  if (last) {
    const dayId = last.dayId;
    if (planned.rest) {
      const ids = [...new Set(logged.map((x) => x.exerciseId))];
      const ref = baseDay(state, date, dayId)?.exercises ?? [];
      const exercises = ids.map((id) => {
        const reps = logged.filter((x) => x.exerciseId === id).map((x) => x.reps);
        const t = ref.find((r) => r.exerciseId === id)?.targetReps ?? [0, 0];
        return {
          exerciseId: id,
          setsPlanned: 0,
          setsDone: reps.length,
          repsTarget: [t[0], t[1]] as [number, number],
          reps,
          status: 'done' as const,
        };
      });
      return {
        date,
        status: 'extra',
        dayId,
        ...block,
        setsPlanned: 0,
        setsDone: logged.length,
        exercises,
      };
    }
    const rows =
      planned.day && planned.day.id === dayId
        ? planned.day.exercises
        : (baseDay(state, date, dayId)?.exercises ?? []);
    const exercises = rowsDone(rows, logged);
    const setsPlanned = sum(exercises.map((e) => e.setsPlanned));
    // Sets past an exercise's plan don't count toward the day.
    const setsDone = sum(exercises.map((e) => Math.min(e.setsDone, e.setsPlanned)));
    const status =
      setsDone === 0
        ? date < today
          ? 'missed'
          : 'planned'
        : exercises.every((e) => e.status === 'done')
          ? 'done'
          : 'partial';
    return { date, status, dayId, ...block, setsPlanned, setsDone, exercises };
  }

  if (planned.rest || !planned.day)
    return {
      date,
      status: 'rest',
      dayId: null,
      ...block,
      setsPlanned: 0,
      setsDone: 0,
      exercises: [],
    };
  const exercises = rowsDone(planned.day.exercises, []);
  return {
    date,
    status: date < today ? 'missed' : 'planned',
    dayId: planned.day.id,
    ...block,
    setsPlanned: sum(exercises.map((e) => e.setsPlanned)),
    setsDone: 0,
    exercises,
  };
}

/** Planned vs done for one local date. */
export function dayCompletion(input: CompletionInput, date: string): DayCompletion {
  return completionOf(prepare(input), date);
}

/** Every date of `month` ('YYYY-MM'). */
export function monthCompletion(input: CompletionInput, month: string): DayCompletion[] {
  const p = prepare(input);
  const first = `${month}-01`;
  const out: DayCompletion[] = [];
  for (let d = first; d.startsWith(month); d = addDate(d, 1)) out.push(completionOf(p, d));
  return out;
}

/** Scores for `from`…`to` (inclusive local dates). */
export function periodScore(input: CompletionInput, from: string, to: string): PeriodScore {
  const p = prepare(input);
  const score: PeriodScore = {
    from,
    to,
    sessionsPlanned: 0,
    sessionsDone: 0,
    setsPlanned: 0,
    setsDone: 0,
    extra: 0,
  };
  for (let d = from; d <= to; d = addDate(d, 1)) {
    const c = completionOf(p, d);
    if (c.status === 'extra') score.extra++;
    if (c.status === 'rest' || c.status === 'extra') continue;
    score.sessionsPlanned++;
    if (c.status === 'done' || c.status === 'partial') score.sessionsDone++;
    if (c.status !== 'planned') {
      score.setsPlanned += c.setsPlanned;
      score.setsDone += c.setsDone;
    }
  }
  const focus = focusScore(p, from, to);
  return focus ? { ...score, focus } : score;
}

function focusScore(p: Prepared, from: string, to: string): PeriodScore['focus'] {
  const { catalog, state } = p.input;
  if (!catalog) return undefined;
  const block = [...(state.blocks ?? [])]
    .reverse()
    .find((b) => b.startDate <= to && blockEnd(b) >= from);
  if (!block) return undefined;
  const start = block.startDate > from ? block.startDate : from;
  const end = blockEnd(block) < to ? blockEnd(block) : to;
  let days = 0;
  let sets = 0;
  for (let d = start; d <= end; d = addDate(d, 1)) {
    days++;
    for (const s of p.byDate.get(d) ?? [])
      for (const x of p.setsBySession.get(s.sessionId) ?? [])
        if (isFocusExercise(x.exerciseId, block.group, catalog)) sets++;
  }
  return { group: block.group, sets, target: Math.round((block.targetSetsPerWeek * days) / 7) };
}

/** The Mon–Sun week holding `date`. */
export function weekScore(input: CompletionInput, date: string): PeriodScore {
  const from = weekStart(date);
  return periodScore(input, from, addDate(from, 6));
}

/** The calendar month 'YYYY-MM'. */
export function monthScore(input: CompletionInput, month: string): PeriodScore {
  const from = `${month}-01`;
  let to = from;
  while (addDate(to, 1).startsWith(month)) to = addDate(to, 1);
  return periodScore(input, from, to);
}

/** How far back the missed-day prompt looks. */
export const MISSED_LOOKBACK_DAYS = 7;

export type MissedDay = { date: string; dayId: string; name: string };

/**
 * The newest missed planned date in the last 7 days (before today) that is newer than every
 * answered date (Move it / Skip it), so each miss is mentioned once and older ones never return.
 */
export function missedDay(input: CompletionInput, answered: readonly string[]): MissedDay | null {
  const p = prepare(input);
  const newest = answered.reduce((m, d) => (d > m ? d : m), '');
  for (let i = 1; i <= MISSED_LOOKBACK_DAYS; i++) {
    const date = addDate(input.today, -i);
    if (date <= newest) break;
    const c = completionOf(p, date);
    if (c.status !== 'missed' || c.dayId === null) continue;
    const name = baseDay(input.state, date, c.dayId)?.name ?? c.dayId;
    return { date, dayId: c.dayId, name };
  }
  return null;
}
