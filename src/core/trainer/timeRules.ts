/**
 * M12 1b time rules as data (SPEC M12 trainer kit item 5). Every number is a default he can
 * correct after Checkpoint J. `estimate.ts` and the short-on-time action read only these; the
 * rest between sets always comes from the plan row (`restSec`).
 */
export type TimeRules = {
  /** Seconds one rep takes (lift + lower), counted at the top of the row's rep range. */
  secPerRep: number;
  /** Seconds to set up one exercise: get the kit, adjust it, walk over. */
  setupSec: number;
  /** Rest between sets of a paired accessory (`PlannedExercise.pairWith`). */
  pairRestSec: number;
};

export const TIME_RULES: TimeRules = {
  secPerRep: 3,
  setupSec: 90,
  pairRestSec: 45,
};

/** "Short on time" (actions/shortOnTime.ts). */
export const SHORT_ON_TIME = {
  /** The session lengths offered, in minutes. A typed length snaps to the nearest lower one. */
  options: [20, 30, 45],
  /** The main lifts kept whole: the day's first exercises of this kind, at most this many. */
  mainLifts: 2,
  mainMechanic: 'compound',
  /** Trimmed rows keep at least this many sets. */
  minSets: 2,
  /** A typed length outside this range isn't a session length ("rest 2 minutes"). */
  typedMinutes: { min: 5, max: 180 },
} as const;
