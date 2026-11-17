/**
 * M11 "Lighter today?" (SPEC M11). Pure: today's signals against his own baselines, the
 * 2-signal rule, the deload nudge (fired on ≥ 3 of the 7 days before today, at most once per
 * 14 days), once per day, and no card on a rest day or mid-workout. The card only chooses which
 * existing M10 proposal to offer; it never applies anything.
 */
import { addDate } from '../trainer/plan';
import type { HealthDay, ReadinessCard, ReadinessSignal } from '../types';
import { baseline, workoutKcalBaseline } from './baseline';
import { deloadReason, reasonText, SIGNAL_ORDER, type SignalDetail } from './copy';
import { HEALTH_RULES, type HealthRules } from './rules';
import { isOwnWorkout, overlapsGymSession, type LoadSession } from './weeklyLoad';

const HOUR = 3_600_000;
const EPS = 1e-9;
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Today's signals with the size of each change, in `SIGNAL_ORDER`. Missing data → no signal.
 * `gymSessions`: his Gym Clean sessions; a Health workout overlapping a finished one (WHOOP
 * logging the same lifting) is that session, not an outside workout (same rule as weeklyLoad).
 */
export function readinessSignals(
  days: readonly HealthDay[],
  date: string,
  now: number,
  rules: HealthRules = HEALTH_RULES,
  gymSessions: readonly LoadSession[] = [],
): SignalDetail[] {
  const out: SignalDetail[] = [];
  const t = days.find((d) => d.date === date);

  if (t?.sleepMin !== undefined) {
    const usual = baseline(days, date, 'sleepMin', undefined, rules);
    if (usual !== undefined && usual - t.sleepMin >= rules.sleepShortMin - EPS) {
      out.push({ signal: 'sleepShort', shortByMin: Math.round(usual - t.sleepMin) });
    }
  }
  if (t?.hrvMs !== undefined) {
    const usual = baseline(days, date, 'hrvMs', t.hrvSource, rules);
    if (usual !== undefined && usual > 0) {
      const lower = (usual - t.hrvMs) / usual;
      if (lower >= rules.hrvLowShare - EPS)
        out.push({ signal: 'hrvLow', lowerByPct: round1(lower * 100) });
    }
  }
  if (t?.restingHr !== undefined) {
    const usual = baseline(days, date, 'restingHr', undefined, rules);
    if (usual !== undefined && t.restingHr - usual >= rules.restingHrHighBpm - EPS) {
      out.push({ signal: 'restingHrHigh', higherByBpm: round1(t.restingHr - usual) });
    }
  }

  // Outside workouts that ended in the last N hours (looked up by time, not by row date).
  const from = addDate(date, -2);
  const kcalUsual = workoutKcalBaseline(days, date, rules);
  const hard = days
    .filter((d) => d.date >= from && d.date <= date)
    .flatMap((d) => d.workouts ?? [])
    .filter((w) => !isOwnWorkout(w) && !overlapsGymSession(w, gymSessions))
    .filter((w) => {
      const end = w.start + w.minutes * 60_000;
      return w.start <= now && end <= now && end > now - rules.hardWorkoutWindowH * HOUR;
    })
    .filter(
      (w) =>
        w.minutes >= rules.hardWorkoutMin ||
        (kcalUsual !== undefined &&
          w.kcal !== undefined &&
          w.kcal >= rules.hardWorkoutKcalFactor * kcalUsual - EPS),
    )
    .sort((a, b) => b.minutes - a.minutes);
  const longest = hard[0];
  if (longest)
    out.push({ signal: 'hardOutsideWorkout', kind: longest.kind, minutes: longest.minutes });

  if (t?.whoopRecoveryPct !== undefined && t.whoopRecoveryPct <= rules.whoopLowPct) {
    out.push({ signal: 'whoopLow' });
  }
  return out.sort((a, b) => SIGNAL_ORDER.indexOf(a.signal) - SIGNAL_ORDER.indexOf(b.signal));
}

/** Local noon of `date`: the moment a past day's card is judged at (device time zone). */
function noonOf(date: string): number {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

/** On how many of the `deloadWindowDays` days before `date` the 2-signal rule fired. */
export function firedDaysBefore(
  days: readonly HealthDay[],
  date: string,
  rules: HealthRules = HEALTH_RULES,
  gymSessions: readonly LoadSession[] = [],
): number {
  let n = 0;
  for (let i = 1; i <= rules.deloadWindowDays; i++) {
    const d = addDate(date, -i);
    if (readinessSignals(days, d, noonOf(d), rules, gymSessions).length >= rules.minSignals) n++;
  }
  return n;
}

export type ReadinessHistory = {
  /** The card already made (and shown) most recently; kept as is for the rest of its day. */
  lastCard?: ReadinessCard;
  /** The date he answered a card (any of its three buttons): no card again that day. */
  answeredDate?: string;
  /** The date a Deload card was last offered. */
  lastDeloadOfferDate?: string;
};

export type ReadinessInput = {
  /** Local YYYY-MM-DD. */
  date: string;
  /** Epoch ms (passed in, never read inside). */
  now: number;
  days: readonly HealthDay[];
  /** Today is a training day in his plan. */
  trainingDay: boolean;
  /** A workout is running: never show the card. */
  inWorkout?: boolean;
  history?: ReadinessHistory;
  rules?: HealthRules;
  /** His Gym Clean sessions (finished ones are matched against Health workouts). */
  gymSessions?: readonly LoadSession[];
};

/** Today's card, or null. */
export function readinessCard(input: ReadinessInput): ReadinessCard | null {
  const { date, now, days, history = {}, rules = HEALTH_RULES, gymSessions = [] } = input;
  if (!input.trainingDay || input.inWorkout) return null;
  if (history.answeredDate === date) return null;
  if (history.lastCard?.date === date) return history.lastCard;

  const details = readinessSignals(days, date, now, rules, gymSessions);
  if (details.length < rules.minSignals) return null;

  const reasons = details.map(reasonText);
  const fired = firedDaysBefore(days, date, rules, gymSessions);
  const last = history.lastDeloadOfferDate;
  const spaced = last === undefined || addDate(last, rules.deloadSpacingDays) <= date;
  const deload = fired >= rules.deloadFiredDays && spaced;
  if (deload) reasons.push(deloadReason(fired, rules.deloadWindowDays));

  const signals: ReadinessSignal[] = details.map((d) => d.signal);
  return { date, signals, reasons, offer: deload ? 'deload' : 'lighter' };
}
