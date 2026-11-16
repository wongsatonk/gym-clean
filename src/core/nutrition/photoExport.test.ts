import { describe, expect, it } from 'vitest';
import type { FoodPhoto } from '../types';
import { readZip } from '../zip';
import {
  PHOTO_EXPORT_ROOT,
  buildPhotoExport,
  dishFolder,
  exportFoodPhotos,
  photoExportFilename,
} from './photoExport';

// Made-up data only: fake "JPEG" bytes and fixed times.
const NOW = new Date(2026, 10, 15, 20, 0, 0).getTime(); // local 2026-11-15
const T1 = Date.UTC(2026, 10, 14, 5, 0, 0);
const T2 = Date.UTC(2026, 10, 14, 12, 30, 0);
const jpeg = (n: number): Uint8Array => new Uint8Array([0xff, 0xd8, n, n, 0xff, 0xd9]);
const text = (b: Uint8Array | undefined): string => new TextDecoder().decode(b);

describe('dishFolder', () => {
  it('turns a dish id into a safe folder name', () => {
    expect(dishFolder('thai:pad_thai')).toBe('thai_pad_thai');
    expect(dishFolder('thai:kaeng-khiao.wan')).toBe('thai_kaeng-khiao.wan');
    expect(dishFolder('a/b\\c d')).toBe('a_b_c_d');
  });

  it('rejects empty and dot-only ids', () => {
    expect(() => dishFolder('')).toThrow();
    expect(() => dishFolder('.')).toThrow();
    expect(() => dishFolder('..')).toThrow();
  });
});

describe('photoExportFilename', () => {
  it('names the zip with the local date', () => {
    expect(photoExportFilename(NOW)).toBe('gym-clean-food-photos-2026-11-15.zip');
  });
});

describe('buildPhotoExport', () => {
  it('returns null when there are no photos', () => {
    expect(buildPhotoExport([], NOW)).toBeNull();
  });

  it('writes <root>/<dish>/<createdAt>.jpg plus labels.csv and nothing else', () => {
    const out = buildPhotoExport(
      [
        { dishId: 'thai:som_tam', createdAt: T2, jpeg: jpeg(2) },
        { dishId: 'thai:pad_thai', createdAt: T1, jpeg: jpeg(1) },
      ],
      NOW,
    );
    expect(out?.filename).toBe('gym-clean-food-photos-2026-11-15.zip');
    const files = readZip(out?.bytes ?? new Uint8Array());
    expect(files.map((f) => f.name)).toEqual([
      `${PHOTO_EXPORT_ROOT}/thai_pad_thai/${T1}.jpg`,
      `${PHOTO_EXPORT_ROOT}/thai_som_tam/${T2}.jpg`,
      `${PHOTO_EXPORT_ROOT}/labels.csv`,
    ]);
    expect(Array.from(files[0]?.data ?? [])).toEqual(Array.from(jpeg(1)));
    expect(files[0]?.mtime).toBe(T1);
    expect(text(files[2]?.data)).toBe(
      [
        'file,dishId,createdAt',
        `thai_pad_thai/${T1}.jpg,thai:pad_thai,${T1}`,
        `thai_som_tam/${T2}.jpg,thai:som_tam,${T2}`,
        '',
      ].join('\n'),
    );
  });

  it('keeps both photos when two share a dish and a timestamp', () => {
    const out = buildPhotoExport(
      [
        { dishId: 'thai:pad_thai', createdAt: T1, jpeg: jpeg(1) },
        { dishId: 'thai:pad_thai', createdAt: T1, jpeg: jpeg(2) },
      ],
      NOW,
    );
    const names = readZip(out?.bytes ?? new Uint8Array()).map((f) => f.name);
    expect(names).toEqual([
      `${PHOTO_EXPORT_ROOT}/thai_pad_thai/${T1}.jpg`,
      `${PHOTO_EXPORT_ROOT}/thai_pad_thai/${T1}-2.jpg`,
      `${PHOTO_EXPORT_ROOT}/labels.csv`,
    ]);
  });

  it('quotes CSV fields that need it', () => {
    const out = buildPhotoExport([{ dishId: 'custom:a,"b"', createdAt: T1, jpeg: jpeg(1) }], NOW);
    const csv = text(readZip(out?.bytes ?? new Uint8Array()).at(-1)?.data);
    expect(csv.split('\n')[1]).toBe(`custom_a__b_/${T1}.jpg,"custom:a,""b""",${T1}`);
  });

  it('rejects a bad createdAt', () => {
    expect(() =>
      buildPhotoExport([{ dishId: 'thai:x', createdAt: Number.NaN, jpeg: jpeg(1) }], NOW),
    ).toThrow();
    expect(() =>
      buildPhotoExport([{ dishId: 'thai:x', createdAt: -1, jpeg: jpeg(1) }], NOW),
    ).toThrow();
  });

  it('is deterministic for the same photos and time, in any input order', () => {
    const a = { dishId: 'thai:pad_thai', createdAt: T1, jpeg: jpeg(1) };
    const b = { dishId: 'thai:som_tam', createdAt: T2, jpeg: jpeg(2) };
    const x = buildPhotoExport([a, b], NOW)?.bytes;
    const y = buildPhotoExport([b, a], NOW)?.bytes;
    expect(Array.from(x ?? [])).toEqual(Array.from(y ?? []));
  });
});

describe('exportFoodPhotos', () => {
  const photo = (id: string, dishId: string, createdAt: number, n: number): FoodPhoto => ({
    id,
    dishId,
    createdAt,
    w: 512,
    h: 384,
    blob: new Blob([jpeg(n) as BlobPart], { type: 'image/jpeg' }),
  });

  it('returns null for no photos', async () => {
    expect(await exportFoodPhotos([], NOW)).toBeNull();
  });

  it('reads the blobs and keeps only file, dishId and createdAt (no size, id or other data)', async () => {
    const out = await exportFoodPhotos([photo('p1', 'thai:pad_thai', T1, 7)], NOW);
    const files = readZip(out?.bytes ?? new Uint8Array());
    expect(files).toHaveLength(2);
    expect(Array.from(files[0]?.data ?? [])).toEqual(Array.from(jpeg(7)));
    const csv = text(files[1]?.data);
    expect(csv).toBe(`file,dishId,createdAt\nthai_pad_thai/${T1}.jpg,thai:pad_thai,${T1}\n`);
    expect(csv).not.toContain('p1');
    expect(csv).not.toContain('512');
  });
});
