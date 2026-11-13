// Muscle -> mannequin part map for the M4b demos. Pure data, no three.js import. Muscle names are
// the M2 ones (bodyMap.ts MUSCLES, free-exercise-db names); colours come from the M2 viewer.
//
// The demo mannequin is built from these segments (see poses.ts for the joints):
//   torso:    hip -> neck          pelvis: around hip
//   neck:     neck -> head         head
//   shoulder: cap over the shoulder joint (both sides)
//   upperArm: s -> e   forearm: e -> w   hand
//   thigh:    hip joint -> k       shin: k -> a   foot: a -> toe
// Limb segments exist on both sides; a highlight always lights both.
import type { Muscle } from '../bodyMap';

export const MANNEQUIN_SEGMENTS = [
  'head',
  'neck',
  'torso',
  'pelvis',
  'shoulder',
  'upperArm',
  'forearm',
  'hand',
  'thigh',
  'shin',
  'foot',
] as const;
export type Segment = (typeof MANNEQUIN_SEGMENTS)[number];

/**
 * Where on the body the figure faces: `front` = the figure's forward side, `back` its opposite,
 * `outer` away from the body's midline, `inner` toward it. For limbs, front/back follow the body's
 * forward direction as it would be in the anatomical standing pose.
 */
export type Face = 'front' | 'back' | 'outer' | 'inner';

/**
 * A highlight patch: a segment, optionally one face of it and a span along it (0 = the segment's
 * first joint as listed above, 1 = its second). No face/span = the whole segment.
 */
export type HighlightPart = { segment: Segment; face?: Face; span?: readonly [number, number] };

export const MUSCLE_TO_PARTS: Readonly<Record<Muscle, readonly HighlightPart[]>> = {
  abdominals: [{ segment: 'torso', face: 'front', span: [0.15, 0.6] }],
  abductors: [
    { segment: 'pelvis', face: 'outer' },
    { segment: 'thigh', face: 'outer', span: [0, 0.35] },
  ],
  adductors: [{ segment: 'thigh', face: 'inner', span: [0, 0.6] }],
  biceps: [{ segment: 'upperArm', face: 'front', span: [0.15, 0.9] }],
  calves: [{ segment: 'shin', face: 'back', span: [0.05, 0.6] }],
  chest: [{ segment: 'torso', face: 'front', span: [0.6, 0.95] }],
  forearms: [{ segment: 'forearm', span: [0, 0.75] }],
  glutes: [{ segment: 'pelvis', face: 'back' }],
  hamstrings: [{ segment: 'thigh', face: 'back', span: [0.1, 0.9] }],
  lats: [{ segment: 'torso', face: 'outer', span: [0.35, 0.85] }],
  'lower back': [{ segment: 'torso', face: 'back', span: [0, 0.45] }],
  'middle back': [{ segment: 'torso', face: 'back', span: [0.5, 0.9] }],
  neck: [{ segment: 'neck' }],
  quadriceps: [{ segment: 'thigh', face: 'front', span: [0.1, 0.9] }],
  shoulders: [{ segment: 'shoulder' }],
  traps: [
    { segment: 'neck', face: 'back' },
    { segment: 'torso', face: 'back', span: [0.8, 1] },
  ],
  triceps: [{ segment: 'upperArm', face: 'back', span: [0.1, 0.9] }],
};

const isMuscle = (m: string): m is Muscle => Object.hasOwn(MUSCLE_TO_PARTS, m);

/** Parts for one muscle name; [] for a name outside the M2 list. */
export function partsFor(muscle: string): readonly HighlightPart[] {
  return isMuscle(muscle) ? MUSCLE_TO_PARTS[muscle] : [];
}

export type Highlight = HighlightPart & { muscle: Muscle; level: 'primary' | 'secondary' };

/**
 * Patches to light for an exercise: primary muscles strongly, secondary lightly. A muscle listed
 * as both stays primary. Unknown names are skipped.
 */
export function highlightFor(
  primary: readonly string[],
  secondary: readonly string[],
): Highlight[] {
  const out: Highlight[] = [];
  const seen = new Set<string>();
  const addAll = (names: readonly string[], level: Highlight['level']) => {
    for (const name of names) {
      if (!isMuscle(name) || seen.has(name)) continue;
      seen.add(name);
      for (const p of MUSCLE_TO_PARTS[name]) out.push({ ...p, muscle: name, level });
    }
  };
  addAll(primary, 'primary');
  addAll(secondary, 'secondary');
  return out;
}
