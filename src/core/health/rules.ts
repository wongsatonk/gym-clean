/**
 * M11 "Lighter today?" thresholds as data (SPEC M11, defaults approved 2026-11-16).
 * Every signal compares today with his own rolling median; there are no population norms here.
 */
export const HEALTH_RULES = {
  /** Baseline window: the days before today that count toward the median. */
  baselineDays: 28,
  /** A signal needs at least this many days (values) in the window, else it stays silent. */
  minBaselineDays: 7,

  /** Sleep last night at least this many minutes under his usual. */
  sleepShortMin: 60,
  /** HRV this morning at least this share under his usual (same source only). */
  hrvLowShare: 0.15,
  /** Resting HR this morning at least this many bpm over his usual. */
  restingHrHighBpm: 5,
  /** An outside workout that ended in the last N hours counts when long or hard. */
  hardWorkoutWindowH: 24,
  /** "Long": at least this many minutes. */
  hardWorkoutMin: 60,
  /** "Hard": active energy ≥ this × his median outside workout kcal. */
  hardWorkoutKcalFactor: 1.5,
  /** Route B only: WHOOP recovery at or under this % (WHOOP's lowest band). */
  whoopLowPct: 33,

  /** M12 1b "feel today": energy (1–5) at or under this is the `feltLow` signal. */
  feelLowEnergy: 2,

  /** The card shows with at least this many signals. */
  minSignals: 2,
  /** Deload instead of Lighter when the 2-signal rule fired on ≥ N of the last M days… */
  deloadFiredDays: 3,
  deloadWindowDays: 7,
  /** …and no deload was offered in the last N days. */
  deloadSpacingDays: 14,

  /** Asleep samples closer than this belong to one sleep session (night). */
  sleepSessionGapMin: 120,
} as const;

export type HealthRules = { readonly [K in keyof typeof HEALTH_RULES]: number };
