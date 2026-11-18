/**
 * M10e gym profile persistence: the equipment his gym has and the exercises he chose to keep
 * despite missing kit. Stored in the existing `settings` table under key 'gym' (no Dexie version
 * bump). Nothing is written until he edits his gym or taps Keep it; until then the default is his
 * gym from the photos (equipment.json `defaultProfile`).
 */
import type { GymProfile } from '../core/types';
import { defaultGymProfile, equipmentItems, exerciseById } from './catalog';
import type { GymDb } from './db';

export const GYM_SETTINGS_KEY = 'gym';

const knownItems = (): Set<string> => new Set(equipmentItems().map((i) => i.id));
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const unique = (xs: readonly string[]): string[] => [...new Set(xs)];

/** The stored profile, else the default. Unknown ids in a stored row are dropped. */
export async function loadGymProfile(db: GymDb): Promise<GymProfile> {
  const v = (await db.settings.get(GYM_SETTINGS_KEY))?.value;
  if (typeof v !== 'object' || v === null || !Array.isArray((v as GymProfile).equipment)) {
    return defaultGymProfile();
  }
  const row = v as Record<string, unknown>;
  const known = knownItems();
  return {
    equipment: unique(strings(row.equipment).filter((i) => known.has(i))),
    kept: unique(strings(row.kept).filter((id) => exerciseById(id) !== undefined)),
    updatedAt:
      typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : 0,
  };
}

/**
 * Saves his gym's equipment (`now` = edit time, ms). Throws on an unknown item id and writes
 * nothing. Clears `kept`: a new profile asks again.
 */
export async function saveGymProfile(
  db: GymDb,
  equipment: readonly string[],
  now: number,
): Promise<GymProfile> {
  const known = knownItems();
  const unknown = equipment.filter((i) => !known.has(i));
  if (unknown.length > 0) throw new RangeError(`Unknown equipment: ${unknown.join(', ')}`);
  const profile: GymProfile = { equipment: unique(equipment), kept: [], updatedAt: now };
  await db.settings.put({ key: GYM_SETTINGS_KEY, value: profile });
  return profile;
}

/** "Keep it": stop asking about this exercise until the profile changes. */
export async function keepExercise(db: GymDb, exerciseId: string): Promise<GymProfile> {
  if (exerciseById(exerciseId) === undefined) {
    throw new RangeError(`Unknown exercise: ${exerciseId}`);
  }
  return db.transaction('rw', db.settings, async () => {
    const p = await loadGymProfile(db);
    const next: GymProfile = { ...p, kept: unique([...p.kept, exerciseId]) };
    await db.settings.put({ key: GYM_SETTINGS_KEY, value: next });
    return next;
  });
}
