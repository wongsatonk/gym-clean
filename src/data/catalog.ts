import type { BodyArea, Exercise, GymProfile, Program, ProgramDay } from '../core/types';
import { kitSatisfied, missingItems, type KitNeeds } from '../core/trainer/equipment';
import programJson from './program.json';
import exercisesJson from './exercises.json';
import cuesJson from './cues.json';
import howtoJson from './howto.json';
import bodyAreasJson from './bodyAreas.json';
import equipmentJson from './equipment.json';
import exerciseKitJson from './exerciseKit.json';

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

// ---------- M10e: gym equipment and per-exercise kit needs ----------

/** One piece of gym kit an exercise can need (equipment.json). */
export type EquipmentItem = { id: string; label: string; group: string };

type EquipmentData = {
  items: EquipmentItem[];
  defaultProfile: string[];
  /** Legacy coarse check (gymHas), removed in M10e task 9b. */
  available: string[];
  substitutes: Record<string, string>;
};
type ExerciseKit = { needs: string[][]; replaceWith?: string[] };
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

const exerciseKit = exerciseKitJson as Record<string, ExerciseKit>;
const itemById = new Map(equipment.items.map((i) => [i.id, i]));

/** Every equipment item, in display order (grouped). */
export function equipmentItems(): readonly EquipmentItem[] {
  return equipment.items;
}

/** The label of an equipment item ("Leg press"), else the id. */
export function equipmentLabel(id: string): string {
  return itemById.get(id)?.label ?? id;
}

/** His gym as read from his photos (Decision "Gym equipment (M10-q6)"); a fresh copy. */
export function defaultGymProfile(): GymProfile {
  return { equipment: [...equipment.defaultProfile], kept: [], updatedAt: 0 };
}

/** The kit an exercise needs: any one of the lists, each list all-of. `[[]]` = bodyweight. */
export function kitNeeds(id: string): KitNeeds | undefined {
  return Object.hasOwn(exerciseKit, id) ? exerciseKit[id]?.needs : undefined;
}

/** Whether the gym profile has the kit for the exercise. Unknown ids are never doable. */
export function gymCanDo(id: string, profile: Pick<GymProfile, 'equipment'>): boolean {
  const needs = kitNeeds(id);
  return needs !== undefined && kitSatisfied(needs, profile.equipment);
}

/**
 * The labels of the kit the profile lacks for the exercise (closest need list), e.g.
 * ["Leg press"]. Empty when it's doable or unknown.
 */
export function missingKitLabels(id: string, profile: Pick<GymProfile, 'equipment'>): string[] {
  const needs = kitNeeds(id);
  return needs === undefined ? [] : missingItems(needs, profile.equipment).map(equipmentLabel);
}

/** The closest replacements for an exercise, best first (data `replaceWith`). */
export function preferredSwaps(id: string): readonly string[] {
  return (Object.hasOwn(exerciseKit, id) ? exerciseKit[id]?.replaceWith : undefined) ?? [];
}
