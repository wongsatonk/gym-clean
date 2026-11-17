import { describe, expect, it } from 'vitest';
import type { TodoDetectorId, TodoFacts } from '../types';
import { DETECTOR_IDS, FACT_COUNTS, FACT_FLAGS, detectors, runDetector } from './detectors';

// Made-up facts only (public repo).
const NOW = new Date(2026, 10, 16, 12).getTime();
const DAY = 86_400_000;

function facts(
  platform: TodoFacts['platform'],
  counts: Partial<Record<(typeof FACT_COUNTS)[number], number>> = {},
  flags: Partial<Record<(typeof FACT_FLAGS)[number], boolean>> = {},
  extra: Partial<TodoFacts> = {},
): TodoFacts {
  return { platform, now: NOW, counts: { ...counts }, flags: { ...flags }, ...extra };
}

const BOTH = ['web', 'native'] as const;

describe('detector registry', () => {
  it('has one detector per TodoDetectorId', () => {
    const all: Record<TodoDetectorId, true> = {
      chatAsked: true,
      proposalOutcome: true,
      calendarAfterSession: true,
      healthConnected: true,
      healthDays: true,
      nativeApp: true,
      nativeSessions: true,
      coachChanges: true,
      legSwapSession: true,
      handsFreeSession: true,
      cameraSession: true,
      learningCamera: true,
      foodModel: true,
      photoMealDays: true,
      resignDaysLeft: true,
      effortSets: true,
      warmupSession: true,
      intakeDone: true,
      measurementLogged: true,
      bodyCompDays: true,
    };
    expect([...DETECTOR_IDS].sort()).toEqual(Object.keys(all).sort());
    expect(Object.keys(detectors).sort()).toEqual(Object.keys(all).sort());
  });

  it('an empty snapshot is "not done" for every detector (except "in the iPhone app" there)', () => {
    for (const p of BOTH)
      for (const id of DETECTOR_IDS)
        expect(detectors[id](facts(p), {}).done, `${id} ${p}`).toBe(
          id === 'nativeApp' && p === 'native',
        );
  });
});

// [detector, count key, default need, params to raise the need]
const COUNT_CASES: [TodoDetectorId, (typeof FACT_COUNTS)[number], number][] = [
  ['chatAsked', 'chatQuestions', 1],
  ['proposalOutcome', 'proposalOutcomes', 1],
  ['coachChanges', 'coachChanges', 2],
  ['legSwapSession', 'legSwapSessions', 1],
  ['handsFreeSession', 'handsFreeSessions', 1],
  ['cameraSession', 'maxCameraSetsInSession', 6],
  ['learningCamera', 'learningCameraExercises', 3],
  ['photoMealDays', 'photoMealDays', 7],
];

describe.each(COUNT_CASES)('%s (counts.%s)', (id, key, need) => {
  it.each(BOTH)('is not done one below its need and done at it (%s)', (p) => {
    const below = detectors[id](facts(p, { [key]: need - 1 }), {});
    expect(below).toEqual({ done: false, have: need - 1, need });
    expect(detectors[id](facts(p, { [key]: need }), {})).toEqual({ done: true, have: need, need });
  });

  it('takes its need from params (data)', () => {
    expect(detectors[id](facts('web', { [key]: need }), { min: need + 1 }).done).toBe(false);
    expect(detectors[id](facts('web', { [key]: need + 1 }), { min: need + 1 }).done).toBe(true);
  });

  it('caps "have" at the need for display ("7 of 7")', () => {
    expect(detectors[id](facts('web', { [key]: need + 5 }), {}).have).toBe(need);
  });

  it('reads a missing or bad count as 0', () => {
    expect(detectors[id](facts('web', { [key]: Number.NaN }), {})).toEqual({
      done: false,
      have: 0,
      need,
    });
  });
});

describe('flag detectors', () => {
  it.each([
    ['calendarAfterSession', 'calendarAfterSession'],
    ['foodModel', 'foodModel'],
  ] as const)('%s follows flags.%s on both platforms', (id, flag) => {
    for (const p of BOTH) {
      expect(detectors[id](facts(p, {}, { [flag]: false }), {}).done).toBe(false);
      expect(detectors[id](facts(p, {}, { [flag]: true }), {}).done).toBe(true);
    }
  });
});

describe('native-only detectors', () => {
  it('nativeApp is done only in the iPhone app', () => {
    expect(detectors.nativeApp(facts('web'), {}).done).toBe(false);
    expect(detectors.nativeApp(facts('native'), {}).done).toBe(true);
  });

  it('healthConnected needs the iPhone app and the flag', () => {
    expect(detectors.healthConnected(facts('web', {}, { healthConnected: true }), {}).done).toBe(
      false,
    );
    expect(detectors.healthConnected(facts('native', {}, { healthConnected: false }), {}).done).toBe(
      false,
    );
    expect(detectors.healthConnected(facts('native', {}, { healthConnected: true }), {}).done).toBe(
      true,
    );
  });

  it('healthDays: 6 of 7 is not done, 7 of 7 is; never on web', () => {
    expect(detectors.healthDays(facts('native', { healthDays7: 6 }), { min: 7 })).toEqual({
      done: false,
      have: 6,
      need: 7,
    });
    expect(detectors.healthDays(facts('native', { healthDays7: 7 }), { min: 7 })).toEqual({
      done: true,
      have: 7,
      need: 7,
    });
    expect(detectors.healthDays(facts('web', { healthDays7: 7 }), { min: 7 }).done).toBe(false);
  });

  it('nativeSessions: 2 is not done, 3 is; never on web', () => {
    expect(detectors.nativeSessions(facts('native', { nativeSessions: 2 }), { min: 3 })).toEqual({
      done: false,
      have: 2,
      need: 3,
    });
    expect(detectors.nativeSessions(facts('native', { nativeSessions: 3 }), { min: 3 }).done).toBe(
      true,
    );
    expect(detectors.nativeSessions(facts('web', { nativeSessions: 3 }), { min: 3 }).done).toBe(
      false,
    );
  });
});

describe('resignDaysLeft detector', () => {
  const first = (daysAgo: number) => new Date(2026, 10, 16 - daysAgo, 9).getTime();

  it('3 days left is done, 2 is not (warning boundary)', () => {
    const three = facts('native', {}, {}, { buildFirstSeenAt: first(4) });
    expect(detectors.resignDaysLeft(three, { minDaysLeft: 3 })).toEqual({
      done: true,
      have: 3,
      need: 3,
    });
    const two = facts('native', {}, {}, { buildFirstSeenAt: first(5) });
    expect(detectors.resignDaysLeft(two, { minDaysLeft: 3 })).toEqual({
      done: false,
      have: 2,
      need: 3,
    });
  });

  it('a fresh build has 7 days left (have is not capped)', () => {
    const f = facts('native', {}, {}, { buildFirstSeenAt: NOW - 1000 });
    expect(detectors.resignDaysLeft(f, { minDaysLeft: 3 })).toEqual({ done: true, have: 7, need: 3 });
  });

  it('the paid account stops the reminder (always done)', () => {
    const f = facts('native', {}, { signingPaid: true }, { buildFirstSeenAt: first(6) });
    expect(detectors.resignDaysLeft(f, { minDaysLeft: 3 }).done).toBe(true);
  });

  it('is not done without a first-seen time, and never on web', () => {
    expect(detectors.resignDaysLeft(facts('native'), { minDaysLeft: 3 })).toEqual({
      done: false,
      need: 3,
    });
    const web = facts('web', {}, {}, { buildFirstSeenAt: NOW - DAY });
    expect(detectors.resignDaysLeft(web, { minDaysLeft: 3 }).done).toBe(false);
  });
});

describe('runDetector', () => {
  it('runs an auto step by its detector id and params', () => {
    const r = runDetector(
      { id: 's', title: 'x', kind: 'auto', detector: 'chatAsked', params: { min: 2 } },
      facts('web', { chatQuestions: 1 }),
    );
    expect(r).toEqual({ done: false, have: 1, need: 2 });
  });
});
