// M11 task 10: the weekly-load line in Today's week strip (SPEC M11 "Outside workouts → weekly
// load"): "This week: 3 gym sessions, 2 other workouts (run 40 min, football 90 min)".
// Pure render: app.ts passes core's weekly load (src/core/health/weeklyLoad.ts, which already
// de-duplicates Gym Clean's own sessions). Shown, not spoken.
//
// e2e hook: `[data-week-load]` (data-gym, data-other).
import { h } from '../dom';
import { icon } from '../icons';
import './weekLoad.css';

export type WeekLoad = {
  /** Gym Clean sessions finished this week. */
  gymSessions: number;
  /** Workouts from other apps this week (HealthKit activity name + minutes), oldest first. */
  outside: readonly { kind: string; minutes: number }[];
};

/** How many outside workouts the line names before "+N more". */
export const WEEK_LOAD_NAMED = 3;

const KIND_WORDS: Record<string, string> = {
  running: 'run',
  walking: 'walk',
  cycling: 'ride',
  swimming: 'swim',
  hiking: 'hike',
  soccer: 'football',
  americanFootball: 'American football',
  highIntensityIntervalTraining: 'HIIT',
  traditionalStrengthTraining: 'strength',
  functionalStrengthTraining: 'strength',
  crossTraining: 'cross training',
  mixedCardio: 'cardio',
  other: 'workout',
};

/** HealthKit activity name → a short word: 'running' → 'run', 'tableTennis' → 'table tennis'. */
export function kindWord(kind: string): string {
  const known = KIND_WORDS[kind];
  if (known) return known;
  const words = kind
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return words || 'workout';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "This week: 3 gym sessions, 2 other workouts (run 40 min, football 90 min)". */
export function weekLoadText(load: WeekLoad): string {
  const gym = plural(load.gymSessions, 'gym session', 'gym sessions');
  const n = load.outside.length;
  if (n === 0) return `This week: ${gym}, no other workouts`;
  const named = load.outside
    .slice(0, WEEK_LOAD_NAMED)
    .map((w) => `${kindWord(w.kind)} ${Math.round(w.minutes)} min`);
  if (n > WEEK_LOAD_NAMED) named.push(`+${n - WEEK_LOAD_NAMED} more`);
  return `This week: ${gym}, ${plural(n, 'other workout', 'other workouts')} (${named.join(', ')})`;
}

/** The line, or null without a load (Health not connected / workouts switched off). */
export function weekLoadLine(load: WeekLoad | null | undefined): HTMLElement | null {
  if (!load) return null;
  return h(
    'p',
    {
      class: 'week-load',
      'data-week-load': true,
      'data-gym': load.gymSessions,
      'data-other': load.outside.length,
    },
    icon('bars', 'sm'),
    h('span', {}, weekLoadText(load)),
  );
}
