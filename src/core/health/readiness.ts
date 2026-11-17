/**
 * M11 "Lighter today?" (SPEC M11). Pure: today's signals against his own baselines, the
 * 2-signal rule, the deload nudge (fired on ≥ 3 of the 7 days before today, at most once per
 * 14 days), once per day, and no card on a rest day or mid-workout. The card only chooses which
 * existing M10 proposal to offer; it never applies anything.
 *
 * M12 1b "feel today" (trainer-kit item 9): what he says about today adds up to two more
 * signals, `feltLow` (energy ≤ `feelLowEnergy`) and `sore` (any area). The 2-signal rule is
 * unchanged, so both together show the card without Health, and one of them plus one Health
 * signal shows it too. A sore area also offers today's "go easy on" proposal (`feelOffers`);
 * that is all soreness ever leads to.
 */
import { addDate } from '../trainer/plan';
import type { BodyArea, DayFeel, HealthDay, ReadinessCard, ReadinessSignal } from '../types';
import { baseline, workoutKcalBaseline } from './baseline';
import {
  deloadReason,
  easyOnOfferText,
  FEEL_AREAS,
  reasonText,
  SIGNAL_ORDER,
  type SignalDetail,
} from './copy';
import { HEALTH_RULES, type HealthRules } from './rules';
import { isOwnWorkout, overlapsGymSession, type LoadSession } from './weeklyLoad';

const HOUR = 3_600_000;
const EPS = 1e-9;
const round1 = (n: number): number => Math.round(n * 10) / 10;

const bySignalOrder = (a: SignalDetail, b: SignalDetail): number =>
  SIGNAL_ORDER.indexOf(a.signal) - SIGNAL_ORDER.indexOf(b.signal);

/** The sore areas of a feel row: known areas only, once each, in `FEEL_AREAS` order. */
function soreAreas(feel: DayFeel | undefined): BodyArea[] {
  const said: readonly string[] = feel?.sore ?? [];
  return FEEL_AREAS.filter((a) => said.includes(a));
}

/** M12 1b: the signals from one day's "How do you feel today" answer (none when not asked). */
export function feelSignals(
  feel: DayFeel | undefined,
  rules: HealthRules = HEALTH_RULES,
): SignalDetail[] {
  const out: SignalDetail[] = [];
  if (feel?.energy !== undefined && feel.energy <= rules.feelLowEnergy) {
    out.push({ signal: 'feltLow' });
  }
  const areas = soreAreas(feel);
  if (areas.length > 0) out.push({ signal: 'sore', areas });
  return out;
}

/** One "Go easy on … today?" offer: the UI turns a tap into today's M10 avoid-area proposal. */
export type FeelOffer = { area: BodyArea; text: string };

/**
 * M12 1b: one offer per sore area, for today only (never a standing change, never more than
 * "go easy on"). Independent of the card: a sore area alone shows no card but still offers this.
 */
export function feelOffers(feel: DayFeel | undefined): FeelOffer[] {
  return soreAreas(feel).map((area) => ({ area, text: easyOnOfferText(area) }));
}

/** `feelOffers` for the row of `date` (none when he hasn't answered that day). */
export function todaysFeelOffers(feels: readonly DayFeel[], date: string): FeelOffer[] {
  return feelOffers(feels.find((f) => f.date === date));
}

/** A day's Health signals plus what he said that day, in `SIGNAL_ORDER`. */
function daySignals(
  days: readonly HealthDay[],
  date: string,
  now: number,
  rules: HealthRules,
  gymSessions: readonly LoadSession[],
  feels: readonly DayFeel[],
): SignalDetail[] {
  return [
    ...readinessSignals(days, date, now, rules, gymSessions),
    ...feelSignals(
      feels.find((f) => f.date === date),
      rules,
    ),
  ].sort(bySignalOrder);
}

/**
 * Today's Health signals with the size of each change, in `SIGNAL_ORDER`. Missing data → no signal.
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
  return out.sort(bySignalOrder);
}

/** Local noon of `date`: the moment a past day's card is judged at (device time zone). */
function noonOf(date: string): number {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

/**
 * On how many of the `deloadWindowDays` days before `date` the 2-signal rule fired
 * (`feels`: his "feel today" answers, counted like on the day itself).
 */
export function firedDaysBefore(
  days: readonly HealthDay[],
  date: string,
  rules: HealthRules = HEALTH_RULES,
  gymSessions: readonly LoadSession[] = [],
  feels: readonly DayFeel[] = [],
): number {
  let n = 0;
  for (let i = 1; i <= rules.deloadWindowDays; i++) {
    const d = addDate(date, -i);
    if (daySignals(days, d, noonOf(d), rules, gymSessions, feels).length >= rules.minSignals) n++;
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
  /** M12 1b: his "How do you feel today" answers (any days; the row of `date` is today's). */
  feels?: readonly DayFeel[];
};

/** Today's card, or null. */
export function readinessCard(input: ReadinessInput): ReadinessCard | null {
  const { date, now, days, history = {}, rules = HEALTH_RULES, gymSessions = [] } = input;
  const feels = input.feels ?? [];
  if (!input.trainingDay || input.inWorkout) return null;
  if (history.answeredDate === date) return null;
  if (history.lastCard?.date === date) return history.lastCard;

  const details = daySignals(days, date, now, rules, gymSessions, feels);
  if (details.length < rules.minSignals) return null;

  const reasons = details.map(reasonText);
  const fired = firedDaysBefore(days, date, rules, gymSessions, feels);
  const last = history.lastDeloadOfferDate;
  const spaced = last === undefined || addDate(last, rules.deloadSpacingDays) <= date;
  const deload = fired >= rules.deloadFiredDays && spaced;
  if (deload) reasons.push(deloadReason(fired, rules.deloadWindowDays));

  const signals: ReadinessSignal[] = details.map((d) => d.signal);
  return { date, signals, reasons, offer: deload ? 'deload' : 'lighter' };
}
