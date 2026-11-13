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

export type SetLog = {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  reps: number;
  partials?: number;
  weightKg: number;
  restTakenSec: number;
  focusScore?: number;
  cues?: string[];
  startedAt: number;
  endedAt: number;
};
