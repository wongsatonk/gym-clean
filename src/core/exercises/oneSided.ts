// SPEC M13b goal 1 + Decision "One-arm sets" (2026-11-17): one-sided exercises are data.
// Each set runs the right side first, then the left, switched by a "Next arm/leg" button.
// Alternating lunges are not here: they stay one total (M4f-q6).
import type { OneSidedLimb, WorkSide } from '../types';

/** Exercise id (src/data/exercises.json) -> the limb it works one side at a time. */
export const ONE_SIDED: Readonly<Record<string, OneSidedLimb>> = Object.freeze({
  'One-Arm_Dumbbell_Row': 'arm',
  Concentration_Curls: 'arm',
  'Seated_One-arm_Cable_Pulley_Rows': 'arm',
  Dumbbell_Step_Ups: 'leg',
  Split_Squat_with_Dumbbells: 'leg',
  Single_Leg_Glute_Bridge: 'leg',
  'Dumbbell_Seated_One-Leg_Calf_Raise': 'leg',
});

/** A one-sided set always starts here. */
export const FIRST_SIDE: WorkSide = 'right';

export function otherSide(side: WorkSide): WorkSide {
  return side === 'right' ? 'left' : 'right';
}

/** The limb a one-sided exercise works, undefined for two-sided ones. */
export function oneSidedLimb(exerciseId: string): OneSidedLimb | undefined {
  return Object.prototype.hasOwnProperty.call(ONE_SIDED, exerciseId)
    ? ONE_SIDED[exerciseId]
    : undefined;
}

export function isOneSided(exerciseId: string): boolean {
  return oneSidedLimb(exerciseId) !== undefined;
}

export type OneSidedCopy = {
  /** Shown above the count ("Right arm"). */
  readonly sideLabel: Readonly<Record<WorkSide, string>>;
  /** Primary button on the first side ("Next arm"). */
  readonly nextButton: string;
  /** Spoken when the set starts ("Right arm first."). */
  readonly spokenStart: string;
  /** Spoken on the switch, keyed by the side being switched to. */
  readonly spokenSwitch: Readonly<Record<WorkSide, string>>;
  /** Spoken once after ~6 s idle on the first side (hands-free). */
  readonly idleReminder: string;
};

function copyFor(limb: OneSidedLimb): OneSidedCopy {
  const label = (side: WorkSide) => `${side === 'right' ? 'Right' : 'Left'} ${limb}`;
  const spokenSwitch = (side: WorkSide) =>
    `${label(side)}. Turn so your ${side} ${limb} faces the phone.`;
  return Object.freeze({
    sideLabel: Object.freeze({ right: label('right'), left: label('left') }),
    nextButton: `Next ${limb}`,
    spokenStart: `${label(FIRST_SIDE)} first.`,
    spokenSwitch: Object.freeze({ right: spokenSwitch('right'), left: spokenSwitch('left') }),
    idleReminder: `Tap Next ${limb} when you're ready.`,
  });
}

/** UI and voice copy for one-sided sets, per limb. */
export const ONE_SIDED_COPY: Readonly<Record<OneSidedLimb, OneSidedCopy>> = Object.freeze({
  arm: copyFor('arm'),
  leg: copyFor('leg'),
});
