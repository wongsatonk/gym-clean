import type { Exercise, Program, ProgramDay } from '../core/types';
import programJson from './program.json';
import exercisesJson from './exercises.json';
import cuesJson from './cues.json';
import howtoJson from './howto.json';

// Exercise data vendored from yuhonas/free-exercise-db (Unlicense).
export const program = programJson as Program;
const exercises = exercisesJson as Exercise[];
const cues = cuesJson as Record<string, string>;
/** How-to text (M4b), written for this app in coaching language. */
export type HowTo = {
  /** 2-3 short steps, each at most 70 chars. */
  lines: string[];
  /** Which muscles to feel it in ("Focus: chest. Triceps help."). */
  focus: string;
  /** Tempo text ("Lift 1 s · Lower 2 s"). */
  tempo: string;
};
const howto = howtoJson as Record<string, HowTo>;
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

export function howToFor(id: string): HowTo | undefined {
  return Object.hasOwn(howto, id) ? howto[id] : undefined;
}
