import { describe, expect, it } from 'vitest';
import { next, startSession, type SessionEvent, type SessionState } from './session';
import { shouldSpeakFocusCue } from './focusCue';
import type { ProgramDay } from './types';

const day: ProgramDay = {
  id: 'd',
  name: 'D',
  exercises: [
    { exerciseId: 'A', sets: 2, targetReps: [8, 12], restSec: 60, tracking: 'manual' },
    { exerciseId: 'B', sets: 1, targetReps: [8, 12], restSec: 60, tracking: 'manual' },
  ],
};
const s0 = startSession(day, 's', 0);
const step = (s: SessionState, e: SessionEvent) => [s, next(s, e)] as const;

describe('shouldSpeakFocusCue', () => {
  it('speaks when a session starts', () => {
    expect(shouldSpeakFocusCue(null, s0)).toBe(true);
  });

  it('speaks when the next set starts after rest', () => {
    const [, rest] = step(s0, { type: 'SET_DONE', now: 1 });
    expect(shouldSpeakFocusCue(s0, rest)).toBe(false); // entering rest
    const [, go] = step(rest, { type: 'START_SET', now: 2 });
    expect(shouldSpeakFocusCue(rest, go)).toBe(true);
  });

  it('speaks after skipping or jumping straight into another exercise', () => {
    const [a, skipped] = step(s0, { type: 'SKIP_EXERCISE', now: 1 });
    expect(shouldSpeakFocusCue(a, skipped)).toBe(true);
    const [b, jumped] = step(s0, { type: 'GO_TO_EXERCISE', exIndex: 1, now: 1 });
    expect(shouldSpeakFocusCue(b, jumped)).toBe(true);
  });

  it('stays quiet on stepper changes, pause, resume and summary', () => {
    const [a, adj] = step(s0, { type: 'ADJUST', field: 'reps', delta: 1 });
    expect(shouldSpeakFocusCue(a, adj)).toBe(false);
    const [b, paused] = step(s0, { type: 'PAUSE', now: 1 });
    expect(shouldSpeakFocusCue(b, paused)).toBe(false);
    const [c, resumed] = step(paused, { type: 'RESUME', now: 2 });
    expect(shouldSpeakFocusCue(c, resumed)).toBe(false);
    const [d, done] = step(s0, { type: 'FINISH', now: 3 });
    expect(shouldSpeakFocusCue(d, done)).toBe(false);
  });
});
