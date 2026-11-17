/**
 * M12 "Do it today" and "Move" (SPEC M12 Calendar day actions, Today's missed-day "Move it").
 * Pure: `today` is a local `YYYY-MM-DD` passed in. Both write dated overrides only, so Apply /
 * Undo go through changes.ts like every other proposal (`scope: 'dated'`; Move is `action:
 * 'postpone'`, Do it today `action: 'doToday'` since Checkpoint J).
 *
 * - `findPlanDay(text)`: a plan day from what a person or model wrote: its id, its name (any case,
 *   "Push B day"), or the first word(s) of names ("push"): then the one coming up soonest after
 *   today that isn't today's own day.
 * - `proposeDoToday(dayId)`: `{ date: today, dayId }`. On a focus-block date that runs the block's
 *   version of the day (plan.ts), replacing today's block day; elsewhere the rotation carries on
 *   after it. Refused with a session started or done today, an unknown day, or when today already
 *   runs that day.
 * - `proposeMoveDay(from, to)`: a planned, not-done date `from` (today or later) to `to`, both
 *   within `MOVE_HORIZON_DAYS` of today.
 *   - Focus-block date: exact. `from` rests and `to` runs the block's version of the day (any
 *     lighter / swap adjust on `from` comes along). `to` must be a rest date of the same block;
 *     earlier or later both work.
 *   - Rotation date: the rotation keeps its order, so `from` rests and the days after it slide.
 *     `to` must be later and either a rest date (it becomes a training day, so every session is
 *     kept, like Not today "Move to") or the very next training date (a plain slide). A focus-block
 *     `to` is refused.
 */
import {
  addDate,
  baseDay,
  blockAt,
  calendar,
  effectiveDay,
  localDate,
  type CalendarEntry,
  type PlanSession,
  weekdayOf,
} from '../plan';
import type { DayOverride, ProgramDay, Proposal, TrainerState } from '../../types';

/** How far ahead (days after today) a date can be moved from or to. */
export const MOVE_HORIZON_DAYS = 42;

/** Days in the Do-it-today preview, and the minimum for a move's preview. */
const PREVIEW_DAYS = 7;

export type MoveRefusal =
  | 'sessionStarted'
  | 'alreadyDone'
  | 'noDay'
  | 'alreadyToday'
  | 'badDate'
  | 'sameDay'
  | 'notPlanned'
  | 'dateTaken'
  | 'outsideBlock';

export type MoveResult =
  { ok: true; proposal: Proposal } | { ok: false; reason: MoveRefusal; reply: string };

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const dayOfMonth = (date: string) => Number(date.slice(8, 10));
/** "Friday 13". */
export const longDate = (date: string): string =>
  `${LONG[weekdayOf(date)] ?? date} ${dayOfMonth(date)}`;
const shortDate = (date: string): string => `${SHORT[weekdayOf(date)] ?? date} ${dayOfMonth(date)}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAY_TODAY = 'Done. New workout today.';
const SAY_MOVE = 'Done. Workout moved.';

function refuse(reason: MoveRefusal, reply: string): MoveResult {
  return { ok: false, reason, reply };
}

/** Refusal for today's sessions, or null. */
function todayBusy(sessions: readonly PlanSession[], today: string): MoveResult | null {
  const todays = sessions.filter((s) => localDate(s.startedAt) === today);
  if (todays.some((s) => s.endedAt === undefined))
    return refuse('sessionStarted', "Finish or end today's workout first.");
  if (todays.length > 0) return refuse('alreadyDone', "Today's workout is already done.");
  return null;
}

const nameAt = (state: TrainerState, date: string, dayId: string | null): string =>
  dayId === null ? 'Rest' : (baseDay(state, date, dayId)?.name ?? dayId);

function label(state: TrainerState, e: CalendarEntry): string {
  return `${shortDate(e.date)}: ${e.rest ? 'Rest' : nameAt(state, e.date, e.dayId)}${e.done ? ' (done)' : ''}`;
}

/** Before → after lines for the dates `lo`…`hi`; past 7 lines only the changed ones. */
function previewLines(
  before: TrainerState,
  after: TrainerState,
  sessions: readonly PlanSession[],
  today: string,
  lo: string,
  hi: string,
): Proposal['lines'] {
  let span = 0;
  for (let d = today; d <= hi; d = addDate(d, 1)) span++;
  const b = calendar(before, sessions, today, span).filter((e) => e.date >= lo);
  const a = calendar(after, sessions, today, span).filter((e) => e.date >= lo);
  const lines = b.map((e, i) => {
    const x = a[i];
    return { before: label(before, e), after: x ? label(after, x) : label(before, e) };
  });
  return lines.length > PREVIEW_DAYS ? lines.filter((l) => l.before !== l.after) : lines;
}

function withOverrides(state: TrainerState, dates: string[], added: DayOverride[]): TrainerState {
  const touched = new Set(dates);
  return {
    ...structuredClone(state),
    overrides: [
      ...structuredClone(state.overrides).filter((o) => !touched.has(o.date)),
      ...structuredClone(added),
    ],
  };
}

// ---------- do it today ----------

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\u0e00-\u0e7f]+/g, ' ')
    .trim()
    .replace(/\s+(day|workout|session)$/, '');

/** How far ahead a bare "push" looks for the next push day. */
const FIND_DAYS = 14;

export function findPlanDay(
  state: TrainerState,
  sessions: readonly PlanSession[],
  today: string,
  text: string,
): ProgramDay | undefined {
  const want = norm(text);
  if (want === '') return undefined;
  const days = state.plan.days;
  const exact = days.find((d) => norm(d.id) === want || norm(d.name) === want);
  if (exact) return exact;
  const starts = (s: string) => `${norm(s)} `.startsWith(`${want} `);
  const hits = days.filter((d) => starts(d.name) || starts(d.id));
  if (hits.length <= 1) return hits[0];
  const cal = calendar(state, sessions, today, FIND_DAYS);
  const current = cal[0]?.rest ? null : cal[0]?.dayId;
  const next = (id: string) => {
    const i = cal.findIndex((e) => e.date > today && !e.rest && !e.done && e.dayId === id);
    return i < 0 ? Infinity : i;
  };
  const others = hits.filter((d) => d.id !== current);
  return [...(others.length > 0 ? others : hits)].sort((a, b) => next(a.id) - next(b.id))[0];
}

export function proposeDoToday(
  state: TrainerState,
  sessions: readonly PlanSession[],
  today: string,
  dayId: string,
): MoveResult {
  const busy = todayBusy(sessions, today);
  if (busy) return busy;
  const day = baseDay(state, today, dayId);
  if (!day) return refuse('noDay', "That day isn't in your plan.");
  const eff = effectiveDay(state, sessions, today);
  if (!eff.rest && eff.day?.id === dayId)
    return refuse('alreadyToday', `${day.name} is already today's workout.`);

  const next = withOverrides(state, [today], [{ date: today, dayId }]);
  let why: string;
  if (eff.blockId !== undefined) {
    const lead =
      eff.rest || !eff.day
        ? `Today becomes a training day with ${day.name}.`
        : `${day.name} runs today instead of ${eff.day.name}.`;
    why = `${lead} The rest of your focus block stays as planned.`;
  } else if (eff.rest || !eff.day) {
    why = `Today becomes a training day with ${day.name}. Your rotation carries on after it.`;
  } else {
    why = `${day.name} runs today instead of ${eff.day.name}. Your rotation carries on after it.`;
  }
  return {
    ok: true,
    proposal: {
      action: 'doToday',
      scope: 'dated',
      title: `Do ${day.name} today`,
      lines: previewLines(state, next, sessions, today, today, addDate(today, PREVIEW_DAYS - 1)),
      why,
      say: SAY_TODAY,
      next,
      baseVersion: state.version,
    },
  };
}

// ---------- move a planned day ----------

export function proposeMoveDay(
  state: TrainerState,
  sessions: readonly PlanSession[],
  today: string,
  from: string,
  to: string,
): MoveResult {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return refuse('badDate', 'Pick a date to move to.');
  const last = addDate(today, MOVE_HORIZON_DAYS);
  if (from < today || to < today) return refuse('badDate', 'Pick a day from today on.');
  if (from > last || to > last) return refuse('badDate', 'Pick a day in the next six weeks.');
  if (from === to) return refuse('sameDay', "That's the same day. Pick another one.");
  if (from === today || to === today) {
    const busy = todayBusy(sessions, today);
    if (busy) return busy;
  }

  const hi = from > to ? from : to;
  let span = 0;
  for (let d = today; d <= addDate(hi, PREVIEW_DAYS); d = addDate(d, 1)) span++;
  const before = calendar(state, sessions, today, span);
  const at = (date: string) => before.find((e) => e.date === date);
  const src = at(from);
  if (!src || src.rest || src.done || src.dayId === null)
    return refuse('notPlanned', `Nothing is planned on ${longDate(from)}.`);
  const dayId = src.dayId;
  const name = nameAt(state, from, dayId);
  const dst = at(to);
  const taken = (e: CalendarEntry | undefined) =>
    refuse(
      'dateTaken',
      `${longDate(to)} already has ${e ? nameAt(state, to, e.dayId) : 'a workout'}. Pick a rest day.`,
    );

  const fromBlock = blockAt(state, from);
  const toBlock = blockAt(state, to);
  let next: TrainerState;
  let why: string;
  let title: string;
  let lo: string;
  if (fromBlock) {
    if (!toBlock || toBlock.block.id !== fromBlock.block.id)
      return refuse('outsideBlock', 'Pick a day inside your focus block.');
    if (!dst || !dst.rest) return taken(dst);
    const adjust = state.overrides.filter((o) => o.date === from).at(-1)?.adjust;
    next = withOverrides(
      state,
      [from, to],
      [
        { date: from, rest: true },
        { date: to, dayId, ...(adjust ? { adjust } : {}) },
      ],
    );
    title = `Move ${name} to ${longDate(to)}`;
    why = `${longDate(from)} becomes a rest day. The rest of your focus block stays as planned.`;
    lo = from < to ? from : to;
  } else {
    if (toBlock) return refuse('outsideBlock', `${longDate(to)} is in your focus block.`);
    if (to < from) return refuse('badDate', `Pick a day after ${longDate(from)}.`);
    const nextTraining = before.find((e) => e.date > from && !e.rest && !e.done);
    if (!dst) return taken(dst);
    if (!dst.rest && dst.date !== nextTraining?.date) return taken(dst);
    const added: DayOverride[] = [{ date: from, rest: true }];
    if (dst.rest) added.push({ date: to });
    next = withOverrides(state, dst.rest ? [from, to] : [from], added);
    const after = calendar(next, sessions, today, span);
    const lands = after.find((e) => e.date > from && !e.rest && !e.done && e.dayId === dayId);
    title = lands ? `Move ${name} to ${longDate(lands.date)}` : `Move ${name}`;
    why = dst.rest
      ? `${longDate(from)} becomes a rest day and the next days follow. ${longDate(to)} becomes a training day, so you keep every session.`
      : `${longDate(from)} becomes a rest day and the next days follow a day later.`;
    lo = from;
  }

  const end = addDate(lo, PREVIEW_DAYS - 1);
  return {
    ok: true,
    proposal: {
      action: 'postpone',
      scope: 'dated',
      title,
      lines: previewLines(state, next, sessions, today, lo, hi > end ? hi : end),
      why,
      say: SAY_MOVE,
      next,
      baseVersion: state.version,
    },
  };
}
