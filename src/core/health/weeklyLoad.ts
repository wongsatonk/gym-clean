/**
 * M11 weekly load (SPEC M11 "Outside workouts → weekly load"): this Mon–Sun week's finished gym
 * sessions plus the outside workouts Health knows about. Pure; `today` (ms) is passed in.
 *
 * Nothing is counted twice:
 * - a Health workout that overlaps a finished Gym Clean session in time (± OVERLAP_SLACK_MS, e.g.
 *   WHOOP auto-detecting the same lifting session) is that session, not an outside workout;
 * - workouts written by Gym Clean itself are dropped by the native plugin by bundle id
 *   (src/native/health.ts; `HealthWorkout` keeps no bundle id); here a second guard skips them
 *   by source name;
 * - the same workout stored twice (same start, kind and source) counts once.
 */
import { addDays, isFinished, weekStartOf, type StatsSession } from '../stats';
import type { HealthDay, HealthWorkout } from '../types';

/** A session as the load needs it; `SessionRow` from src/data/db.ts fits. */
export type LoadSession = StatsSession;

/**
 * Source names of workouts Gym Clean writes (compared case-insensitively with
 * `HealthWorkout.source`, which is the app name). Bundle ids don't belong here: the plugin
 * already drops our own bundle id before a workout reaches core.
 */
export const GYM_CLEAN_SOURCES: readonly string[] = ['Gym Clean'];

/** A Health workout this close to a gym session (before its start / after its end) is that session. */
export const OVERLAP_SLACK_MS = 10 * 60_000;

export type WeeklyLoad = {
  /** Finished Gym Clean sessions this week (up to `today`). */
  gymSessions: number;
  /** Outside workouts this week, by start time. */
  outside: HealthWorkout[];
  /** Sum of `outside` minutes. */
  outsideMinutes: number;
};

const OWN = new Set(GYM_CLEAN_SOURCES.map((s) => s.toLowerCase()));

/** True for a workout Gym Clean wrote itself (by source name). */
export const isOwnWorkout = (w: HealthWorkout): boolean => OWN.has(w.source.toLowerCase());

/**
 * True when `w` overlaps one of the finished `sessions` in time (± OVERLAP_SLACK_MS): it is that
 * gym session logged again by another app (e.g. WHOOP), not an outside workout. Unfinished
 * sessions never match.
 */
export function overlapsGymSession(w: HealthWorkout, sessions: readonly LoadSession[]): boolean {
  const wEnd = w.start + w.minutes * 60_000;
  return sessions.some(
    (s) =>
      s.endedAt !== undefined &&
      w.start < s.endedAt + OVERLAP_SLACK_MS &&
      wEnd > s.startedAt - OVERLAP_SLACK_MS,
  );
}

export function weeklyLoad(input: {
  sessions: readonly LoadSession[];
  healthDays: readonly HealthDay[];
  today: number;
}): WeeklyLoad {
  const start = weekStartOf(input.today);
  const end = addDays(start, 7);
  const inWeek = (t: number): boolean => t >= start && t < end && t <= input.today;

  const gym = input.sessions.filter((s) => isFinished(s) && inWeek(s.startedAt));

  const seen = new Set<string>();
  const outside: HealthWorkout[] = [];
  for (const day of input.healthDays) {
    for (const w of day.workouts ?? []) {
      if (!Number.isFinite(w.start) || !Number.isFinite(w.minutes) || !inWeek(w.start)) continue;
      if (isOwnWorkout(w)) continue;
      const id = `${w.start}|${w.kind}|${w.source}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (overlapsGymSession(w, gym)) continue;
      outside.push(w);
    }
  }
  outside.sort((a, b) => a.start - b.start);
  return {
    gymSessions: gym.length,
    outside,
    outsideMinutes: outside.reduce((sum, w) => sum + w.minutes, 0),
  };
}
