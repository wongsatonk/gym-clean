// Weights are stored in kg everywhere and heights / tape lengths in cm; units only affect display,
// typing and stepping (M1b, M13d). Nothing here ever converts a stored value.
import type { LengthUnit, UnitPrefs } from './types';

export type Unit = 'kg' | 'lb';

export const KG_PER_LB = 0.45359237;
/** The exact international inch. */
export const CM_PER_IN = 2.54;

export function toUnit(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function fromUnit(value: number, unit: Unit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function stepFor(unit: Unit): number {
  return unit === 'kg' ? 2.5 : 5;
}

/** Nearest weight (in kg) that is a whole number of steps in the display unit. */
export function snapToStep(kg: number, unit: Unit): number {
  const step = stepFor(unit);
  return fromUnit(Math.round(toUnit(kg, unit) / step) * step, unit);
}

export function formatWeight(kg: number, unit: Unit): string {
  return toUnit(kg, unit).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** Length unit when no 'lengthUnit' row exists yet: tape and height follow the weight unit. */
export function lengthUnitFor(unit: Unit): LengthUnit {
  return unit === 'kg' ? 'cm' : 'in';
}

/** Height in whole inches, split into feet + inches (inches 0–11; 12 carries into feet). */
export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const total = Math.max(0, Math.round(cm / CM_PER_IN));
  const ft = Math.floor(total / 12);
  return { ft, inch: total - ft * 12 };
}

/** Exact cm for feet + inches (no rounding; inches past 12 simply add up). */
export function ftInToCm(ft: number, inch: number): number {
  return (ft * 12 + inch) * CM_PER_IN;
}

/** "170 cm" (one decimal at most) / "5 ft 7 in" (whole inches). */
export function formatHeight(cm: number, unit: LengthUnit): string {
  if (unit === 'in') {
    const { ft, inch } = cmToFtIn(cm);
    return `${ft} ft ${inch} in`;
  }
  const shown = (Math.round(cm * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
  return `${shown} cm`;
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const FT_MARK = String.raw`(?:feet|foot|ft|')`;
const IN_MARK = String.raw`(?:inches|inch|in|")`;
const FT_IN_PATTERNS: readonly { re: RegExp; ftGroup: number | null; inGroup: number | null }[] = [
  // 5'7"  5' 7  5ft7in  5 ft 7  5 feet 7 inches  5'  5 ft
  { re: new RegExp(String.raw`^${NUM}\s*${FT_MARK}(?:\s*${NUM}(?:\s*${IN_MARK})?)?$`), ftGroup: 1, inGroup: 2 },
  // 5 7
  { re: new RegExp(String.raw`^${NUM}\s+${NUM}$`), ftGroup: 1, inGroup: 2 },
  // 67 in  67"
  { re: new RegExp(String.raw`^${NUM}\s*${IN_MARK}$`), ftGroup: null, inGroup: 1 },
];

/**
 * Typed height → total inches, or null. Accepts `5'7"`, `5′7″`, `5 ft 7 in`, `5 ft 7`, `5 7`,
 * `5'`, `67 in` (any case, curly quotes, `''` for `"`, a decimal comma); inches ≥ 12 carry.
 * A bare number ("67") is ambiguous and refused, as are junk, negatives, empty and zero.
 */
export function parseFtIn(raw: string): number | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[′’‘]/g, "'")
    .replace(/[″”“]/g, '"')
    .replace(/''/g, '"')
    .replace(/(\d),(\d)/g, '$1.$2');
  for (const { re, ftGroup, inGroup } of FT_IN_PATTERNS) {
    const m = re.exec(s);
    if (!m) continue;
    const ft = ftGroup === null ? 0 : Number(m[ftGroup] ?? 0);
    const inch = inGroup === null ? 0 : Number(m[inGroup] ?? 0);
    const total = ft * 12 + inch;
    return Number.isFinite(total) && total > 0 ? total : null;
  }
  return null;
}

/** Regions that weigh in pounds and measure in feet/inches (M13d Goal 3). */
export const IMPERIAL_REGIONS: readonly string[] = ['US', 'LR', 'MM'];

/** Units preselected from the phone's locale (e.g. navigator.language, passed in). No region → metric. */
export function defaultUnits(locale?: string): UnitPrefs {
  let region: string | undefined;
  try {
    region = locale ? new Intl.Locale(locale.replace(/_/g, '-')).region : undefined;
  } catch {
    region = undefined;
  }
  return region && IMPERIAL_REGIONS.includes(region)
    ? { weight: 'lb', length: 'in' }
    : { weight: 'kg', length: 'cm' };
}
