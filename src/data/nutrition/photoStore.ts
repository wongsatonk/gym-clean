/**
 * M7b food-photo persistence (Dexie v6 tables `foodPhotos` / `foodModels` + settings key
 * 'foodVision'). Everything stays in IndexedDB on the phone: never in the developer log, never
 * in the JSON backup (see LOCAL_ONLY_TABLES in src/data/backup.ts), never uploaded.
 *
 * Photos are written only through `maybeSavePhoto`, which does nothing unless "Save photos to
 * improve recognition" is on (off by default). Deletes return the removed rows so the UI's Undo
 * toast can put them back with `restorePhotos` / `saveModel`.
 */
import type { FoodModelRecord, FoodPhoto, FoodVisionSettings } from '../../core/types';
import type { GymDb } from '../db';

const SETTINGS_KEY = 'foodVision';

export const FOOD_VISION_DEFAULT: Readonly<FoodVisionSettings> = Object.freeze({
  savePhotos: false,
});

// ---------- Settings ----------

/** Stored food-vision settings; only an explicit `savePhotos: true` turns saving on. */
export async function getFoodVisionSettings(db: GymDb): Promise<FoodVisionSettings> {
  const v = (await db.settings.get(SETTINGS_KEY))?.value;
  const on =
    typeof v === 'object' && v !== null && (v as Record<string, unknown>).savePhotos === true;
  return { savePhotos: on };
}

export async function setFoodVisionSettings(db: GymDb, s: FoodVisionSettings): Promise<void> {
  const value: FoodVisionSettings = { savePhotos: s.savePhotos === true };
  await db.settings.put({ key: SETTINGS_KEY, value });
}

// ---------- Photos ----------

function checkPhoto(p: FoodPhoto): void {
  if (typeof p.id !== 'string' || p.id === '') throw new RangeError('Photo needs an id');
  if (typeof p.dishId !== 'string' || p.dishId === '')
    throw new RangeError('Photo needs a dish id');
  if (!(p.blob instanceof Blob)) throw new RangeError('Photo needs an image blob');
}

/**
 * Saves the confirmed, labelled photo only when `settings.savePhotos` is on. Off → writes
 * nothing and returns false (the photo isn't kept anywhere). Throws RangeError on a bad photo.
 */
export async function maybeSavePhoto(
  db: GymDb,
  settings: FoodVisionSettings,
  photo: FoodPhoto,
): Promise<boolean> {
  if (settings.savePhotos !== true) return false;
  checkPhoto(photo);
  await db.foodPhotos.put(photo);
  return true;
}

/** Every saved photo, oldest first (the export order). */
export async function listPhotos(db: GymDb): Promise<FoodPhoto[]> {
  return db.foodPhotos.orderBy('createdAt').toArray();
}

export async function countPhotos(db: GymDb): Promise<number> {
  return db.foodPhotos.count();
}

/**
 * Removes the given photos (no `ids` = all of them, "Delete saved photos") and returns the
 * removed rows unchanged, for `restorePhotos` (Undo). Unknown ids are skipped.
 */
export async function deletePhotos(db: GymDb, ids?: readonly string[]): Promise<FoodPhoto[]> {
  return db.transaction('rw', db.foodPhotos, async () => {
    if (ids === undefined) {
      const all = await db.foodPhotos.toArray();
      await db.foodPhotos.clear();
      return all;
    }
    const rows = (await db.foodPhotos.bulkGet([...ids])).filter(
      (r): r is FoodPhoto => r !== undefined,
    );
    await db.foodPhotos.bulkDelete(rows.map((r) => r.id));
    return rows;
  });
}

/** Undo for `deletePhotos`: puts the rows back as they were (whatever the setting is now). */
export async function restorePhotos(db: GymDb, photos: readonly FoodPhoto[]): Promise<void> {
  if (photos.length === 0) return;
  await db.foodPhotos.bulkPut([...photos]);
}

// ---------- Model ----------

const MODEL_ID: FoodModelRecord['id'] = 'food';

/** Stores (or replaces) the one food model. Throws RangeError on a bad record. */
export async function saveModel(db: GymDb, m: FoodModelRecord): Promise<void> {
  if (m.id !== MODEL_ID) throw new RangeError(`Food model id must be '${MODEL_ID}'`);
  if (!(m.blob instanceof Blob)) throw new RangeError('Food model needs a blob');
  if (!Array.isArray(m.labels) || m.labels.length === 0)
    throw new RangeError('Food model needs labels');
  if (m.labels.some((l) => typeof l !== 'string' || l === ''))
    throw new RangeError('Food model labels must be non-empty strings');
  await db.foodModels.put(m);
}

export async function getModel(db: GymDb): Promise<FoodModelRecord | undefined> {
  return db.foodModels.get(MODEL_ID);
}

/** Removes the model and returns it, so Undo can `saveModel` it back. */
export async function removeModel(db: GymDb): Promise<FoodModelRecord | undefined> {
  return db.transaction('rw', db.foodModels, async () => {
    const old = await db.foodModels.get(MODEL_ID);
    if (old) await db.foodModels.delete(MODEL_ID);
    return old;
  });
}
