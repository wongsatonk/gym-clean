import type { Exercise, Program, ProgramDay } from '../core/types';
import programJson from './program.json';
import exercisesJson from './exercises.json';
import cuesJson from './cues.json';

// Exercise data vendored from yuhonas/free-exercise-db (Unlicense).
export const program = programJson as Program;
const exercises = exercisesJson as Exercise[];
const cues = cuesJson as Record<string, string>;
const byId = new Map(exercises.map((e) => [e.id, e]));

export function exerciseById(id: string): Exercise | undefined {
  return byId.get(id);
}

export function exerciseName(id: string): string {
  return byId.get(id)?.name ?? id.replace(/_/g, ' ');
}

export function cueFor(id: string): string {
  return cues[id] ?? '';
}

export function programDay(id: string): ProgramDay | undefined {
  return program.days.find((d) => d.id === id);
}
