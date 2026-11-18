/**
 * M6 History selectors (pure). Takes session rows + set logs; time (`today`, ms) is passed in.
 * Days and Mon–Sun weeks are local time, using the stats.ts helpers (DST-safe). Unfinished
 * sessions, 0-rep sets and warm-up sets (M12 1b) never count. Bodyweight sets (0 kg) have reps but no volume.
 *
 * `exerciseHistory` / `exercisesWithHistory` only see sets, so feed them sets of finished
 * sessions: `finishedSets(sessions, sets)`, or `finishedHistorySince` in src/data/db.ts.
 */
import {
  type StatsSession,
  type Top,
  addDays,
  dayStartOf,
  isFinished,
  sessionVolume,
  topSet,
  WEIGHT_EPS_KG,
  weekStartOf,
} from './stats';
import type { SetLog } from './types';
import { isWarmup } from './warmup';

/** One finished session in the "last N days" list. */
export type DaySession = {
  sessionId: string;
  dayId: string;
  startedAt: number;
  /** Local midnight of the day it started. */
  dayStart: number;
  /** endedAt − startedAt, never negative. */
  durationMs: number;
  /** Sets with ≥ 1 rep. */
  setCount: number;
  /** Σ reps × kg; bodyweight sets add 0. */
  volumeKg: number;
  /** Exercise ids in the order first done. */
  exercises: string[];
  /** Rounded mean of the sets' focus scores; null when no set has one (no camera sets). */
  avgFocus: number | null;
};

export type HistorySet = {
  weightKg: number;
  /** M13b: for a one-sided set, the lower side (what both sides reached). */
  reps: number;
  focusScore: number | null;
  /** M13b: a one-sided set's per-side counts, for "R 12 · L 11"; absent on other sets. */
  sides?: SetLog['sides'];
};

/** One session of one exercise. */
export type ExerciseSessionEntry = {
  sessionId: string;
  /** Start of the exercise's first set in that session (ms). */
  date: number;
  /** Local midnight of `date`. */
  dayStart: number;
  /** Weight × reps, in start order. */
  sets: HistorySet[];
  /** Heaviest set, then most reps at that weight. */
  topSet: Top;
  volumeKg: number;
  /** The sets' focus scores, in start order (camera sets only). */
  focusScores: number[];
  avgFocus: number | null;
};

export type ExerciseTrend = {
  /** The best top set in the window; an equal later set keeps the earlier session. */
  bestSet: (Top & { sessionId: string; date: number }) | null;
  /** Last session's volume − first session's; null with fewer than 2 sessions. */
  volumeChangeKg: number | null;
  /** Rounded percent of the first session's volume; null with < 2 sessions or first volume 0. */
  volumeChangePct: number | null;
  /** Rounded mean of every focus score in the window; null when none. */
  avgFocus: number | null;
};

export type ExerciseHistory = {
  exerciseId: string;
  /** Oldest first (left to right on a trend chart). */
  sessions: ExerciseSessionEntry[];
  trend: ExerciseTrend;
};

/** A set History shows: ≥ 1 rep and not a warm-up (M12 1b). */
const counts = (l: SetLog): boolean => l.reps > 0 && !isWarmup(l);

function avg(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

const focusOf = (logs: readonly SetLog[]): number[] =>
  logs.flatMap((l) => (l.focusScore === undefined ? [] : [l.focusScore]));

const byStart = (a: SetLog, b: SetLog): number =>
  a.startedAt - b.startedAt || a.setIndex - b.setIndex;

/** Local midnight that opens the "last `days` days" (today counts as one). */
export function lastDaysStart(today: number, days = 7): number {
  return addDays(dayStartOf(today), -(days - 1));
}

/** Local midnight of the Monday opening the current Mon–Sun week and the `weeks − 1` before it. */
export function historyWindowStart(today: number, weeks = 4): number {
  return addDays(weekStartOf(today), -7 * (weeks - 1));
}

/** Sets whose session is in `sessions` and finished. */
export function finishedSets<T extends SetLog>(
  sessions: readonly StatsSession[],
  sets: readonly T[],
): T[] {
  const done = new Set(sessions.filter(isFinished).map((s) => s.sessionId));
  return sets.filter((l) => done.has(l.sessionId));
}

/** Finished sessions started in the last `days` local days up to the end of today, newest first. */
export function lastDays(
  sessions: readonly StatsSession[],
  sets: readonly SetLog[],
  today: number,
  days = 7,
): DaySession[] {
  const start = lastDaysStart(today, days);
  const end = addDays(dayStartOf(today), 1);
  const bySession = new Map<string, SetLog[]>();
  for (const l of sets) {
    if (!counts(l)) continue;
    const list = bySession.get(l.sessionId);
    if (list) list.push(l);
    else bySession.set(l.sessionId, [l]);
  }
  return sessions
    .filter((s) => isFinished(s) && s.startedAt >= start && s.startedAt < end)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((s) => {
      const logs = [...(bySession.get(s.sessionId) ?? [])].sort(byStart);
      return {
        sessionId: s.sessionId,
        dayId: s.dayId,
        startedAt: s.startedAt,
        dayStart: dayStartOf(s.startedAt),
        durationMs: Math.max(0, (s.endedAt ?? s.startedAt) - s.startedAt),
        setCount: logs.length,
        volumeKg: sessionVolume(logs),
        exercises: [...new Set(logs.map((l) => l.exerciseId))],
        avgFocus: avg(focusOf(logs)),
      };
    });
}

/** Counting sets started inside the `weeks` window, up to the end of today. */
function inWindow(sets: readonly SetLog[], today: number, weeks: number): SetLog[] {
  const start = historyWindowStart(today, weeks);
  const end = addDays(dayStartOf(today), 1);
  return sets.filter((l) => counts(l) && l.startedAt >= start && l.startedAt < end);
}

/** One exercise over the last `weeks` Mon–Sun weeks, per session, with a trend summary. */
export function exerciseHistory(
  sets: readonly SetLog[],
  exerciseId: string,
  today: number,
  weeks = 4,
): ExerciseHistory {
  const bySession = new Map<string, SetLog[]>();
  for (const l of inWindow(sets, today, weeks)) {
    if (l.exerciseId !== exerciseId) continue;
    const list = bySession.get(l.sessionId);
    if (list) list.push(l);
    else bySession.set(l.sessionId, [l]);
  }
  const entries: ExerciseSessionEntry[] = [];
  for (const [sessionId, raw] of bySession) {
    const logs = [...raw].sort(byStart);
    const top = topSet(logs);
    const first = logs[0];
    if (!top || !first) continue;
    const focusScores = focusOf(logs);
    entries.push({
      sessionId,
      date: first.startedAt,
      dayStart: dayStartOf(first.startedAt),
      sets: logs.map((l) => {
        const out: HistorySet = {
          weightKg: l.weightKg,
          reps: l.reps,
          focusScore: l.focusScore ?? null,
        };
        if (l.sides) {
          out.sides = {};
          for (const k of ['right', 'left'] as const) {
            const c = l.sides[k];
            if (c) out.sides[k] = { reps: c.reps, partials: c.partials };
          }
        }
        return out;
      }),
      topSet: top,
      volumeKg: sessionVolume(logs),
      focusScores,
      avgFocus: avg(focusScores),
    });
  }
  entries.sort((a, b) => a.date - b.date);

  // Same order as topSet (heavier, then more reps at the same weight); strict, so the
  // earliest of equal sets wins.
  let bestEntry: ExerciseSessionEntry | undefined;
  for (const e of entries) {
    const b = bestEntry?.topSet;
    if (
      !b ||
      e.topSet.weightKg > b.weightKg + WEIGHT_EPS_KG ||
      (Math.abs(e.topSet.weightKg - b.weightKg) <= WEIGHT_EPS_KG && e.topSet.reps > b.reps)
    )
      bestEntry = e;
  }

  const firstE = entries[0];
  const lastE = entries.at(-1);
  const twoPlus = entries.length >= 2 && firstE !== undefined && lastE !== undefined;
  const volumeChangeKg = twoPlus ? lastE.volumeKg - firstE.volumeKg : null;
  const volumeChangePct =
    twoPlus && volumeChangeKg !== null && firstE.volumeKg > 0
      ? Math.round((volumeChangeKg / firstE.volumeKg) * 100)
      : null;

  return {
    exerciseId,
    sessions: entries,
    trend: {
      bestSet: bestEntry
        ? { ...bestEntry.topSet, sessionId: bestEntry.sessionId, date: bestEntry.date }
        : null,
      volumeChangeKg,
      volumeChangePct,
      avgFocus: avg(entries.flatMap((e) => e.focusScores)),
    },
  };
}

/** Exercise ids with a counting set in the last `weeks` Mon–Sun weeks, most recently done first. */
export function exercisesWithHistory(sets: readonly SetLog[], today: number, weeks = 4): string[] {
  const latest = new Map<string, number>();
  for (const l of inWindow(sets, today, weeks)) {
    const prev = latest.get(l.exerciseId);
    if (prev === undefined || l.startedAt > prev) latest.set(l.exerciseId, l.startedAt);
  }
  return [...latest.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
