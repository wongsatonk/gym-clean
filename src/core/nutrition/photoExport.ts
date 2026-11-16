/**
 * M7b: the saved food photos as a zip for training (`ml/` reads it). Pure apart from reading Blobs.
 *
 * Layout (nothing else goes in: no nutrition, no confidence, no photo ids, no device info):
 *   gym-clean-food-photos/<dishFolder>/<createdAt>.jpg
 *   gym-clean-food-photos/labels.csv      `file,dishId,createdAt` (file is relative to the root)
 * `dishFolder` is the dish id made filesystem-safe (`thai:pad_thai` → `thai_pad_thai`);
 * labels.csv carries the exact dish id, so it is the source of truth for labels.
 * `createdAt` is epoch ms. Rows are sorted by createdAt, then dish id.
 */
import type { FoodPhoto } from '../types';
import { localDate } from '../trainer/plan';
import { zipStore, type ZipEntry } from '../zip';

export const PHOTO_EXPORT_ROOT = 'gym-clean-food-photos';

export type PhotoExportItem = { dishId: string; createdAt: number; jpeg: Uint8Array };

export type PhotoExport = { filename: string; bytes: Uint8Array };

/** A dish id as a safe folder name: anything outside `[A-Za-z0-9._-]` becomes `_`. */
export function dishFolder(dishId: string): string {
  const folder = dishId.replace(/[^A-Za-z0-9._-]/g, '_');
  if (folder === '' || /^\.+$/.test(folder))
    throw new Error(`photoExport: bad dish id "${dishId}"`);
  return folder;
}

/** `gym-clean-food-photos-YYYY-MM-DD.zip` for the local date of `now`. */
export function photoExportFilename(now: number): string {
  return `${PHOTO_EXPORT_ROOT}-${localDate(now)}.zip`;
}

function csvField(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds the export zip, or null when there are no photos. Deterministic for the same inputs. */
export function buildPhotoExport(
  items: readonly PhotoExportItem[],
  now: number,
): PhotoExport | null {
  if (items.length === 0) return null;
  for (const it of items) {
    if (!Number.isSafeInteger(it.createdAt) || it.createdAt < 0) {
      throw new Error(`photoExport: bad createdAt ${String(it.createdAt)}`);
    }
  }
  const sorted = [...items].sort(
    (a, b) => a.createdAt - b.createdAt || (a.dishId < b.dishId ? -1 : a.dishId > b.dishId ? 1 : 0),
  );
  const used = new Set<string>();
  const entries: ZipEntry[] = [];
  const rows = ['file,dishId,createdAt'];
  for (const it of sorted) {
    const folder = dishFolder(it.dishId);
    let file = `${folder}/${it.createdAt}.jpg`;
    for (let n = 2; used.has(file); n++) file = `${folder}/${it.createdAt}-${n}.jpg`;
    used.add(file);
    entries.push({ name: `${PHOTO_EXPORT_ROOT}/${file}`, data: it.jpeg, mtime: it.createdAt });
    rows.push([file, it.dishId, String(it.createdAt)].map(csvField).join(','));
  }
  const csv = new TextEncoder().encode(`${rows.join('\n')}\n`);
  entries.push({ name: `${PHOTO_EXPORT_ROOT}/labels.csv`, data: csv, mtime: now });
  return { filename: photoExportFilename(now), bytes: zipStore(entries) };
}

/** Reads the photo blobs and builds the export zip (null for no photos). */
export async function exportFoodPhotos(
  photos: readonly FoodPhoto[],
  now: number,
): Promise<PhotoExport | null> {
  if (photos.length === 0) return null;
  const items = await Promise.all(
    photos.map(async (p) => ({
      dishId: p.dishId,
      createdAt: p.createdAt,
      jpeg: new Uint8Array(await p.blob.arrayBuffer()),
    })),
  );
  return buildPhotoExport(items, now);
}
