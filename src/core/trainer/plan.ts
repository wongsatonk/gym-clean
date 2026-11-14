/**
 * M10 plan, schedule and calendar (SPEC M10 goal 1). Pure: dates are local `YYYY-MM-DD` strings
 * passed in; only `localDate(ms)` reads the device's time zone (through `Date`'s local getters).
 *
 * Calendar rules:
 * - The rotation pointer starts after the last **finished** session that started before
 *   `fromDate` (unfinished sessions are ignored). A day id that isn't in the rotation restarts it,
 *   like the pre-M10 "last session + 1" (app.ts loadUpNext).
 * - Walking forward one date at a time:
 *   1. a date with a finished session is `done` with that session's day (the latest one that
 *      date), and the rotation continues after it;
 *   2. else the newest override for the date: `rest` → rest; otherwise a training day (also on a
 *      rest weekday) running `override.dayId`, or the pending rotation day when it has none. A
 *      `dayId` that is in the rotation moves the pointer to after it;
 *   3. else a rest weekday → rest;
 *   4. else the pending rotation day.
 * - Rest days never use up a rotation day, so missed days don't skip any.
 */
import type { DayAdjust, DayOverride, Program, ProgramDay, TrainerState } from '../types';

/** M10-q1 (provisional): Sunday. 0 = Sunday … 6 = Saturday. */
export const DEFAULT_REST_WEEKDAYS: readonly number[] = [0];

/** The session fields the calendar needs; `SessionRow` from src/data/db.ts fits. */
export type PlanSession = {
  sessionId?: string;
  dayId: string;
  startedAt: number;
  endedAt?: number;
};

export type CalendarEntry = {
  date: string;
  /** null on rest dates. */
  dayId: string | null;
  rest: boolean;
  /** A finished session started on this date. */
  done: boolean;
  /** The override that applied to this date, if any. */
  override?: DayOverride;
};

export type EffectiveDay = {
  date: string;
  rest: boolean;
  done: boolean;
  /**
   * The day Start runs, with any adjust override applied. On a rest date it's the pending
   * rotation day ("Train anyway"). null when the id isn't in the plan or the rotation is empty.
   */
  day: ProgramDay | null;
  adjusted: DayAdjust['kind'] | null;
  override?: DayOverride;
};

// ---------- local dates ----------

const pad = (v: number, w = 2) => String(v).padStart(w, '0');

/** Local `YYYY-MM-DD` of the instant `ms` (device time zone). */
export function localDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parts(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** `n` calendar days after `date` (pure date arithmetic, no time zone, so DST can't shift it). */
export function addDate(date: string, n: number): string {
  const [y, m, d] = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ---------- seeding ----------

/** FNV-1a (32-bit) of the program's JSON, as 8 hex chars: `UserPlan.seededFrom`. */
export function programHash(program: Program): string {
  const s = JSON.stringify(program);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A fresh trainer state from the program: a deep copy, rotation = program order. */
export function seedPlan(program: Program): TrainerState {
  const days = structuredClone(program.days);
  return {
    version: 0,
    plan: { days, seededFrom: programHash(program), edited: false },
    schedule: { rotation: days.map((d) => d.id), restWeekdays: [...DEFAULT_REST_WEEKDAYS] },
    overrides: [],
  };
}

// ---------- calendar ----------

type Projected = CalendarEntry & { pending: string | null };

function project(
  state: TrainerState,
  sessions: readonly PlanSession[],
  fromDate: string,
  days: number,
): Projected[] {
  const { rotation, restWeekdays } = state.schedule;
  const after = (dayId: string): number => {
    const i = rotation.indexOf(dayId);
    return rotation.length === 0 ? 0 : (i + 1) % rotation.length;
  };

  // The latest finished session per local date, and the latest one before fromDate.
  const byDate = new Map<string, PlanSession>();
  let lastBefore: PlanSession | null = null;
  for (const s of sessions) {
    if (s.endedAt === undefined) continue;
    const date = localDate(s.startedAt);
    if (date < fromDate) {
      if (!lastBefore || s.startedAt > lastBefore.startedAt) lastBefore = s;
    } else {
      const cur = byDate.get(date);
      if (!cur || s.startedAt > cur.startedAt) byDate.set(date, s);
    }
  }
  // The newest override per date (later in the array = newer).
  const overrides = new Map<string, DayOverride>();
  for (const o of state.overrides) overrides.set(o.date, o);

  let ptr = lastBefore ? after(lastBefore.dayId) : 0;
  const out: Projected[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDate(fromDate, i);
    const pending = rotation[ptr] ?? null;
    const override = overrides.get(date);
    const base = { date, pending, ...(override ? { override } : {}) };
    const session = byDate.get(date);
    if (session) {
      out.push({ ...base, dayId: session.dayId, rest: false, done: true });
      ptr = after(session.dayId);
    } else if (override?.rest) {
      out.push({ ...base, dayId: null, rest: true, done: false });
    } else if (override) {
      const dayId = override.dayId ?? pending;
      out.push({ ...base, dayId, rest: dayId === null, done: false });
      if (dayId !== null && (override.dayId === undefined || rotation.includes(dayId)))
        ptr = after(dayId);
    } else if (restWeekdays.includes(weekdayOf(date)) || pending === null) {
      out.push({ ...base, dayId: null, rest: true, done: false });
    } else {
      out.push({ ...base, dayId: pending, rest: false, done: false });
      ptr = after(pending);
    }
  }
  return out;
}

/** `days` consecutive dates from `fromDate`, each a training day, a rest day or done. */
export function calendar(
  state: TrainerState,
  sessions: readonly PlanSession[],
  fromDate: string,
  days: number,
): CalendarEntry[] {
  return project(state, sessions, fromDate, days).map((e) => ({
    date: e.date,
    dayId: e.dayId,
    rest: e.rest,
    done: e.done,
    ...(e.override ? { override: e.override } : {}),
  }));
}

/** The plan day by id, with an adjust override's exercises applied. */
function resolve(
  state: TrainerState,
  dayId: string | null,
  adjust: DayAdjust | undefined,
): ProgramDay | null {
  const d = dayId === null ? undefined : state.plan.days.find((x) => x.id === dayId);
  if (!d) return null;
  return adjust ? { ...d, exercises: adjust.exercises } : d;
}

/** What `date` runs. For today, pass today's local date. */
export function effectiveDay(
  state: TrainerState,
  sessions: readonly PlanSession[],
  date: string,
): EffectiveDay {
  const [e] = project(state, sessions, date, 1);
  if (!e) throw new Error('unreachable: one projected day');
  const adjust = e.rest || e.done ? undefined : e.override?.adjust;
  const day = resolve(state, e.rest ? e.pending : e.dayId, adjust);
  return {
    date,
    rest: e.rest,
    done: e.done,
    day,
    adjusted: adjust && day ? adjust.kind : null,
    ...(e.override ? { override: e.override } : {}),
  };
}

/** How far ahead `upNext` looks for a training date. */
const LOOKAHEAD_DAYS = 28;

/**
 * The next date that trains and isn't done yet, from `today`, and its day id. With no overrides
 * and no rest weekdays this is today with "last finished session + 1" (the pre-M10 behaviour).
 * If nothing trains within 4 weeks, it's today with the pending rotation day, so Start always has
 * a day. null only with an empty rotation.
 */
export function upNext(
  state: TrainerState,
  sessions: readonly PlanSession[],
  today: string,
): { date: string; dayId: string } | null {
  const cal = project(state, sessions, today, LOOKAHEAD_DAYS);
  const hit = cal.find((e) => !e.rest && !e.done && e.dayId !== null);
  if (hit?.dayId) return { date: hit.date, dayId: hit.dayId };
  const pending = cal[0]?.pending ?? null;
  return pending === null ? null : { date: today, dayId: pending };
}
