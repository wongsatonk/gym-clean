import { describe, expect, it } from 'vitest';
import type { FocusCueId } from './types';
import { FOCUS_CUE_IDS, PARTIAL_WEIGHT, cueWeight, focusScore, isFocusCueId } from './focusScore';

describe('cueWeight (SPEC M5 score)', () => {
  it('costs 10 for every tempo, range and form cue', () => {
    const ten: FocusCueId[] = [
      'rushedLowering',
      'shrinkingRange',
      'armsOutOfSync',
      'raiseTooHigh',
      'elbowDrift',
      'bodySwing',
      'hipSag',
    ];
    for (const id of ten) expect(cueWeight(id)).toBe(10);
  });

  it('costs 5 for stalled', () => {
    expect(cueWeight('stalled')).toBe(5);
  });

  it('costs nothing for out of frame and low fps (placement and light, not focus)', () => {
    expect(cueWeight('outOfFrame')).toBe(0);
    expect(cueWeight('lowFps')).toBe(0);
  });

  it('has a weight for every known cue id, and nothing else counts as one', () => {
    expect(FOCUS_CUE_IDS).toHaveLength(10);
    for (const id of FOCUS_CUE_IDS) expect(isFocusCueId(id)).toBe(true);
    expect(isFocusCueId('slowTheLowering')).toBe(false);
    expect(isFocusCueId(3)).toBe(false);
    expect(isFocusCueId(undefined)).toBe(false);
  });
});

describe('focusScore', () => {
  it('is 100 with no cues and no partials', () => {
    expect(focusScore([], 0)).toBe(100);
  });

  it('subtracts 5 per partial', () => {
    expect(PARTIAL_WEIGHT).toBe(5);
    expect(focusScore([], 1)).toBe(95);
    expect(focusScore([], 3)).toBe(85);
  });

  it('subtracts each detection, repeats included', () => {
    expect(focusScore(['rushedLowering'], 0)).toBe(90);
    expect(focusScore(['rushedLowering', 'rushedLowering'], 0)).toBe(80);
    expect(focusScore(['shrinkingRange', 'stalled'], 1)).toBe(80);
    expect(focusScore(['armsOutOfSync', 'raiseTooHigh', 'stalled'], 2)).toBe(65);
  });

  it('ignores out of frame and low fps', () => {
    expect(focusScore(['outOfFrame', 'lowFps', 'outOfFrame'], 0)).toBe(100);
    expect(focusScore(['outOfFrame', 'hipSag'], 1)).toBe(85);
  });

  it('clamps at 0', () => {
    const many: FocusCueId[] = Array.from({ length: 12 }, () => 'bodySwing');
    expect(focusScore(many, 0)).toBe(0);
    expect(focusScore([], 30)).toBe(0);
    expect(focusScore(['elbowDrift'], 18)).toBe(0);
  });

  it('treats partials as whole numbers ≥ 0 (bad values count as 0)', () => {
    expect(focusScore([], -2)).toBe(100);
    expect(focusScore([], 1.4)).toBe(95);
    expect(focusScore([], Number.NaN)).toBe(100);
    expect(focusScore([], Number.POSITIVE_INFINITY)).toBe(100);
  });

  it('skips unknown ids from old or corrupt rows', () => {
    const odd = ['rushedLowering', 'notACue'] as unknown as FocusCueId[];
    expect(focusScore(odd, 0)).toBe(90);
  });
});
