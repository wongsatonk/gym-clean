/**
 * M12 slice 1b progress photos (Dexie v10 table `progressPhotos`). They stay in IndexedDB on this
 * phone: never in the JSON backup (LOCAL_ONLY_TABLES in src/data/backup.ts; a restore leaves them
 * alone), never in the developer log, never sent anywhere and never shown to a coach.
 *
 * The UI hands in a Blob it has already downscaled; nothing here reads or changes the image.
 */
import type { ProgressPhoto } from '../../core/types';
import type { GymDb } from '../db';

const POSES: readonly NonNullable<ProgressPhoto['pose']>[] = ['front', 'side', 'back'];

/** A real local calendar date, YYYY-MM-DD. */
function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * Stores a new photo (known fields only). Throws RangeError on a bad photo; a photo is never
 * replaced, so an id that is already stored is refused (Dexie ConstraintError).
 */
export async function addProgressPhoto(db: GymDb, photo: ProgressPhoto): Promise<void> {
  if (typeof photo.id !== 'string' || photo.id === '') throw new RangeError('Photo needs an id');
  if (!isDate(photo.date)) throw new RangeError('Photo needs a date (YYYY-MM-DD)');
  if (typeof photo.createdAt !== 'number' || !Number.isFinite(photo.createdAt))
    throw new RangeError('Photo needs a created time');
  if (!(photo.blob instanceof Blob)) throw new RangeError('Photo needs an image blob');
  if (photo.pose !== undefined && !POSES.includes(photo.pose))
    throw new RangeError('Photo pose is front, side or back');
  await db.progressPhotos.add({
    id: photo.id,
    date: photo.date,
    createdAt: photo.createdAt,
    blob: photo.blob,
    ...(photo.pose !== undefined ? { pose: photo.pose } : {}),
  });
}

/** Every photo by date, then by when it was taken (oldest first). */
export async function listProgressPhotos(db: GymDb): Promise<ProgressPhoto[]> {
  const rows = await db.progressPhotos.orderBy('createdAt').toArray();
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export async function getProgressPhoto(db: GymDb, id: string): Promise<ProgressPhoto | undefined> {
  return db.progressPhotos.get(id);
}

export async function countProgressPhotos(db: GymDb): Promise<number> {
  return db.progressPhotos.count();
}

/** Removes one photo and returns it; undefined (nothing changed) when there is none. */
export async function deleteProgressPhoto(
  db: GymDb,
  id: string,
): Promise<ProgressPhoto | undefined> {
  return db.transaction('rw', db.progressPhotos, async () => {
    const row = await db.progressPhotos.get(id);
    if (row) await db.progressPhotos.delete(id);
    return row;
  });
}

/** Removes every progress photo ("Delete all photos"). Returns how many were removed. */
export async function deleteAllProgressPhotos(db: GymDb): Promise<number> {
  return db.transaction('rw', db.progressPhotos, async () => {
    const count = await db.progressPhotos.count();
    await db.progressPhotos.clear();
    return count;
  });
}
