// M13c Exercise Library: group the whole catalog by muscle, equipment, plan day, movement or
// A–Z (SPEC M13c goal 6). Pure: the plan, the muscle → area lookup and the gym check are passed
// in, so it runs on made-up catalogs in tests and on the vendored one in the app.
import bodyAreasJson from '../data/bodyAreas.json';
import type { BodyArea, Exercise, LibraryGroupBy } from './types';

/** One folding section of the Library. `area` is set on muscle groups (for an area header). */
export type LibraryGroup = { key: string; label: string; ids: string[]; area?: BodyArea };

/** A plan day as the Library needs it (a `ProgramDay` fits). */
export type LibraryDay = {
  id: string;
  name: string;
  exercises: readonly { exerciseId: string }[];
};

export type LibraryCtx = {
  /** The effective plan's days in rotation order. */
  planDays: readonly LibraryDay[];
  /** The body area of a free-exercise-db muscle (`bodyAreaOf` in src/data/catalog.ts). */
  areaOf: (muscle: string) => BodyArea | undefined;
  /** Display label of a muscle ("Middle back"). */
  muscleLabel: (muscle: string) => string;
  /** Whether this phone's gym has the kit (`gymCanDo`). Filters only when `myGymOnly` is on. */
  canDo?: (id: string) => boolean;
  /** The "My gym only" switch. */
  myGymOnly?: boolean;
  /** Exercises with logged sets: listed first inside muscle / equipment / movement groups. */
  doneIds?: ReadonlySet<string>;
};

/** Body-area order (the bodyAreas.json order, also the coach's area chips). */
export const LIBRARY_AREA_ORDER = Object.keys(bodyAreasJson.areas) as BodyArea[];

/** Muscle order inside each area (bodyAreas.json). */
const MUSCLE_ORDER: readonly string[] = Object.values(bodyAreasJson.areas).flatMap(
  (a) => a.muscles,
);

export type EquipmentGroupKey =
  'dumbbell' | 'barbell' | 'cable' | 'machine' | 'kettlebell' | 'body' | 'other';

/** The Library's equipment groups, in display order. */
export const EQUIPMENT_GROUPS: readonly { key: EquipmentGroupKey; label: string }[] = [
  { key: 'dumbbell', label: 'Dumbbell' },
  { key: 'barbell', label: 'Barbell' },
  { key: 'cable', label: 'Cable' },
  { key: 'machine', label: 'Machine' },
  { key: 'kettlebell', label: 'Kettlebell' },
  { key: 'body', label: 'Body only' },
  { key: 'other', label: 'Other' },
];

/** free-exercise-db `equipment` values → Library group; anything else is Other. */
const EQUIPMENT_FOLD: Readonly<Record<string, EquipmentGroupKey>> = {
  dumbbell: 'dumbbell',
  barbell: 'barbell',
  'e-z curl bar': 'barbell',
  cable: 'cable',
  machine: 'machine',
  kettlebells: 'kettlebell',
  'body only': 'body',
};

export function equipmentGroupOf(equipment: string | null): EquipmentGroupKey {
  return equipment !== null && Object.hasOwn(EQUIPMENT_FOLD, equipment)
    ? (EQUIPMENT_FOLD[equipment] ?? 'other')
    : 'other';
}

/** "Dumbbell", "Body only", "Other". */
export function equipmentGroupLabel(equipment: string | null): string {
  const key = equipmentGroupOf(equipment);
  return EQUIPMENT_GROUPS.find((g) => g.key === key)?.label ?? 'Other';
}

export type MovementGroupKey =
  | 'push-compound'
  | 'push-isolation'
  | 'pull-compound'
  | 'pull-isolation'
  | 'hold-compound'
  | 'hold-isolation'
  | 'other';

/** The Library's movement groups, in display order. */
export const MOVEMENT_GROUPS: readonly { key: MovementGroupKey; label: string }[] = [
  { key: 'push-compound', label: 'Push · compound' },
  { key: 'push-isolation', label: 'Push · isolation' },
  { key: 'pull-compound', label: 'Pull · compound' },
  { key: 'pull-isolation', label: 'Pull · isolation' },
  { key: 'hold-compound', label: 'Hold · compound' },
  { key: 'hold-isolation', label: 'Hold · isolation' },
  { key: 'other', label: 'Other' },
];

const FORCE_FOLD: Readonly<Record<string, 'push' | 'pull' | 'hold'>> = {
  push: 'push',
  pull: 'pull',
  static: 'hold',
};

/** free-exercise-db `force` × `mechanic`; `static` reads as Hold; a missing value is Other. */
export function movementGroupOf(ex: Pick<Exercise, 'force' | 'mechanic'>): MovementGroupKey {
  const force =
    ex.force !== null && Object.hasOwn(FORCE_FOLD, ex.force) ? FORCE_FOLD[ex.force] : undefined;
  const mech = ex.mechanic === 'compound' || ex.mechanic === 'isolation' ? ex.mechanic : undefined;
  return force !== undefined && mech !== undefined ? `${force}-${mech}` : 'other';
}

const NOT_IN_PLAN = 'Not in your plan';

/** Name order: case-insensitive, then id (never locale-dependent, so tests are stable). */
function byName(a: Exercise, b: Exercise): number {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The Library's sections for one group-by. Each exercise sits in exactly one group, except by
 * plan day, where it is listed under every day that has it ("Not in your plan" last). Empty
 * groups are dropped. Inside a group: plan order for days, A–Z for A–Z, otherwise exercises
 * you've done first, then A–Z.
 */
export function groupExercises(
  catalog: readonly Exercise[],
  by: LibraryGroupBy,
  ctx: LibraryCtx,
): LibraryGroup[] {
  const shown =
    ctx.myGymOnly === true && ctx.canDo !== undefined
      ? catalog.filter((e) => ctx.canDo?.(e.id) ?? true)
      : [...catalog];
  const done = ctx.doneIds;
  const doneFirst = (a: Exercise, b: Exercise): number => {
    if (done !== undefined) {
      const d = Number(done.has(b.id)) - Number(done.has(a.id));
      if (d !== 0) return d;
    }
    return byName(a, b);
  };
  const ids = (list: Exercise[], order: (a: Exercise, b: Exercise) => number): string[] =>
    [...list].sort(order).map((e) => e.id);

  switch (by) {
    case 'az':
      return shown.length === 0 ? [] : [{ key: 'az', label: 'A–Z', ids: ids(shown, byName) }];

    case 'equipment':
      return EQUIPMENT_GROUPS.flatMap(({ key, label }) => {
        const list = shown.filter((e) => equipmentGroupOf(e.equipment) === key);
        return list.length === 0
          ? []
          : [{ key: `equipment:${key}`, label, ids: ids(list, doneFirst) }];
      });

    case 'movement':
      return MOVEMENT_GROUPS.flatMap(({ key, label }) => {
        const list = shown.filter((e) => movementGroupOf(e) === key);
        return list.length === 0
          ? []
          : [{ key: `movement:${key}`, label, ids: ids(list, doneFirst) }];
      });

    case 'muscle':
      return muscleGroups(shown, ctx, doneFirst);

    case 'day':
      return dayGroups(shown, ctx.planDays);
  }
}

function muscleGroups(
  shown: Exercise[],
  ctx: LibraryCtx,
  order: (a: Exercise, b: Exercise) => number,
): LibraryGroup[] {
  const byMuscle = new Map<string, Exercise[]>();
  const other: Exercise[] = [];
  for (const e of shown) {
    const main = e.primaryMuscles[0];
    if (main === undefined || ctx.areaOf(main) === undefined) {
      other.push(e);
      continue;
    }
    byMuscle.set(main, [...(byMuscle.get(main) ?? []), e]);
  }
  const rank = (m: string): [number, number] => {
    const area = ctx.areaOf(m);
    const a = area === undefined ? LIBRARY_AREA_ORDER.length : LIBRARY_AREA_ORDER.indexOf(area);
    const i = MUSCLE_ORDER.indexOf(m);
    return [a < 0 ? LIBRARY_AREA_ORDER.length : a, i < 0 ? MUSCLE_ORDER.length : i];
  };
  const muscles = [...byMuscle.keys()].sort((x, y) => {
    const [ax, ix] = rank(x);
    const [ay, iy] = rank(y);
    if (ax !== ay) return ax - ay;
    if (ix !== iy) return ix - iy;
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const groups: LibraryGroup[] = muscles.map((m) => {
    const area = ctx.areaOf(m);
    const list = [...(byMuscle.get(m) ?? [])].sort(order);
    return {
      key: `muscle:${m}`,
      label: ctx.muscleLabel(m),
      ...(area !== undefined ? { area } : {}),
      ids: list.map((e) => e.id),
    };
  });
  if (other.length > 0) {
    groups.push({
      key: 'muscle:other',
      label: 'Other',
      ids: [...other].sort(order).map((e) => e.id),
    });
  }
  return groups;
}

function dayGroups(shown: Exercise[], days: readonly LibraryDay[]): LibraryGroup[] {
  const shownIds = new Set(shown.map((e) => e.id));
  const planned = new Set<string>();
  const groups: LibraryGroup[] = [];
  for (const day of days) {
    const ids: string[] = [];
    for (const row of day.exercises) {
      if (!shownIds.has(row.exerciseId) || ids.includes(row.exerciseId)) continue;
      ids.push(row.exerciseId);
      planned.add(row.exerciseId);
    }
    if (ids.length > 0) groups.push({ key: `day:${day.id}`, label: day.name, ids });
  }
  const rest = shown.filter((e) => !planned.has(e.id)).sort(byName);
  if (rest.length > 0)
    groups.push({ key: 'day:none', label: NOT_IN_PLAN, ids: rest.map((e) => e.id) });
  return groups;
}
