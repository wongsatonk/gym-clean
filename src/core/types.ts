// Shared domain types (SPEC §4). Pure data — no DOM or library imports.

export type LandmarkFrame = {
  t: number;
  landmarks: { x: number; y: number; z: number; visibility: number }[];
  world?: { x: number; y: number; z: number }[];
};

export type PlannedExercise = {
  exerciseId: string;
  sets: number;
  targetReps: [min: number, max: number];
  restSec: number;
  startWeightKg?: number;
  tracking: 'pose' | 'manual';
};

export type ProgramDay = { id: string; name: string; exercises: PlannedExercise[] };

export type Program = { name: string; weightUnit: 'kg'; days: ProgramDay[] };

export type Exercise = {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
};

/** M5 live-trainer cues (SPEC M5): ids only; the spoken/shown text lives in the UI. */
export type FocusCueId =
  | 'rushedLowering'
  | 'shrinkingRange'
  | 'stalled'
  | 'outOfFrame'
  | 'lowFps'
  | 'armsOutOfSync'
  | 'raiseTooHigh'
  | 'elbowDrift'
  | 'bodySwing'
  | 'hipSag';

export type SetLog = {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  reps: number;
  partials?: number;
  weightKg: number;
  restTakenSec: number;
  /** The rest target that applied before this set (plan + any +30 s), for overrun advice. */
  restTargetSec?: number;
  focusScore?: number;
  /** M5: one entry per focus/form detection in the set (ids, never text). */
  cues?: FocusCueId[];
  startedAt: number;
  endedAt: number;
};

/** Emitted by the rep counter (SPEC §3). Angles in degrees, times in ms (frame clock). */
export type RepEvent = {
  type: 'rep' | 'partial';
  /** 1-based count within its type (rep 1, 2, … / partial 1, 2, …). */
  index: number;
  eccentricMs: number;
  concentricMs: number;
  minAngle: number;
  maxAngle: number;
  /**
   * Partials only: which end was missed. 'far' = turned around before the far threshold
   * (not deep / high enough); 'start' = went to the far end but didn't return to the start.
   */
  reason?: 'far' | 'start';
  /** Partials only: degrees short of the missed threshold (≥ 0). */
  shortByDeg?: number;
  /** Frame time when the event fired. */
  t: number;
};

/** M4e accent theme (Settings); the mix README defines each colour. */
export type Accent = 'orange' | 'volt' | 'yellow';
