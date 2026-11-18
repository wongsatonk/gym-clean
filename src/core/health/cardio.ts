/**
 * M12 1b cardio minutes (trainer-kit item 11): "Cardio this week: 95 min" on the week strip and
 * the Calendar's week score. Pure; display only. The number never enters a coach or brain
 * context (M11 build Decision (8)).
 *
 * Counted: Health workouts of a cardio kind (`CARDIO_KINDS`, data) that start in the Mon–Sun
 * week. Nothing is counted twice, by the same rules as the weekly load (weeklyLoad.ts): a
 * workout overlapping a finished Gym Clean session is that session, workouts Gym Clean wrote
 * are skipped, and the same workout stored twice counts once.
 */
import { addDays, weekStartOf } from '../stats';
import type { HealthDay } from '../types';
import { isOwnWorkout, overlapsGymSession, type LoadSession } from './weeklyLoad';

/**
 * HealthKit activity names (as the native plugin sends them) that count as cardio: steady
 * heart-rate work and field / court / water sports. Strength, core, stretching, mind-and-body
 * kinds and "other" don't.
 */
export const CARDIO_KINDS: readonly string[] = [
  'running',
  'walking',
  'hiking',
  'cycling',
  'handCycling',
  'swimming',
  'rowing',
  'elliptical',
  'stairClimbing',
  'stairs',
  'stepTraining',
  'jumpRope',
  'mixedCardio',
  'highIntensityIntervalTraining',
  'crossTraining',
  'cardioDance',
  'socialDance',
  'fitnessGaming',
  'kickboxing',
  'boxing',
  'martialArts',
  'wheelchairWalkPace',
  'wheelchairRunPace',
  'trackAndField',
  'crossCountrySkiing',
  'downhillSkiing',
  'snowboarding',
  'snowSports',
  'skatingSports',
  'paddleSports',
  'surfingSports',
  'waterFitness',
  'waterPolo',
  'waterSports',
  'soccer',
  'basketball',
  'tennis',
  'badminton',
  'squash',
  'racquetball',
  'pickleball',
  'tableTennis',
  'volleyball',
  'handball',
  'hockey',
  'lacrosse',
  'rugby',
  'americanFootball',
  'australianFootball',
  'discSports',
  'climbing',
];

const kindKey = (kind: string): string => kind.replace(/^HKWorkoutActivityType/, '').toLowerCase();
const CARDIO = new Set(CARDIO_KINDS.map(kindKey));

/** True for a Health workout kind that counts as cardio (see `CARDIO_KINDS`). */
export const isCardioKind = (kind: string): boolean => CARDIO.has(kindKey(kind));

/**
 * Cardio minutes (whole) in the Mon–Sun week that holds `weekStart` (ms; any moment of the week
 * works, local time, DST-safe). `sessions`: his Gym Clean sessions, so the same hour logged by
 * another app isn't counted. Null when there is no Health workout data at all (Health off, the
 * web app, or workouts never read): the line is hidden. 0 when workouts are read but none is
 * cardio this week.
 */
export function weeklyCardioMinutes(
  healthDays: readonly HealthDay[] | null | undefined,
  sessions: readonly LoadSession[],
  weekStart: number,
): number | null {
  if (!healthDays?.some((d) => d.workouts !== undefined)) return null;
  const start = weekStartOf(weekStart);
  const end = addDays(start, 7);

  const seen = new Set<string>();
  let minutes = 0;
  for (const day of healthDays) {
    for (const w of day.workouts ?? []) {
      if (!Number.isFinite(w.start) || !Number.isFinite(w.minutes) || w.minutes <= 0) continue;
      if (w.start < start || w.start >= end) continue;
      if (!isCardioKind(w.kind) || isOwnWorkout(w)) continue;
      const id = `${w.start}|${w.kind}|${w.source}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (overlapsGymSession(w, sessions)) continue;
      minutes += w.minutes;
    }
  }
  return Math.round(minutes);
}

/** The display line, or null when there is nothing to show (no Health). */
export function cardioLine(minutes: number | null): string | null {
  return minutes === null ? null : `Cardio this week: ${Math.max(0, Math.round(minutes))} min`;
}
