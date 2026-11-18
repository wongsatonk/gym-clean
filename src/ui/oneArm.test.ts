// M13b task 13: the one-sided helpers shared by the Exercise screen and the camera.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { next, startSession } from '../core/session';
import type { ProgramDay } from '../core/types';
import { voice } from './voice';
import { oneSidedView, sideLabelText, sideOfTurn, speakSideSwitch } from './oneArm';

describe('sideOfTurn', () => {
  it('first = right, second = left', () => {
    expect(sideOfTurn('first')).toBe('right');
    expect(sideOfTurn('second')).toBe('left');
  });
});

describe('sideLabelText', () => {
  it('uses the core copy', () => {
    expect(sideLabelText('arm', 'right')).toBe('Right arm');
    expect(sideLabelText('leg', 'left')).toBe('Left leg');
  });
});

describe('speakSideSwitch', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cancels speech first, then queues the switch line as a cue', () => {
    const calls: string[] = [];
    vi.spyOn(voice, 'cancel').mockImplementation(() => void calls.push('cancel'));
    vi.spyOn(voice, 'speak').mockImplementation((text, opts) => {
      calls.push(`${opts?.kind}:${text}`);
      return null;
    });
    expect(speakSideSwitch('arm', 'left')).toBe('Left arm. Turn so your left arm faces the phone.');
    expect(calls).toEqual(['cancel', 'cue:Left arm. Turn so your left arm faces the phone.']);
  });
});

describe('oneSidedView', () => {
  const day: ProgramDay = {
    id: 'pull',
    name: 'Pull A',
    exercises: [
      {
        exerciseId: 'One-Arm_Dumbbell_Row',
        sets: 2,
        targetReps: [8, 12],
        restSec: 60,
        startWeightKg: 20,
        tracking: 'pose',
      },
    ],
  };

  it('undefined for a two-sided exercise id', () => {
    expect(oneSidedView('Dumbbell_Bicep_Curl', startSession(day, 's1', 1000))).toBeUndefined();
  });

  it("first turn, then second with the first side's reps and switch time; none on Rest", () => {
    const s = next(startSession(day, 's1', 1000), { type: 'SET_COUNTED', reps: 11, partials: 0 });
    expect(oneSidedView('One-Arm_Dumbbell_Row', s)).toEqual({ limb: 'arm', turn: 'first' });
    const s2 = next(s, { type: 'NEXT_SIDE', now: 5000 });
    expect(oneSidedView('One-Arm_Dumbbell_Row', s2)).toEqual({
      limb: 'arm',
      turn: 'second',
      doneReps: 11,
      switchedAt: 5000,
    });
    const rest = next(s2, { type: 'SET_DONE', now: 9000 });
    expect(oneSidedView('One-Arm_Dumbbell_Row', rest)).toBeUndefined();
  });
});
