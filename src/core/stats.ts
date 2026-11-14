/**
 * M4e Home/Summary selectors (pure). Takes session rows + set logs; time (`today`, ms) is passed
 * in. Weeks are Mon–Sun in the device's local time zone. Only finished sessions (`endedAt` set)
 * count anywhere.
 */
import type { SetLog } from './types';

/** Workouts a Mon–Sun week needs to keep the streak (provisional: Blockers A-q1). */
export const STREAK_MIN_PER_WEEK = 3;

/** The fields the selectors need; `SessionRow` from src/data/db.ts fits. */
export type StatsSession = {
  sessionId: string;
  dayId: string;
  startedAt: number;
  endedAt?: number;
};

export type WeekDotState = 'done' | 'today' | 'rest' | 'future';
/** `dayStart` = local midnight of that day (ms). */
export type WeekDot = { dayStart: number; state: WeekDotState };

export type LastSessionInfo = {
  sessionId: string;
  dayId: string;
  /** startedAt (ms). */
  date: number;
  durationMs: number;
  volumeKg: number;
};

export type NewBest = {
  exerciseId: string;
  /** 'weight' = heavier than before; 'reps' = more reps at the old best weight. */
  kind: 'weight' | 'reps';
  weightKg: number;
  reps: number;
  old: { weightKg: number; reps: number };
};

/** Weights within this many kg are the same (lb-entered weights are stored as odd kg). */
const WEIGHT_EPS_KG = 0.01;

const isFinished = (s: StatsSession): boolean => s.endedAt !== undefined;

function dayStartOf(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Local midnight of the Monday starting the week that holds `ms`. */
function weekStartOf(ms: number): number {
  const d = new Date(ms);
  const sinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday).getTime();
}

/** `n` local days after the local midnight `dayStart` (DST-safe). */
function addDays(dayStart: number, n: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

/**
 * Consecutive Mon–Sun weeks with ≥ `minPerWeek` finished sessions, counted back from the
 * current week. The current week adds 1 once it qualifies; while it hasn't yet, it doesn't
 * break the streak (counting starts from last week).
 */
export function weeklyStreak(
  sessions: readonly StatsSession[],
  today: number,
  minPerWeek: number = STREAK_MIN_PER_WEEK,
): number {
  const perWeek = new Map<number, number>();
  for (const s of sessions) {
    if (!isFinished(s) || s.startedAt > today) continue;
    const w = weekStartOf(s.startedAt);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const qualifies = (w: number) => (perWeek.get(w) ?? 0) >= minPerWeek;
  let week = weekStartOf(today);
  let streak = 0;
  if (qualifies(week)) streak = 1;
  week = addDays(week, -7);
  while (qualifies(week)) {
    streak++;
    week = addDays(week, -7);
  }
  return streak;
}

/** The current Mon–Sun week: `done` (a finished session that day), else today / rest / future. */
export function weekDots(sessions: readonly StatsSession[], today: number): WeekDot[] {
  const todayStart = dayStartOf(today);
  const doneDays = new Set(sessions.filter(isFinished).map((s) => dayStartOf(s.startedAt)));
  const monday = weekStartOf(today);
  return Array.from({ length: 7 }, (_, i) => {
    const dayStart = addDays(monday, i);
    const state: WeekDotState = doneDays.has(dayStart)
      ? 'done'
      : dayStart === todayStart
        ? 'today'
        : dayStart < todayStart
          ? 'rest'
          : 'future';
    return { dayStart, state };
  });
}

/** Σ reps × kg. Bodyweight sets (0 kg) add 0. */
export function sessionVolume(logs: readonly SetLog[]): number {
  return logs.reduce((sum, l) => sum + l.reps * l.weightKg, 0);
}

/** Rounded percent change vs the previous same-day session; null with no previous volume. */
export function volumeVsLast(
  logs: readonly SetLog[],
  prevSameDayLogs: readonly SetLog[],
): number | null {
  const prev = sessionVolume(prevSameDayLogs);
  if (prevSameDayLogs.length === 0 || prev <= 0) return null;
  return Math.round(((sessionVolume(logs) - prev) / prev) * 100);
}

/** The latest finished session of the same day id that started before `sessionId`. */
export function previousSameDaySession(
  sessions: readonly StatsSession[],
  sessionId: string,
): StatsSession | null {
  const cur = sessions.find((s) => s.sessionId === sessionId);
  if (!cur) return null;
  let best: StatsSession | null = null;
  for (const s of sessions) {
    if (s.sessionId === sessionId || s.dayId !== cur.dayId || !isFinished(s)) continue;
    if (s.startedAt >= cur.startedAt) continue;
    if (!best || s.startedAt > best.startedAt) best = s;
  }
  return best;
}

/** The latest finished session (by start) with its length and volume; null if none. */
export function lastSession(
  sessions: readonly StatsSession[],
  sets: readonly SetLog[],
): LastSessionInfo | null {
  let last: StatsSession | null = null;
  for (const s of sessions) {
    if (isFinished(s) && (!last || s.startedAt > last.startedAt)) last = s;
  }
  if (!last || last.endedAt === undefined) return null;
  const id = last.sessionId;
  return {
    sessionId: id,
    dayId: last.dayId,
    date: last.startedAt,
    durationMs: Math.max(0, last.endedAt - last.startedAt),
    volumeKg: sessionVolume(sets.filter((l) => l.sessionId === id)),
  };
}

type Top = { weightKg: number; reps: number };

/** Heaviest set, then most reps at that weight (0-rep sets ignored). */
function topSet(logs: readonly SetLog[]): Top | null {
  let top: Top | null = null;
  for (const l of logs) {
    if (l.reps <= 0) continue;
    if (
      !top ||
      l.weightKg > top.weightKg + WEIGHT_EPS_KG ||
      (Math.abs(l.weightKg - top.weightKg) <= WEIGHT_EPS_KG && l.reps > top.reps)
    )
      top = { weightKg: l.weightKg, reps: l.reps };
  }
  return top;
}

/**
 * Per exercise done today (in today's order): a new best when today's top set is heavier than
 * the history's, or has more reps at the same weight. More reps at a lower weight isn't a best.
 * An exercise without history has no best. History rows from today's sessions are ignored.
 */
export function newBests(todayLogs: readonly SetLog[], historyLogs: readonly SetLog[]): NewBest[] {
  const todaySessions = new Set(todayLogs.map((l) => l.sessionId));
  const order: string[] = [];
  for (const l of todayLogs) if (!order.includes(l.exerciseId)) order.push(l.exerciseId);
  const out: NewBest[] = [];
  for (const exerciseId of order) {
    const now = topSet(todayLogs.filter((l) => l.exerciseId === exerciseId));
    const old = topSet(
      historyLogs.filter((l) => l.exerciseId === exerciseId && !todaySessions.has(l.sessionId)),
    );
    if (!now || !old) continue;
    const heavier = now.weightKg > old.weightKg + WEIGHT_EPS_KG;
    const sameWeight = Math.abs(now.weightKg - old.weightKg) <= WEIGHT_EPS_KG;
    if (!heavier && !(sameWeight && now.reps > old.reps)) continue;
    out.push({
      exerciseId,
      kind: heavier ? 'weight' : 'reps',
      weightKg: now.weightKg,
      reps: now.reps,
      old: { weightKg: old.weightKg, reps: old.reps },
    });
  }
  return out;
}
