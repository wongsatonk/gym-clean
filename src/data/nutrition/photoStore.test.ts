import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FoodModelRecord, FoodPhoto } from '../../core/types';
import { GymDb } from '../db';
import {
  FOOD_VISION_DEFAULT,
  countPhotos,
  deletePhotos,
  getFoodVisionSettings,
  getModel,
  listPhotos,
  maybeSavePhoto,
  removeModel,
  restorePhotos,
  saveModel,
  setFoodVisionSettings,
} from './photoStore';

// Made-up data only (public repo).
const T0 = 1_700_000_000_000;

let db: GymDb;
let n = 0;

beforeEach(async () => {
  db = new GymDb(`photo-store-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const photo = (id: string, createdAt: number, dishId = 'thai:made-up-dish'): FoodPhoto => ({
  id,
  dishId,
  createdAt,
  w: 512,
  h: 384,
  blob: new Blob([new Uint8Array([0xff, 0xd8, createdAt % 256, 0xff, 0xd9])], {
    type: 'image/jpeg',
  }),
});

const model = (over: Partial<FoodModelRecord> = {}): FoodModelRecord => ({
  id: 'food',
  name: 'made-up.tflite',
  sizeBytes: 4,
  labels: ['pad_thai', 'som_tam'],
  importedAt: T0,
  blob: new Blob([new Uint8Array([1, 2, 3, 4])]),
  ...over,
});

const bytes = async (b: Blob): Promise<number[]> => [...new Uint8Array(await b.arrayBuffer())];

describe('food vision settings', () => {
  it('defaults to savePhotos off', async () => {
    expect(FOOD_VISION_DEFAULT).toEqual({ savePhotos: false });
    expect(await getFoodVisionSettings(db)).toEqual({ savePhotos: false });
  });

  it('stores under the settings key foodVision and reads it back', async () => {
    await setFoodVisionSettings(db, { savePhotos: true });
    expect(await getFoodVisionSettings(db)).toEqual({ savePhotos: true });
    expect(await db.settings.get('foodVision')).toEqual({
      key: 'foodVision',
      value: { savePhotos: true },
    });
    await setFoodVisionSettings(db, { savePhotos: false });
    expect(await getFoodVisionSettings(db)).toEqual({ savePhotos: false });
  });

  it('a bad stored value reads as off (only an explicit true turns it on)', async () => {
    for (const value of ['yes', 1, null, { savePhotos: 'true' }, { savePhotos: 1 }]) {
      await db.settings.put({ key: 'foodVision', value });
      expect(await getFoodVisionSettings(db)).toEqual({ savePhotos: false });
    }
  });

  it('writes only the known field', async () => {
    await setFoodVisionSettings(db, { savePhotos: true, extra: 1 } as never);
    expect((await db.settings.get('foodVision'))?.value).toEqual({ savePhotos: true });
  });
});

describe('maybeSavePhoto', () => {
  it('writes nothing when savePhotos is off (photo not kept)', async () => {
    expect(await maybeSavePhoto(db, { savePhotos: false }, photo('p1', T0))).toBe(false);
    expect(await db.foodPhotos.count()).toBe(0);
    expect(await countPhotos(db)).toBe(0);
  });

  it('saves the labelled photo, blob intact, when savePhotos is on', async () => {
    expect(await maybeSavePhoto(db, { savePhotos: true }, photo('p1', T0))).toBe(true);
    const [p] = await listPhotos(db);
    expect(p).toMatchObject({ id: 'p1', dishId: 'thai:made-up-dish', createdAt: T0, w: 512 });
    expect(p && (await bytes(p.blob))).toEqual([0xff, 0xd8, T0 % 256, 0xff, 0xd9]);
    expect(p?.blob.type).toBe('image/jpeg');
  });

  it('rejects a photo without a dish id or blob', async () => {
    await expect(
      maybeSavePhoto(db, { savePhotos: true }, { ...photo('p1', T0), dishId: '' }),
    ).rejects.toThrow(RangeError);
    await expect(
      maybeSavePhoto(db, { savePhotos: true }, { ...photo('p1', T0), blob: undefined as never }),
    ).rejects.toThrow(RangeError);
    expect(await countPhotos(db)).toBe(0);
  });
});

describe('listPhotos / countPhotos / deletePhotos / restorePhotos', () => {
  beforeEach(async () => {
    const on = { savePhotos: true };
    await maybeSavePhoto(db, on, photo('b', T0 + 2, 'thai:som-tam'));
    await maybeSavePhoto(db, on, photo('a', T0 + 1));
    await maybeSavePhoto(db, on, photo('c', T0 + 3));
  });

  it('lists oldest first and counts', async () => {
    expect((await listPhotos(db)).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(await countPhotos(db)).toBe(3);
  });

  it('deletes the given ids and returns them for Undo', async () => {
    const removed = await deletePhotos(db, ['c', 'a', 'missing']);
    expect(removed.map((p) => p.id).sort()).toEqual(['a', 'c']);
    expect((await listPhotos(db)).map((p) => p.id)).toEqual(['b']);
    await restorePhotos(db, removed);
    expect((await listPhotos(db)).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    const c = (await listPhotos(db)).find((p) => p.id === 'c');
    expect(c && (await bytes(c.blob))).toEqual([0xff, 0xd8, (T0 + 3) % 256, 0xff, 0xd9]);
  });

  it('deletes all with no ids ("Delete saved photos") and Undo puts every one back', async () => {
    const removed = await deletePhotos(db);
    expect(removed).toHaveLength(3);
    expect(await countPhotos(db)).toBe(0);
    await restorePhotos(db, removed);
    expect(await countPhotos(db)).toBe(3);
    expect((await listPhotos(db)).map((p) => p.dishId)).toEqual([
      'thai:made-up-dish',
      'thai:som-tam',
      'thai:made-up-dish',
    ]);
  });

  it('restore works even with savePhotos off (Undo is not a new save)', async () => {
    await setFoodVisionSettings(db, { savePhotos: false });
    const removed = await deletePhotos(db, ['b']);
    await restorePhotos(db, removed);
    expect(await countPhotos(db)).toBe(3);
  });

  it('deleting nothing returns an empty list', async () => {
    expect(await deletePhotos(db, [])).toEqual([]);
    expect(await countPhotos(db)).toBe(3);
  });
});

describe('food model', () => {
  it('is absent until saved', async () => {
    expect(await getModel(db)).toBeUndefined();
  });

  it('saves, reads back (blob intact) and replaces the one record', async () => {
    await saveModel(db, model());
    const m = await getModel(db);
    expect(m).toMatchObject({
      id: 'food',
      name: 'made-up.tflite',
      labels: ['pad_thai', 'som_tam'],
    });
    expect(m && (await bytes(m.blob))).toEqual([1, 2, 3, 4]);
    await saveModel(db, model({ name: 'second.tflite', importedAt: T0 + 1 }));
    expect(await db.foodModels.count()).toBe(1);
    expect((await getModel(db))?.name).toBe('second.tflite');
  });

  it('remove returns the old record (for Undo) and leaves none', async () => {
    await saveModel(db, model());
    const old = await removeModel(db);
    expect(old?.name).toBe('made-up.tflite');
    expect(await getModel(db)).toBeUndefined();
    expect(await removeModel(db)).toBeUndefined();
    if (old) await saveModel(db, old);
    expect((await getModel(db))?.name).toBe('made-up.tflite');
  });

  it('rejects a record without labels, blob, or with the wrong id', async () => {
    await expect(saveModel(db, model({ labels: [] }))).rejects.toThrow(RangeError);
    await expect(saveModel(db, model({ labels: ['a', ''] }))).rejects.toThrow(RangeError);
    await expect(saveModel(db, model({ id: 'other' as never }))).rejects.toThrow(RangeError);
    await expect(saveModel(db, model({ blob: undefined as never }))).rejects.toThrow(RangeError);
    expect(await getModel(db)).toBeUndefined();
  });
});
