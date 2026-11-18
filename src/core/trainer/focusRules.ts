/**
 * M12 focus-block rules as data (SPEC M12 goal 6, Decision "M12 plan"). Every number is a default
 * tuned at Checkpoint I (M12-q3). The builder in focusBlock.ts reads only these.
 */
export const FOCUS_RULES = {
  /** Focus group's weekly sets vs his current plan: the target, and the allowed band. */
  setsFactor: 1.4,
  minFactor: 1.3,
  maxFactor: 1.5,
  /** The focus group trains on at least this many days each block week. */
  minFocusDays: 2,
  /** Added work: a row never goes above this many sets ("+1 set up to the cap"). */
  maxSetsPerExercise: 5,
  /** Added work: a session's focus-group sets stay at or below this (never cut below his own). */
  maxFocusSetsPerSession: 12,
  /** Added work: a session's total sets stay at or below this. */
  maxSetsPerSession: 26,
  /** An added focus exercise has at least this many sets. */
  minAddedSets: 2,
  /** Weekly target when his plan has no sets for the group at all. */
  emptyBaseSets: 6,
  /** Sets / reps / rest for an added exercise when his plan has nothing like it. */
  defaultRow: { sets: 3, targetReps: [10, 12] as [number, number], restSec: 60 },
  weeks: { min: 2, max: 6 },
  weekdays: { min: 3, max: 6 },
  /** "This month" = 4 weeks. */
  monthWeeks: 4,
  /** Training weekdays per count (0 = Sunday), used for "only N days a week". */
  defaultWeekdays: {
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
  } as Record<number, readonly number[]>,
  /** "Keep my days" without rest weekdays: his weekdays over this many days back. */
  historyDays: 28,
  /**
   * Added exercises of a group: these ids first (after the plan's own), then catalog order.
   * Core: a loadable cable move first, then floor/bench moves (M13c task 6).
   */
  prefer: {
    core: [
      'Cable_Crunch',
      'Flat_Bench_Lying_Leg_Raise',
      'Dead_Bug',
      'Reverse_Crunch',
      'Crunches',
      'Air_Bike',
    ],
  } as { readonly core: readonly string[] } & Partial<Record<string, readonly string[]>>,
  /**
   * M13c "Also add abs?" Yes (Decision "M13c answers", q3): abs rows on another group's block,
   * one row a day on the lightest days, until the week has `emptyBaseSets` abs sets on at least
   * `minDays` days. The main group's rows are never touched; the rows end with the block.
   */
  alsoCore: {
    group: 'core',
    sets: 3,
    targetReps: [10, 15] as [number, number],
    restSec: 60,
    minDays: 2,
  },
} as const;
