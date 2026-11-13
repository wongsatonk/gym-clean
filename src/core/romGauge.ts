// Range-of-motion gauge math (SPEC §3, M4c). Pure: live smoothed angle → position on a 0..1 scale
// where 0 = start line (start threshold) and 1 = target line (far threshold). Generic over
// ExerciseRule: the formula is orientation-free, so inverted rules (lateral raise) and
// contracted-start rules (press) need no special case.
import type { ExerciseRule } from './exercises';

/** Display clamp (SPEC §3). */
export const GAUGE_MIN = -0.25;
export const GAUGE_MAX = 1.25;

/** start: at or behind the start line. moving: between the lines. target: at or past the target. */
export type GaugeZone = 'start' | 'moving' | 'target';

export type GaugeMarks = {
  /** Start threshold (deg): where every rep starts and ends. Position 0. */
  startDeg: number;
  /** Far threshold (deg): what a full rep must reach. Position 1. */
  targetDeg: number;
};

export type GaugeReading = GaugeMarks & {
  angle: number;
  /** Unclamped position (useful for logs: how far past a line). */
  rawPosition: number;
  /** Position clamped to [GAUGE_MIN, GAUGE_MAX] for drawing. */
  position: number;
  zone: GaugeZone;
};

export function gaugeMarks(rule: ExerciseRule): GaugeMarks {
  const far = rule.start === 'extended' ? 'contracted' : 'extended';
  return { startDeg: rule[rule.start], targetDeg: rule[far] };
}

/** position = (start − angle) / (start − far), unclamped. */
export function gaugePosition(rule: ExerciseRule, angle: number): number {
  const { startDeg, targetDeg } = gaugeMarks(rule);
  return (startDeg - angle) / (startDeg - targetDeg);
}

/** Full reading for the UI, or null when there is no usable angle yet. */
export function readGauge(
  rule: ExerciseRule,
  angle: number | null | undefined,
): GaugeReading | null {
  if (angle == null || !Number.isFinite(angle)) return null;
  const marks = gaugeMarks(rule);
  const rawPosition = gaugePosition(rule, angle);
  const position = Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, rawPosition));
  const zone: GaugeZone = rawPosition <= 0 ? 'start' : rawPosition >= 1 ? 'target' : 'moving';
  return { ...marks, angle, rawPosition, position, zone };
}

/** The gauge line a partial missed (drawn amber): `far` → target line, `start` → start line. */
export function missedMark(reason: 'far' | 'start' | undefined): 'start' | 'target' | null {
  if (reason === 'far') return 'target';
  if (reason === 'start') return 'start';
  return null;
}
