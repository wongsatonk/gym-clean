import { describe, expect, it } from 'vitest';
import { RULES, type ExerciseRule } from './exercises';
import { GAUGE_MAX, GAUGE_MIN, gaugeMarks, gaugePosition, missedMark, readGauge } from './romGauge';

// Explicit thresholds so these tests don't move when the real rules get retuned.
const base = RULES[0] as ExerciseRule;
const curlLike: ExerciseRule = {
  ...base,
  extended: 150,
  contracted: 70,
  direction: 'decreasing',
  start: 'extended',
};
const raiseLike: ExerciseRule = {
  ...base,
  extended: 25,
  contracted: 75,
  direction: 'increasing',
  start: 'extended',
};
const pressLike: ExerciseRule = {
  ...base,
  extended: 155,
  contracted: 100,
  direction: 'decreasing',
  start: 'contracted',
};

describe('gaugeMarks', () => {
  it('start line = start threshold, target line = far threshold', () => {
    expect(gaugeMarks(curlLike)).toEqual({ startDeg: 150, targetDeg: 70 });
    expect(gaugeMarks(raiseLike)).toEqual({ startDeg: 25, targetDeg: 75 });
    expect(gaugeMarks(pressLike)).toEqual({ startDeg: 100, targetDeg: 155 });
  });
});

describe('gaugePosition (SPEC §3)', () => {
  it('curl (decreasing, extended start): 0 at start line, 1 at target, linear between', () => {
    expect(gaugePosition(curlLike, 150)).toBeCloseTo(0);
    expect(gaugePosition(curlLike, 70)).toBeCloseTo(1);
    expect(gaugePosition(curlLike, 110)).toBeCloseTo(0.5);
    expect(gaugePosition(curlLike, 170)).toBeCloseTo(-0.25);
  });

  it('lateral raise (inverted): a bigger angle moves toward the target', () => {
    expect(gaugePosition(raiseLike, 25)).toBeCloseTo(0);
    expect(gaugePosition(raiseLike, 75)).toBeCloseTo(1);
    expect(gaugePosition(raiseLike, 50)).toBeCloseTo(0.5);
    expect(gaugePosition(raiseLike, 10)).toBeCloseTo(-0.3);
  });

  it('press (contracted start): pressing up (bigger angle) moves toward the target', () => {
    expect(gaugePosition(pressLike, 100)).toBeCloseTo(0);
    expect(gaugePosition(pressLike, 155)).toBeCloseTo(1);
    expect(gaugePosition(pressLike, 127.5)).toBeCloseTo(0.5);
    expect(gaugePosition(pressLike, 166)).toBeCloseTo(1.2);
  });

  it('is unclamped (raw) so callers can see how far past a line the limb went', () => {
    expect(gaugePosition(curlLike, 30)).toBeCloseTo(1.5);
    expect(gaugePosition(curlLike, 190)).toBeCloseTo(-0.5);
  });

  it('every real rule: 0 at its start threshold, 1 at its far threshold, monotonic toward far', () => {
    for (const rule of RULES) {
      const { startDeg, targetDeg } = gaugeMarks(rule);
      expect(startDeg, rule.exerciseId).toBe(rule[rule.start]);
      expect(targetDeg, rule.exerciseId).toBe(
        rule.start === 'extended' ? rule.contracted : rule.extended,
      );
      expect(gaugePosition(rule, startDeg), rule.exerciseId).toBeCloseTo(0);
      expect(gaugePosition(rule, targetDeg), rule.exerciseId).toBeCloseTo(1);
      // Step the angle from start to far in 10 increments: position must rise each step.
      let prev = -Infinity;
      for (let i = 0; i <= 10; i++) {
        const angle = startDeg + ((targetDeg - startDeg) * i) / 10;
        const pos = gaugePosition(rule, angle);
        expect(pos, `${rule.exerciseId} @${angle}`).toBeGreaterThan(prev);
        prev = pos;
      }
    }
  });
});

describe('readGauge', () => {
  it('clamps the display position to [-0.25, 1.25]', () => {
    expect(GAUGE_MIN).toBe(-0.25);
    expect(GAUGE_MAX).toBe(1.25);
    expect(readGauge(curlLike, 10)?.position).toBe(1.25);
    expect(readGauge(curlLike, 180)?.position).toBe(-0.25);
    expect(readGauge(curlLike, 10)?.rawPosition).toBeCloseTo(1.75);
    expect(readGauge(raiseLike, 0)?.position).toBe(-0.25);
    expect(readGauge(pressLike, 180)?.position).toBe(1.25);
  });

  it('zone: start at/behind the start line, target at/past the target line, moving between', () => {
    expect(readGauge(curlLike, 160)?.zone).toBe('start');
    expect(readGauge(curlLike, 150)?.zone).toBe('start');
    expect(readGauge(curlLike, 149)?.zone).toBe('moving');
    expect(readGauge(curlLike, 71)?.zone).toBe('moving');
    expect(readGauge(curlLike, 70)?.zone).toBe('target');
    expect(readGauge(curlLike, 40)?.zone).toBe('target');

    expect(readGauge(raiseLike, 20)?.zone).toBe('start');
    expect(readGauge(raiseLike, 50)?.zone).toBe('moving');
    expect(readGauge(raiseLike, 80)?.zone).toBe('target');

    expect(readGauge(pressLike, 90)?.zone).toBe('start');
    expect(readGauge(pressLike, 130)?.zone).toBe('moving');
    expect(readGauge(pressLike, 160)?.zone).toBe('target');
  });

  it('carries the angle and the marks for labels', () => {
    expect(readGauge(pressLike, 130)).toEqual({
      angle: 130,
      rawPosition: expect.closeTo(30 / 55, 6) as number,
      position: expect.closeTo(30 / 55, 6) as number,
      zone: 'moving',
      startDeg: 100,
      targetDeg: 155,
    });
  });

  it('returns null without a usable angle (nothing tracked yet)', () => {
    expect(readGauge(curlLike, null)).toBeNull();
    expect(readGauge(curlLike, undefined)).toBeNull();
    expect(readGauge(curlLike, Number.NaN)).toBeNull();
    expect(readGauge(curlLike, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('missedMark', () => {
  it('maps a partial reason to the gauge line the rep missed', () => {
    expect(missedMark('far')).toBe('target');
    expect(missedMark('start')).toBe('start');
    expect(missedMark(undefined)).toBeNull();
  });
});
