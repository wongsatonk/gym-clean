// Weights are stored in kg everywhere; units only affect display and stepping.
export type Unit = 'kg' | 'lb';

export const KG_PER_LB = 0.45359237;

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
