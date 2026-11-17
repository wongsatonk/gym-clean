/**
 * M10 action "Not today / move session" (SPEC M10 goal 2). Pure: `today` is a local `YYYY-MM-DD`
 * passed in. Built on the plan.ts calendar, where rest days never use up a rotation day:
 *
 * - `pushWeek`: a rest override on today. Today's day moves to the next training date and every
 *   later one slides with it; the last one of the 7 days spills into next week.
 * - `useRestDay`: the same, plus a bare `{ date }` override (= train that date with the pending
 *   rotation day) on the first rest date in the next 6 days, so the 7 days keep every session.
 *   With no such date (no rest weekdays, or already used by an earlier postpone) it slides the
 *   week like `pushWeek` and the why says so.
 * - `to`: "Move to <date>" — today rests and that date (1–6 days ahead, a rest date) trains.
 *
 * The preview is the 7 days from today, before → after. Nothing is proposed on a rest date, with a
 * session started or finished today, or with an empty rotation; the reply says why.
 */
import {
  addDate,
  calendar,
  effectiveDay,
  localDate,
  type CalendarEntry,
  type PlanSession,
  weekdayOf,
} from '../plan';
import type { DayOverride, Proposal, TrainerState } from '../../types';

export type PostponeMode = 'useRestDay' | 'pushWeek';

export type PostponeOpts = {
  mode: PostponeMode;
  /** "Move to <date>": a local `YYYY-MM-DD` 1–6 days after today. Wins over `mode`. */
  to?: string;
};

export type PostponeRefusal =
  'restDay' | 'sessionStarted' | 'alreadyDone' | 'noDay' | 'badDate' | 'dateTaken';

export type PostponeResult =
  { ok: true; proposal: Proposal } | { ok: false; reason: PostponeRefusal; reply: string };

/** Days in the before → after preview (today included). */
export const PREVIEW_DAYS = 7;

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

const shortDay = (date: string): string => SHORT[weekdayOf(date)] ?? date;
const longDay = (date: string): string => LONG[weekdayOf(date)] ?? date;

const SAY = 'Done. Today is a rest day.';

function refuse(reason: PostponeRefusal, reply: string): PostponeResult {
  return { ok: false, reason, reply };
}

export function proposePostpone(
  state: TrainerState,
  sessions: readonly PlanSession[],
  today: string,
  opts: PostponeOpts,
): PostponeResult {
  const todays = sessions.filter((s) => localDate(s.startedAt) === today);
  if (todays.some((s) => s.endedAt === undefined))
    return refuse('sessionStarted', "Finish or end today's workout first.");
  if (todays.length > 0) return refuse('alreadyDone', "Today's workout is already done.");

  const eff = effectiveDay(state, sessions, today);
  if (state.schedule.rotation.length === 0) return refuse('noDay', "There's no workout to move.");
  if (eff.rest) return refuse('restDay', 'Today is already a rest day.');
  if (!eff.day) return refuse('noDay', "There's no workout to move.");

  const nameOf = (dayId: string | null): string =>
    state.plan.days.find((d) => d.id === dayId)?.name ?? dayId ?? 'Rest';
  const before = calendar(state, sessions, today, PREVIEW_DAYS);

  // The date that becomes a training day, if any.
  let trainDate: string | null = null;
  if (opts.to !== undefined) {
    const last = addDate(today, PREVIEW_DAYS - 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.to) || opts.to <= today || opts.to > last)
      return refuse('badDate', 'Pick a day in the next week.');
    const target = before.find((e) => e.date === opts.to);
    if (target && !target.rest)
      return refuse(
        'dateTaken',
        `${longDay(opts.to)} already has ${nameOf(target.dayId)}. Pick a rest day.`,
      );
    trainDate = opts.to;
  } else if (opts.mode === 'useRestDay') {
    trainDate = before.find((e) => e.date > today && e.rest && !e.override?.rest)?.date ?? null;
  }

  // M12: block dates don't slide; today's block day moves as itself (the block's version).
  const inBlock = eff.blockId !== undefined;
  if (inBlock && opts.to === undefined && opts.mode === 'pushWeek') trainDate = null;
  const touched = new Set([today, ...(trainDate ? [trainDate] : [])]);
  const added: DayOverride[] = [{ date: today, rest: true }];
  if (trainDate) added.push(inBlock ? { date: trainDate, dayId: eff.day.id } : { date: trainDate });
  const next: TrainerState = {
    ...structuredClone(state),
    overrides: [...structuredClone(state.overrides).filter((o) => !touched.has(o.date)), ...added],
  };
  const after = calendar(next, sessions, today, PREVIEW_DAYS);

  const label = (e: CalendarEntry) =>
    `${shortDay(e.date)}: ${e.rest ? 'Rest' : nameOf(e.dayId)}${e.done ? ' (done)' : ''}`;
  const lines = before.map((b, i) => {
    const a = after[i];
    return { before: label(b), after: a ? label(a) : label(b) };
  });

  const moved = eff.day.name;
  const lands = after.find((e) => e.date > today && !e.rest && e.dayId === eff.day?.id);
  const movedTo = lands
    ? `${moved} moves to ${longDay(lands.date)}`
    : `${moved} moves to next week`;
  let why: string;
  if (inBlock && !trainDate) {
    why = `${moved} is skipped. The rest of your focus block stays as planned.`;
  } else if (trainDate) {
    why = `${movedTo}. ${longDay(trainDate)} becomes a training day, so you keep every session.`;
  } else {
    const left = after.filter((e) => !e.rest && e.dayId !== null).map((e) => e.dayId);
    const spill: string[] = [];
    for (const e of before) {
      if (e.rest || e.dayId === null) continue;
      const k = left.indexOf(e.dayId);
      if (k >= 0) left.splice(k, 1);
      else spill.push(nameOf(e.dayId));
    }
    const lead =
      opts.mode === 'useRestDay' ? 'No rest day left this week, so the week slides a day. ' : '';
    const tail = spill.length > 0 ? ` ${spill.join(' and ')} moves to next week.` : '';
    why = `${lead}${movedTo} and the rest follow.${tail}`;
  }

  return {
    ok: true,
    proposal: {
      action: 'postpone',
      scope: 'dated',
      title:
        opts.to !== undefined && trainDate
          ? `Not today: train ${longDay(trainDate)} instead`
          : 'Not today',
      lines,
      why,
      say: SAY,
      next,
      baseVersion: state.version,
    },
  };
}
