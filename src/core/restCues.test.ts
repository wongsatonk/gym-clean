import { describe, expect, it } from 'vitest';
import { restCueText, restCuesBetween } from './restCues';

const kinds = (target: number, from: number, to: number) =>
  restCuesBetween(target, from * 1000, to * 1000).map((c) => c.kind);

describe('restCuesBetween', () => {
  it('fires ten-seconds and go once each as time passes them', () => {
    expect(kinds(60, 0, 49.9)).toEqual([]);
    expect(kinds(60, 49.9, 50)).toEqual(['tenSeconds']);
    expect(kinds(60, 50, 59.99)).toEqual([]);
    expect(kinds(60, 59.99, 60)).toEqual(['go']);
    expect(kinds(60, 60, 60.25)).toEqual([]);
  });

  it('nudges at target + 30 s and every 30 s after', () => {
    expect(kinds(60, 60, 89.9)).toEqual([]);
    expect(kinds(60, 89.9, 90)).toEqual(['nudge']);
    expect(kinds(60, 90, 119)).toEqual([]);
    expect(kinds(60, 119, 120)).toEqual(['nudge']);
    expect(kinds(60, 120, 150)).toEqual(['nudge']);
  });

  it('returns every cue crossed in a long gap, in order', () => {
    expect(kinds(60, 0, 125)).toEqual(['tenSeconds', 'go', 'nudge', 'nudge']);
  });

  it('skips ten-seconds when the rest is 10 s or shorter', () => {
    expect(kinds(10, 0, 10)).toEqual(['go']);
  });

  it('does nothing when time does not move forward', () => {
    expect(kinds(60, 50, 50)).toEqual([]);
    expect(kinds(60, 55, 40)).toEqual([]);
  });
});

describe('restCueText', () => {
  const next = { name: 'Incline Dumbbell Press', setNumber: 2 };
  it('speaks the upcoming exercise at ten seconds', () => {
    expect(restCueText('tenSeconds', next)).toBe(
      'Ten seconds. Next: Incline Dumbbell Press, set 2.',
    );
  });
  it('says go', () => {
    expect(restCueText('go', next)).toBe('Go.');
  });
  it('nudges with the upcoming set', () => {
    expect(restCueText('nudge', next)).toBe('Rest is over. Incline Dumbbell Press, set 2.');
  });
});
