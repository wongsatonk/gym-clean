/**
 * M12 slice 1b (trainer kit item 4): tape measurements next to weigh-ins. Pure; `today` is
 * passed in. Values are stored in cm; the unit only changes what is shown and typed. M13d: every
 * formatter takes a `LengthUnit` (settings 'lengthUnit', read with `getLengthUnit`); only with no
 * row does it follow the weight unit (`lengthUnitFor`: cm with kg, inches with lb). The sites come from settings 'trainerKit' (`measurementSites`, passed in), so
 * a changed setting changes the list; rows of other sites stay stored but are not shown.
 */
import { addDate } from '../trainer/plan';
import { CM_PER_IN, lengthUnitFor } from '../units';
import type { LengthUnit, Measurement } from '../types';

/** "Measure again" is due this many days after the last measuring day. */
export const MEASURE_AGAIN_DAYS = 28;
export { CM_PER_IN, lengthUnitFor };
/** Typed values outside this range are refused (typos, wrong unit). */
export const CM_RANGE = [5, 300] as const;

export type { LengthUnit };

export function toLength(cm: number, unit: LengthUnit): number {
  return unit === 'cm' ? cm : cm / CM_PER_IN;
}

export function fromLength(value: number, unit: LengthUnit): number {
  return unit === 'cm' ? value : value * CM_PER_IN;
}

/** "33.5 cm" / "13.2 in"; `signed` adds + / − for a change. */
export function formatLength(cm: number, unit: LengthUnit, opts: { signed?: boolean } = {}): string {
  const rounded = Math.round(toLength(cm, unit) * 10) / 10;
  const abs = Math.abs(rounded).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const sign = rounded < 0 ? '−' : opts.signed && rounded > 0 ? '+' : '';
  return `${sign}${abs} ${unit}`;
}

export function isValidCm(cm: number): boolean {
  return Number.isFinite(cm) && cm >= CM_RANGE[0] && cm <= CM_RANGE[1];
}

/** Labels for the default sites; other ids get a readable fallback. */
export const SITE_LABELS: Readonly<Record<string, string>> = {
  leftArm: 'Left arm',
  rightArm: 'Right arm',
  chest: 'Chest',
  waist: 'Waist',
  hips: 'Hips',
  leftThigh: 'Left thigh',
  rightThigh: 'Right thigh',
};

/** 'leftArm' → "Left arm"; an unknown id is split at capitals ('upperBack' → "Upper back"). */
export function siteLabel(site: string): string {
  const known = SITE_LABELS[site];
  if (known) return known;
  const words = site.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : site;
}

export type MeasurementPoint = { date: string; cm: number };

export type SiteSeries = {
  site: string;
  label: string;
  /** Oldest first, one per date (a repeated date keeps the later row). */
  points: MeasurementPoint[];
  latest: MeasurementPoint | null;
  /** Latest − first; null with fewer than 2 points. */
  changeCm: number | null;
  /** Latest − the one before; null with fewer than 2 points. */
  lastChangeCm: number | null;
};

/** One series per site in `sites` (the setting's order); a site without rows is listed empty. */
export function measurementSeries(measurements: readonly Measurement[], sites: readonly string[]): SiteSeries[] {
  return sites.map((site) => {
    const byDate = new Map<string, number>();
    for (const m of measurements) if (m.site === site) byDate.set(m.date, m.cm);
    const points = [...byDate]
      .map(([date, cm]) => ({ date, cm }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const first = points[0];
    const latest = points[points.length - 1] ?? null;
    const before = points[points.length - 2];
    const many = points.length >= 2;
    return {
      site,
      label: siteLabel(site),
      points,
      latest,
      changeCm: many && first && latest ? latest.cm - first.cm : null,
      lastChangeCm: many && before && latest ? latest.cm - before.cm : null,
    };
  });
}

export type MeasureDue = {
  due: boolean;
  /** Latest measuring day (any listed site, not after today), or null if never. */
  lastDate: string | null;
  /** lastDate + 28 days, or null if never measured. */
  dueDate: string | null;
  /** Days until due; 0 when due. */
  daysLeft: number;
};

/** "Measure again": due when never measured, or 28 days after the last measuring day. */
export function measureDue(measurements: readonly Measurement[], sites: readonly string[], today: string): MeasureDue {
  let lastDate: string | null = null;
  for (const m of measurements) {
    if (!sites.includes(m.site) || m.date > today) continue;
    if (lastDate === null || m.date > lastDate) lastDate = m.date;
  }
  if (lastDate === null) return { due: true, lastDate: null, dueDate: null, daysLeft: 0 };
  const dueDate = addDate(lastDate, MEASURE_AGAIN_DAYS);
  let daysLeft = 0;
  while (daysLeft <= MEASURE_AGAIN_DAYS && addDate(today, daysLeft) < dueDate) daysLeft += 1;
  return { due: daysLeft === 0, lastDate, dueDate, daysLeft };
}
