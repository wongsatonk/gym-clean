import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProgressPhoto } from '../../core/types';
import { GymDb } from '../db';
import { exportAll as exportDevLog, startDevLogSession } from '../devlog';
import {
  addProgressPhoto,
  countProgressPhotos,
  deleteAllProgressPhotos,
  deleteProgressPhoto,
  getProgressPhoto,
  listProgressPhotos,
} from './store';

// Made-up bytes only (public repo): no real image is ever in a test.
const T0 = new Date(2026, 10, 17, 9).getTime();

let n = 0;
let db: GymDb;
beforeEach(async () => {
  db = new GymDb(`progress-photos-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const photo = (id: string, date: string, createdAt: number, over: Partial<ProgressPhoto> = {}) =>
  ({
    id,
    date,
    createdAt,
    blob: new Blob([new Uint8Array([0xff, 0xd8, createdAt % 256, 0xff, 0xd9])], {
      type: 'image/jpeg',
    }),
    ...over,
  }) satisfies ProgressPhoto;

const bytes = async (b: Blob): Promise<number[]> => [...new Uint8Array(await b.arrayBuffer())];

describe('progress photos', () => {
  it('adds a photo and reads it back, blob intact, after a reopen', async () => {
    await addProgressPhoto(db, photo('p1', '2026-11-17', T0, { pose: 'front' }));
    const name = db.name;
    db.close();
    db = new GymDb(name);
    await db.open();
    const p = await getProgressPhoto(db, 'p1');
    expect(p).toMatchObject({ id: 'p1', date: '2026-11-17', createdAt: T0, pose: 'front' });
    expect(p && (await bytes(p.blob))).toEqual([0xff, 0xd8, T0 % 256, 0xff, 0xd9]);
    expect(p?.blob.type).toBe('image/jpeg');
    expect(await getProgressPhoto(db, 'nope')).toBeUndefined();
  });

  it('lists by date, then by when it was taken; counts', async () => {
    await addProgressPhoto(db, photo('c', '2026-11-17', T0 + 2, { pose: 'side' }));
    await addProgressPhoto(db, photo('a', '2026-10-17', T0 + 9));
    await addProgressPhoto(db, photo('b', '2026-11-17', T0 + 1, { pose: 'front' }));
    expect((await listProgressPhotos(db)).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(await countProgressPhotos(db)).toBe(3);
  });

  it('stores only the known fields (no pose when none was picked)', async () => {
    await addProgressPhoto(db, { ...photo('p1', '2026-11-17', T0), extra: 'x' } as ProgressPhoto);
    const row = await db.progressPhotos.get('p1');
    expect(Object.keys(row ?? {}).sort()).toEqual(['blob', 'createdAt', 'date', 'id']);
  });

  it('never replaces a photo: a repeated id is refused', async () => {
    await addProgressPhoto(db, photo('p1', '2026-11-17', T0));
    await expect(addProgressPhoto(db, photo('p1', '2026-11-18', T0 + 1))).rejects.toThrow();
    expect((await getProgressPhoto(db, 'p1'))?.date).toBe('2026-11-17');
  });

  it('refuses a photo without an id, a real date, a time, an image or with an unknown pose', async () => {
    const ok = photo('p1', '2026-11-17', T0);
    const bad: Partial<Record<keyof ProgressPhoto, unknown>>[] = [
      { id: '' },
      { date: '17/11/2026' },
      { date: '2026-02-30' },
      { createdAt: NaN },
      { blob: undefined },
      { blob: 'data:image/jpeg;base64,AA' },
      { pose: 'flex' },
    ];
    for (const over of bad) {
      await expect(addProgressPhoto(db, { ...ok, ...over } as ProgressPhoto)).rejects.toThrow(
        RangeError,
      );
    }
    expect(await countProgressPhotos(db)).toBe(0);
  });

  it('deletes one and returns it; an unknown id changes nothing', async () => {
    await addProgressPhoto(db, photo('p1', '2026-11-17', T0));
    await addProgressPhoto(db, photo('p2', '2026-11-17', T0 + 1));
    expect(await deleteProgressPhoto(db, 'nope')).toBeUndefined();
    const removed = await deleteProgressPhoto(db, 'p1');
    expect(removed?.id).toBe('p1');
    expect(removed && (await bytes(removed.blob))).toEqual([0xff, 0xd8, T0 % 256, 0xff, 0xd9]);
    expect((await listProgressPhotos(db)).map((p) => p.id)).toEqual(['p2']);
  });

  it('deletes all and says how many; nothing else is touched', async () => {
    await db.settings.put({ key: 'unit', value: 'lb' });
    await addProgressPhoto(db, photo('p1', '2026-11-17', T0));
    await addProgressPhoto(db, photo('p2', '2026-11-17', T0 + 1));
    expect(await deleteAllProgressPhotos(db)).toBe(2);
    expect(await countProgressPhotos(db)).toBe(0);
    expect(await deleteAllProgressPhotos(db)).toBe(0);
    expect(await db.settings.count()).toBe(1);
  });

  it('puts nothing in the developer log', async () => {
    const rec = await startDevLogSession(db, { dayId: 'push-a', settings: {} }, { now: () => T0 });
    await addProgressPhoto(db, photo('made-up-photo-id', '2026-11-17', T0, { pose: 'back' }));
    await rec.finish(T0 + 1);
    const text = JSON.stringify(await exportDevLog(db, T0 + 2));
    expect(text).not.toMatch(/made-up-photo-id|pose|blob/);
  });
});
