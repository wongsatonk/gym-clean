/**
 * M12 1b: body fat % and lean mass trends, shown next to the weight trend in Fuel. Pure.
 *
 * Input: the stored `HealthDay` rows (`bodyFatPct`, `leanMassKg`; the day's pick like weight, see
 * days.ts). Same shape of series as the weight chart (`trend` in nutrition/adjust.ts): one point
 * per date with that date's reading and the mean of the readings in the 7 days ending there.
 *
 * Numbers only: no targets, no ranges, no wording about what a value means. These values stay on
 * the phone and in Fuel; they are never part of a coach / brain context, the developer log or a
 * backup.
 */
import { addDate } from '../trainer/plan';
import type { HealthDay } from '../types';

/** Days averaged for the trend line (same as the weight trend). */
export const BODY_COMP_AVG_DAYS = 7;

export type BodyCompPoint = {
  date: string;
  /** That date's reading, or null. */
  value: number | null;
  /** Mean of the readings in the 7 days ending this date, or null if none. */
  avg: number | null;
};

export type BodyCompSeries = {
  /** The last `span` dates ending today, oldest first. */
  points: BodyCompPoint[];
  /** The newest reading in the window. */
  latest: { date: string; value: number };
  /**
   * Last average minus the first average in the window (negative = went down); null until two
   * dates in the window have a reading.
   */
  change: number | null;
};

export type BodyCompTrend = {
  /** Percent, to 0.1. Null when the window has no reading (nothing to show). */
  bodyFat: BodyCompSeries | null;
  /** kg, to 0.01. Null when the window has no reading. */
  leanMass: BodyCompSeries | null;
};

const rounder =
  (decimals: number) =>
  (n: number): number => {
    const f = 10 ** decimals;
    return Math.round(n * f) / f;
  };

function series(
  days: readonly HealthDay[],
  pick: (d: HealthDay) => number | undefined,
  span: number,
  today: string,
  decimals: number,
): BodyCompSeries | null {
  const round = rounder(decimals);
  const byDate = new Map<string, number>();
  for (const d of days) {
    const v = pick(d);
    if (typeof v === 'number' && Number.isFinite(v) && v > 0 && d.date <= today)
      byDate.set(d.date, v);
  }
  const points: BodyCompPoint[] = [];
  let latest: BodyCompSeries['latest'] | null = null;
  let readings = 0;
  for (let i = Math.floor(span) - 1; i >= 0; i--) {
    const date = addDate(today, -i);
    const value = byDate.get(date) ?? null;
    let sum = 0;
    let n = 0;
    for (let k = 0; k < BODY_COMP_AVG_DAYS; k++) {
      const v = byDate.get(addDate(date, -k));
      if (v !== undefined) {
        sum += v;
        n++;
      }
    }
    points.push({ date, value, avg: n > 0 ? round(sum / n) : null });
    if (value !== null) {
      latest = { date, value };
      readings++;
    }
  }
  if (!latest) return null;
  const avgs = points.flatMap((p) => (p.avg === null ? [] : [p.avg]));
  const first = avgs[0];
  const last = avgs.at(-1);
  const change =
    readings >= 2 && first !== undefined && last !== undefined ? round(last - first) : null;
  return { points, latest, change };
}

/**
 * Chart series for the last `span` dates ending `today` (local YYYY-MM-DD). Rows after `today`
 * and damaged values are ignored; a date given twice keeps the last row.
 */
export function bodyCompTrend(
  days: readonly HealthDay[],
  span: number,
  today: string,
): BodyCompTrend {
  return {
    bodyFat: series(days, (d) => d.bodyFatPct, span, today, 1),
    leanMass: series(days, (d) => d.leanMassKg, span, today, 2),
  };
}
