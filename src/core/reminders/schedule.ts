/**
 * M12 slice 2 reminders (SPEC M12 trainer-kit item 6, Decision "M12 slices 1b + 2"). Pure: the
 * settings, trainer state, sessions, set logs and `now` are passed in; the native bridge
 * (src/native/reminders.ts) schedules and cancels what this returns.
 *
 * - Everything is off by default (`DEFAULT_REMINDERS`); `mergeReminders` reads the stored row.
 * - Window: today … today + 13 (local dates). Nothing is scheduled at or before `now`.
 * - Session: at his time on each projected training day (completion.ts: `planned` and counted
 *   toward the week, so rest days and a week's days off get none), not today once a finished
 *   session started today. Text names the plan day.
 * - Missed day: at 09:00 the next day, keyed by the missed date, so each miss is nudged once.
 *   Only yesterday (when it was missed and not answered with Move it / Skip it, same rule as
 *   completion.ts `missedDay`) and today (while it's still a planned, not-done training day: the
 *   next plan run cancels it once he trains).
 * - Sunday recap: 19:00 each Sunday in the window.
 * - `cancel`: every id the window could hold plus `pending` (ids the phone still holds), minus
 *   what's scheduled; so turning one off cancels its ids.
 * - Times are local wall clock (`new Date(y, m, d, h, min)`), so DST never moves them.
 * - Ids: `${kind}:${YYYY-MM-DD}`; the notification number is `KIND_CODE[kind] × 1e8 + yyyymmdd`
 *   (fits a 32-bit int), see `reminderNumericId` / `reminderIdFromNumber`.
 */
import {
  dayCompletion,
  missedDay,
  periodScore,
  type CompletionInput,
} from '../progress/completion';
import { addDate, baseDay, localDate, weekdayOf } from '../trainer/plan';
import type { ReminderKind, ReminderSettings } from '../types';
import { reminderText } from './copy';

export const REMINDER_WINDOW_DAYS = 14;
export const MISSED_DAY_TIME = '09:00';
export const SUNDAY_RECAP_TIME = '19:00';
export const DEFAULT_SESSION_TIME = '18:00';

export const DEFAULT_REMINDERS: ReminderSettings = {
  session: { on: false, time: DEFAULT_SESSION_TIME },
  missedDay: { on: false },
  sundayRecap: { on: false },
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The stored settings row merged over the defaults; junk fields fall back to the default. */
export function mergeReminders(raw: unknown): ReminderSettings {
  const r = isObj(raw) ? raw : {};
  const onOf = (v: unknown): boolean => isObj(v) && v.on === true;
  const s = isObj(r.session) ? r.session : {};
  const time = typeof s.time === 'string' && TIME.test(s.time) ? s.time : DEFAULT_SESSION_TIME;
  return {
    session: { on: onOf(r.session), time },
    missedDay: { on: onOf(r.missedDay) },
    sundayRecap: { on: onOf(r.sundayRecap) },
    ...(r.askedPermission === true ? { askedPermission: true } : {}),
  };
}

// ---------- ids ----------

export const KIND_CODE: Record<ReminderKind, number> = { session: 1, missedDay: 2, sundayRecap: 3 };
const ID_BASE = 100_000_000;
const ID_RE = /^(session|missedDay|sundayRecap):(\d{4})-(\d{2})-(\d{2})$/;

export const reminderId = (kind: ReminderKind, date: string): string => `${kind}:${date}`;

/** The notification number for a string id; throws on an id that isn't a reminder id. */
export function reminderNumericId(id: string): number {
  const m = ID_RE.exec(id);
  if (!m) throw new Error(`Not a reminder id: ${id}`);
  const kind = m[1] as ReminderKind;
  return KIND_CODE[kind] * ID_BASE + Number(`${m[2]}${m[3]}${m[4]}`);
}

/** The string id for a notification number, or null when it isn't one of ours. */
export function reminderIdFromNumber(n: number): string | null {
  if (!Number.isInteger(n) || n <= 0) return null;
  const code = Math.floor(n / ID_BASE);
  const kind = (Object.keys(KIND_CODE) as ReminderKind[]).find((k) => KIND_CODE[k] === code);
  if (!kind) return null;
  const ymd = String(n % ID_BASE).padStart(8, '0');
  const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  const [y, mo, d] = [Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)), Number(ymd.slice(6, 8))];
  if (y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (addDate(date, 0) !== date) return null;
  return reminderId(kind, date);
}

// ---------- plan ----------

export type PlannedReminder = {
  id: string;
  numericId: number;
  kind: ReminderKind;
  /** Session / Sunday: the day it's about. Missed day: the missed date. */
  date: string;
  /** ms since epoch (local wall-clock time). */
  at: number;
  title: string;
  body: string;
};

export type ReminderPlanInput = Omit<CompletionInput, 'today' | 'catalog'> & {
  /** settings 'coach' `answeredMissed` (Move it / Skip it dates). */
  answeredMissed?: readonly string[];
  /** Ids the phone still has pending. */
  pending?: readonly string[];
};

export type ReminderPlan = { schedule: PlannedReminder[]; cancel: string[] };

/** Local time of `date` at 'HH:MM'. */
function at(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  return new Date(y, mo - 1, d, h, mi).getTime();
}

export function reminderPlan(
  settings: ReminderSettings,
  input: ReminderPlanInput,
  now: number,
): ReminderPlan {
  const today = localDate(now);
  const c: CompletionInput = {
    state: input.state,
    sessions: input.sessions,
    sets: input.sets,
    today,
  };
  const dates = Array.from({ length: REMINDER_WINDOW_DAYS }, (_, i) => addDate(today, i));
  const yesterday = addDate(today, -1);
  const doneToday = input.sessions.some(
    (s) => s.endedAt !== undefined && localDate(s.startedAt) === today,
  );
  const training = (date: string): string | null => {
    const day = dayCompletion(c, date);
    if (day.status !== 'planned' || day.dayId === null) return null;
    if (periodScore(c, date, date).sessionsPlanned !== 1) return null;
    return day.dayId;
  };
  const nameOf = (date: string, dayId: string) => baseDay(input.state, date, dayId)?.name;

  const schedule: PlannedReminder[] = [];
  const add = (kind: ReminderKind, date: string, when: number, dayName?: string) => {
    if (when <= now) return;
    const id = reminderId(kind, date);
    schedule.push({
      id,
      numericId: reminderNumericId(id),
      kind,
      date,
      at: when,
      ...reminderText(kind, dayName),
    });
  };

  if (settings.session.on) {
    const time = TIME.test(settings.session.time) ? settings.session.time : DEFAULT_SESSION_TIME;
    for (const date of dates) {
      if (date === today && doneToday) continue;
      const dayId = training(date);
      if (dayId !== null) add('session', date, at(date, time), nameOf(date, dayId));
    }
  }

  if (settings.missedDay.on) {
    const miss = missedDay(c, input.answeredMissed ?? []);
    if (miss && miss.date === yesterday)
      add('missedDay', yesterday, at(today, MISSED_DAY_TIME), miss.name);
    const todayId = doneToday ? null : training(today);
    if (todayId !== null)
      add('missedDay', today, at(addDate(today, 1), MISSED_DAY_TIME), nameOf(today, todayId));
  }

  if (settings.sundayRecap.on) {
    for (const date of dates)
      if (weekdayOf(date) === 0) add('sundayRecap', date, at(date, SUNDAY_RECAP_TIME));
  }

  schedule.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const keep = new Set(schedule.map((r) => r.id));
  const window = [
    ...dates.map((d) => reminderId('session', d)),
    reminderId('missedDay', yesterday),
    reminderId('missedDay', today),
    ...dates.filter((d) => weekdayOf(d) === 0).map((d) => reminderId('sundayRecap', d)),
    ...(input.pending ?? []),
  ];
  const cancel = [...new Set(window)].filter((id) => !keep.has(id));
  return { schedule, cancel };
}
