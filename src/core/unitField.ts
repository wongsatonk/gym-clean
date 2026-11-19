/**
 * M13d task 10b (SPEC M13d Goal 3): the no-drift model behind every inline unit switch
 * (Set up Fuel weight + height, the Fuel weigh-in, Measurements). Pure.
 *
 * A field holds the **metric** value (kg / cm) it will save and only re-derives what is shown
 * from it. `switchUnit` keeps `metric` identical (switching back and forth any number of times
 * never changes what gets saved, and nothing is written); only `editField` (your own edit)
 * changes it, at the precision the 1.16 forms store:
 * - body weight: snapped to 0.1 kg / 0.2 lb in the shown unit, then kg (lb → kg unrounded);
 * - height: whole cm, or whole inches → cm (2 decimals, exact for whole inches);
 * - tape: snapped to 0.5 cm / 0.1 in, stored as cm with 1 decimal.
 * Edits are clamped to the field's range; min / max are given in the shown unit, rounded inward
 * to the step so a clamped value is always inside the metric range.
 */
import { CM_RANGE } from './progress/measurements';
import { SETUP_RANGE } from './nutrition/setupPrefill';
import { CM_PER_IN, cmToFtIn, formatHeight, fromUnit, parseFtIn, toUnit, type Unit } from './units';
import type { LengthUnit } from './types';

export type FieldKind = 'bodyWeight' | 'height' | 'tape';
export type UnitOf<K extends FieldKind> = K extends 'bodyWeight' ? Unit : LengthUnit;

/** Metric ranges (kg / cm). The weigh-in uses the same 30–250 kg as Set up Fuel. */
export const FIELD_RANGE: Readonly<Record<FieldKind, { min: number; max: number }>> = {
  bodyWeight: { min: SETUP_RANGE.weightKg.min, max: SETUP_RANGE.weightKg.max },
  height: { min: SETUP_RANGE.heightCm.min, max: SETUP_RANGE.heightCm.max },
  tape: { min: CM_RANGE[0], max: CM_RANGE[1] },
};

export type UnitField<K extends FieldKind = FieldKind> = {
  kind: K;
  /** What gets saved: kg for body weight, cm for height and tape. */
  metric: number;
  unit: UnitOf<K>;
  /** The shown number in `unit` (height in ft·in: total whole inches). */
  value: number;
  /** The shown text without the unit: "70.0", "154.3", "170", "5 ft 7 in", "13.2". */
  display: string;
  /** Height in ft·in only. */
  parts?: { ft: number; inch: number };
  /** Step, min and max in the shown unit (height in ft·in: inches). */
  step: number;
  min: number;
  max: number;
  /** Decimals shown for `value`. */
  decimals: number;
};

export type FieldEdit = number | string | { ft: number; inch: number };

type Spec = { step: number; decimals: number; toShown: (metric: number) => number; toMetric: (shown: number) => number };

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

function specFor(kind: FieldKind, unit: Unit | LengthUnit): Spec {
  if (kind === 'bodyWeight') {
    const u: Unit = unit === 'lb' ? 'lb' : 'kg';
    return {
      step: u === 'kg' ? 0.1 : 0.2,
      decimals: 1,
      toShown: (kg) => toUnit(kg, u),
      toMetric: (shown) => fromUnit(shown, u),
    };
  }
  const inches = unit === 'in';
  if (kind === 'height') {
    return inches
      ? { step: 1, decimals: 0, toShown: (cm) => cm / CM_PER_IN, toMetric: (inch) => round(inch * CM_PER_IN, 2) }
      : { step: 1, decimals: 0, toShown: (cm) => cm, toMetric: (cm) => cm };
  }
  return inches
    ? { step: 0.1, decimals: 1, toShown: (cm) => cm / CM_PER_IN, toMetric: (inch) => round(inch * CM_PER_IN, 1) }
    : { step: 0.5, decimals: 1, toShown: (cm) => cm, toMetric: (cm) => round(cm, 1) };
}

const EPS = 1e-9;
/** A whole number of steps, as a clean decimal. */
const steps = (n: number, s: Spec) => Number((n * s.step).toFixed(s.decimals));

function shownRange(kind: FieldKind, s: Spec): { min: number; max: number } {
  const r = FIELD_RANGE[kind];
  return {
    min: steps(Math.ceil(s.toShown(r.min) / s.step - EPS), s),
    max: steps(Math.floor(s.toShown(r.max) / s.step + EPS), s),
  };
}

/** A field showing `metric` in `unit`. The metric value is kept as given (no clamping). */
export function unitField<K extends FieldKind>(input: { kind: K; metric: number; unit: UnitOf<K> }): UnitField<K> {
  const { kind, metric, unit } = input;
  const s = specFor(kind, unit);
  const { min, max } = shownRange(kind, s);
  const ftIn = kind === 'height' && unit === 'in';
  const parts = ftIn ? cmToFtIn(metric) : undefined;
  const value = parts ? parts.ft * 12 + parts.inch : round(s.toShown(metric), s.decimals);
  const field: UnitField<K> = {
    kind,
    metric,
    unit,
    value,
    display: ftIn ? formatHeight(metric, 'in') : value.toFixed(s.decimals),
    step: s.step,
    min,
    max,
    decimals: s.decimals,
  };
  if (parts) field.parts = parts;
  return field;
}

/** The same metric value shown in another unit. Nothing is written; `metric` is identical. */
export function switchUnit<K extends FieldKind>(field: UnitField<K>, unit: UnitOf<K>): UnitField<K> {
  return unitField({ kind: field.kind, metric: field.metric, unit });
}

/** The shown-unit number an edit means, or null when it isn't one. */
function shownFromEdit(field: UnitField, edit: FieldEdit): number | null {
  const ftIn = field.kind === 'height' && field.unit === 'in';
  if (typeof edit === 'object') {
    if (!ftIn) return null;
    const total = edit.ft * 12 + edit.inch;
    return Number.isFinite(total) ? total : null;
  }
  if (typeof edit === 'number') return Number.isFinite(edit) ? edit : null;
  if (ftIn) return parseFtIn(edit);
  const t = edit.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Your edit, in the shown unit (a number, typed text, or ft + in for height in ft·in): snapped to
 * the step, clamped to the range, stored as metric. Junk leaves the field as it is.
 */
export function editField<K extends FieldKind>(field: UnitField<K>, edit: FieldEdit): UnitField<K> {
  const shown = shownFromEdit(field, edit);
  if (shown === null) return field;
  const s = specFor(field.kind, field.unit);
  const { min, max } = shownRange(field.kind, s);
  const snapped = Math.min(max, Math.max(min, steps(Math.round(shown / s.step), s)));
  return unitField({ kind: field.kind, metric: s.toMetric(snapped), unit: field.unit });
}
