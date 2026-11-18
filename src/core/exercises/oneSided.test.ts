import { describe, expect, it } from 'vitest';
import exercisesJson from '../../data/exercises.json';
import type { OneSidedLimb, WorkSide } from '../types';
import {
  FIRST_SIDE,
  ONE_SIDED,
  ONE_SIDED_COPY,
  isOneSided,
  oneSidedLimb,
  otherSide,
} from './index';

const ids = new Set((exercisesJson as { id: string }[]).map((e) => e.id));
const names = new Map((exercisesJson as { id: string; name: string }[]).map((e) => [e.id, e.name]));
const LIMBS: OneSidedLimb[] = ['arm', 'leg'];
const SIDES: WorkSide[] = ['right', 'left'];
const words = (s: string) => s.trim().split(/\s+/).length;
const BANNED = /\b(pain\w*|injur\w*|hurt\w*|damage\w*|safe\w*|risk\w*|strain\w*|tear\w*|diagnos\w*|medical\w*)\b/i;

function allCopy(): string[] {
  return LIMBS.flatMap((limb) => {
    const c = ONE_SIDED_COPY[limb];
    return [
      ...SIDES.map((s) => c.sideLabel[s]),
      ...SIDES.map((s) => c.spokenSwitch[s]),
      c.nextButton,
      c.spokenStart,
      c.idleReminder,
    ];
  });
}

describe('ONE_SIDED (SPEC M13b goal 1)', () => {
  it('lists the 3 arm and 4 leg exercises', () => {
    expect(ONE_SIDED).toEqual({
      'One-Arm_Dumbbell_Row': 'arm',
      Concentration_Curls: 'arm',
      'Seated_One-arm_Cable_Pulley_Rows': 'arm',
      Dumbbell_Step_Ups: 'leg',
      Split_Squat_with_Dumbbells: 'leg',
      Single_Leg_Glute_Bridge: 'leg',
      'Dumbbell_Seated_One-Leg_Calf_Raise': 'leg',
    });
  });

  it('every id exists in exercises.json', () => {
    for (const id of Object.keys(ONE_SIDED)) expect(ids.has(id), id).toBe(true);
  });

  it('lunges are not one-sided (alternating lunges stay one total, M4f-q6)', () => {
    const lunges = [...names].filter(([, n]) => /lunge/i.test(n)).map(([id]) => id);
    expect(lunges.length).toBeGreaterThan(0);
    for (const id of lunges) {
      expect(isOneSided(id), id).toBe(false);
      expect(oneSidedLimb(id), id).toBeUndefined();
    }
  });

  it('oneSidedLimb / isOneSided read the table', () => {
    expect(oneSidedLimb('One-Arm_Dumbbell_Row')).toBe('arm');
    expect(oneSidedLimb('Single_Leg_Glute_Bridge')).toBe('leg');
    expect(oneSidedLimb('Dumbbell_Bicep_Curl')).toBeUndefined();
    expect(oneSidedLimb('no-such-id')).toBeUndefined();
    expect(isOneSided('Concentration_Curls')).toBe(true);
    expect(isOneSided('Dumbbell_Lunges')).toBe(false);
    // Not fooled by inherited object keys.
    expect(oneSidedLimb('toString')).toBeUndefined();
    expect(isOneSided('constructor')).toBe(false);
  });

  it('the table is frozen', () => {
    expect(Object.isFrozen(ONE_SIDED)).toBe(true);
  });
});

describe('sides', () => {
  it('starts on the right', () => {
    expect(FIRST_SIDE).toBe('right');
  });
  it('otherSide flips', () => {
    expect(otherSide('right')).toBe('left');
    expect(otherSide('left')).toBe('right');
  });
});

describe('ONE_SIDED_COPY', () => {
  it('arm copy', () => {
    const c = ONE_SIDED_COPY.arm;
    expect(c.sideLabel).toEqual({ right: 'Right arm', left: 'Left arm' });
    expect(c.nextButton).toBe('Next arm');
    expect(c.spokenSwitch.left).toBe('Left arm. Turn so your left arm faces the phone.');
    expect(c.spokenSwitch.right).toBe('Right arm. Turn so your right arm faces the phone.');
    expect(c.spokenStart).toBe('Right arm first.');
    expect(c.idleReminder).toBe("Tap Next arm when you're ready.");
  });

  it('leg copy', () => {
    const c = ONE_SIDED_COPY.leg;
    expect(c.sideLabel).toEqual({ right: 'Right leg', left: 'Left leg' });
    expect(c.nextButton).toBe('Next leg');
    expect(c.spokenSwitch.left).toBe('Left leg. Turn so your left leg faces the phone.');
    expect(c.spokenStart).toBe('Right leg first.');
    expect(c.idleReminder).toBe("Tap Next leg when you're ready.");
  });

  it('spoken start names the first side', () => {
    for (const limb of LIMBS) {
      expect(ONE_SIDED_COPY[limb].spokenStart.startsWith(ONE_SIDED_COPY[limb].sideLabel[FIRST_SIDE])).toBe(true);
    }
  });

  it('labels and buttons are at most 8 words', () => {
    for (const limb of LIMBS) {
      const c = ONE_SIDED_COPY[limb];
      for (const s of SIDES) expect(words(c.sideLabel[s])).toBeLessThanOrEqual(8);
      expect(words(c.nextButton)).toBeLessThanOrEqual(8);
    }
  });

  it('spoken lines stay short (at most 12 words)', () => {
    for (const line of allCopy()) expect(words(line), line).toBeLessThanOrEqual(12);
  });

  it('coaching only: no medical or injury words, no gendered words', () => {
    for (const line of allCopy()) {
      expect(line, line).not.toMatch(BANNED);
      expect(line, line).not.toMatch(/\b(he|she|him|her|his|hers|man|woman|guy|girl|bro)\b/i);
    }
  });

  it('the copy is frozen', () => {
    for (const limb of LIMBS) {
      expect(Object.isFrozen(ONE_SIDED_COPY[limb])).toBe(true);
      expect(Object.isFrozen(ONE_SIDED_COPY[limb].sideLabel)).toBe(true);
      expect(Object.isFrozen(ONE_SIDED_COPY[limb].spokenSwitch)).toBe(true);
    }
  });
});
