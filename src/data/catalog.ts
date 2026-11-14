import type { BodyArea, Exercise, Program, ProgramDay } from '../core/types';
import programJson from './program.json';
import exercisesJson from './exercises.json';
import cuesJson from './cues.json';
import howtoJson from './howto.json';
import bodyAreasJson from './bodyAreas.json';
import equipmentJson from './equipment.json';

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

/**
 * The whole exercise catalog (M10): the program exercises plus the swap pool, all vendored from
 * free-exercise-db. Program exercises are a subset.
 */
export function catalogExercises(): readonly Exercise[] {
  return exercises;
}

type BodyAreasData = {
  areas: Record<BodyArea, { label: string; muscles: string[] }>;
  words: Record<string, BodyArea>;
};
const bodyAreas = bodyAreasJson as BodyAreasData;
const areaByMuscle = new Map<string, BodyArea>(
  (Object.entries(bodyAreas.areas) as [BodyArea, { muscles: string[] }][]).flatMap(([area, a]) =>
    a.muscles.map((m) => [m, area] as const),
  ),
);

/** The body area a free-exercise-db muscle belongs to (M10). */
export function bodyAreaOf(muscle: string): BodyArea | undefined {
  return areaByMuscle.get(muscle);
}

/** The muscles in a body area. */
export function musclesIn(area: BodyArea): readonly string[] {
  return bodyAreas.areas[area].muscles;
}

/** Display label of a body area ("Arms"). */
export function bodyAreaLabel(area: BodyArea): string {
  return bodyAreas.areas[area].label;
}

/** The area a typed joint/body word names ("elbow" → arms, "เข่า" → legs), if any. */
export function areaForWord(word: string): BodyArea | undefined {
  const w = word.trim().toLowerCase();
  return Object.hasOwn(bodyAreas.words, w) ? bodyAreas.words[w] : undefined;
}

/** Every joint/body word the area words list knows, with its area (for the intent matcher). */
export function bodyAreaWords(): Readonly<Record<string, BodyArea>> {
  return bodyAreas.words;
}

type EquipmentData = { available: string[]; substitutes: Record<string, string> };
const equipment = equipmentJson as EquipmentData;
const gymKit = new Set(equipment.available);

/** The free-exercise-db equipment values the gym has (M10-q6). */
export function gymEquipment(): readonly string[] {
  return equipment.available;
}

/** Whether the gym can run an exercise with this equipment value (substitutes included). */
export function gymHas(value: string | null): boolean {
  if (value === null) return false;
  const v = Object.hasOwn(equipment.substitutes, value) ? equipment.substitutes[value] : value;
  return v !== undefined && gymKit.has(v);
}
