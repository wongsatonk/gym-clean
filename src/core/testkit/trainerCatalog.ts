// Test-only: the vendored catalog wired as a TrainerCatalog the way src/ui/app.ts does it with
// src/data/catalog.ts (src/core can't import src/data code, only its JSON). Kit needs and the
// default gym profile come from exerciseKit.json / equipment.json (M10e).
import exercisesJson from '../../data/exercises.json';
import bodyAreasJson from '../../data/bodyAreas.json';
import equipmentJson from '../../data/equipment.json';
import exerciseKitJson from '../../data/exerciseKit.json';
import { kitSatisfied, missingItems } from '../trainer/equipment';
import type { TrainerCatalog } from '../trainer/swapCandidates';
import type { BodyArea, Exercise } from '../types';

type Kit = { needs: string[][]; replaceWith?: string[] };
const kit = exerciseKitJson as Record<string, Kit>;
const labels = new Map(equipmentJson.items.map((i) => [i.id, i.label]));

export const EXERCISES = exercisesJson as Exercise[];
const areaByMuscle = new Map<string, BodyArea>();
for (const [area, a] of Object.entries(bodyAreasJson.areas)) {
  for (const m of a.muscles) areaByMuscle.set(m, area as BodyArea);
}

/** His gym's default equipment (equipment.json `defaultProfile`). */
export const DEFAULT_EQUIPMENT: readonly string[] = equipmentJson.defaultProfile;

/** A TrainerCatalog for a gym with `equipment` (default: his gym). */
export function trainerCatalog(equipment: readonly string[] = DEFAULT_EQUIPMENT): TrainerCatalog {
  return {
    exercises: EXERCISES,
    areaOf: (m) => areaByMuscle.get(m),
    canDo: (id) => kitSatisfied(kit[id]?.needs ?? [], equipment),
    preferred: (id) => kit[id]?.replaceWith ?? [],
    missingKitLabels: (id) =>
      missingItems(kit[id]?.needs ?? [], equipment).map((i) => labels.get(i) ?? i),
  };
}
