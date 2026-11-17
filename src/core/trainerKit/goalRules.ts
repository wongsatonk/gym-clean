/**
 * M12 slice 1b (trainer kit item 3): goal, intake and review rules as data. Every number is a
 * default tuned at a checkpoint; nothing here is tied to one person.
 */
import type { BodyArea, GoalKind, Intake } from '../types';

export const GOAL_KINDS: readonly GoalKind[] = ['muscle', 'fat', 'strength', 'general'];

export const GOAL_KIND_LABELS: Record<GoalKind, string> = {
  muscle: 'Build muscle',
  fat: 'Lose fat',
  strength: 'Get stronger',
  general: 'General fitness',
};

/** A suggested goal is due this many weeks out. */
export const GOAL_WEEKS = 12;
/** At most this many targets on the Goal card. */
export const MAX_GOALS = 2;
/** The lift baseline is the best estimate in this many days back (else the latest one). */
export const GOAL_BASELINE_DAYS = 42;
/** "On track" = progress % no more than this many points under the share of time used. */
export const ON_TRACK_SLACK_PCT = 10;

export type GoalTemplate =
  /** Estimated max +`gainPct`% over the period, written as a weight for `reps` reps. */
  | { kind: 'lift'; reps: number; gainPct: number }
  /** First of `sites` that is in the trainer-kit setting and has a measurement; `deltaCm` from it. */
  | { kind: 'measurement'; sites: readonly string[]; deltaCm: number }
  /** Body weight change in % a week (the middle of the Fuel band for the goal). */
  | { kind: 'weight'; pctPerWeek: number };

export const GOAL_RULES: Record<GoalKind, { targets: readonly GoalTemplate[] }> = {
  muscle: {
    targets: [
      { kind: 'lift', reps: 8, gainPct: 5 },
      { kind: 'measurement', sites: ['leftArm', 'rightArm', 'chest', 'leftThigh', 'rightThigh'], deltaCm: 1 },
    ],
  },
  strength: {
    targets: [
      { kind: 'lift', reps: 5, gainPct: 7.5 },
      { kind: 'lift', reps: 5, gainPct: 7.5 },
    ],
  },
  fat: {
    targets: [
      { kind: 'weight', pctPerWeek: -0.5 },
      { kind: 'measurement', sites: ['waist', 'hips'], deltaCm: -3 },
    ],
  },
  general: { targets: [{ kind: 'lift', reps: 10, gainPct: 5 }] },
};

/** Lift gain multiplier by experience (newer lifters move faster). */
export const EXPERIENCE_GAIN: Record<Intake['experience'], number> = { new: 1.5, some: 1, years: 0.6 };

export const EXPERIENCE_LABELS: Record<Intake['experience'], string> = {
  new: 'New to lifting',
  some: 'Some experience',
  years: 'Years of training',
};

export const BODY_AREAS: readonly BodyArea[] = ['arms', 'shoulders', 'chest', 'back', 'legs', 'core'];

export const AREA_LABELS: Record<BodyArea, string> = {
  arms: 'Arms',
  shoulders: 'Shoulders',
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  core: 'Core',
};

export const INTAKE_DAYS: readonly number[] = [2, 3, 4, 5, 6];
export const INTAKE_DAYS_DEFAULT = 3;
export const INTAKE_SESSION_MIN: readonly Intake['sessionMin'][] = [30, 45, 60, 75];

/** The review comes every 4–6 weeks (trainer-kit setting `reviewWeeks`). */
export const REVIEW_WEEKS_RANGE = [4, 6] as const;
export const REVIEW_WEEKS_DEFAULT = 5;
