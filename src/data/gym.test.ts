import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GymDb } from './db';
import { defaultGymProfile } from './catalog';
import { GYM_SETTINGS_KEY, keepExercise, loadGymProfile, saveGymProfile } from './gym';

// M10e task 6: the gym profile lives in the existing settings table (key 'gym'), no new Dexie
// version. Profiles here are made up.
let db: GymDb;
let n = 0;
beforeEach(async () => {
  db = new GymDb(`gym-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('gym profile store (M10e)', () => {
  it('reads the default on first use and writes nothing', async () => {
    expect(await loadGymProfile(db)).toEqual(defaultGymProfile());
    expect(await db.settings.get(GYM_SETTINGS_KEY)).toBeUndefined();
  });

  it('round-trips a saved profile (deduped, with the time passed in)', async () => {
    const saved = await saveGymProfile(db, ['dumbbells', 'adjustable-bench', 'dumbbells'], 1_000);
    expect(saved).toEqual({
      equipment: ['dumbbells', 'adjustable-bench'],
      kept: [],
      updatedAt: 1_000,
    });
    expect(await loadGymProfile(db)).toEqual(saved);
    expect((await db.settings.get('gym'))?.value).toEqual(saved);
  });

  it('rejects unknown equipment ids and keeps the stored profile', async () => {
    await saveGymProfile(db, ['dumbbells'], 1_000);
    await expect(saveGymProfile(db, ['dumbbells', 'hover-board'], 2_000)).rejects.toThrow(
      /hover-board/,
    );
    expect((await loadGymProfile(db)).equipment).toEqual(['dumbbells']);
  });

  it('remembers a kept exercise (once), on top of the default profile', async () => {
    await keepExercise(db, 'Leg_Press');
    await keepExercise(db, 'Leg_Press');
    const p = await loadGymProfile(db);
    expect(p.kept).toEqual(['Leg_Press']);
    expect(p.equipment).toEqual(defaultGymProfile().equipment);
    await keepExercise(db, 'Standing_Calf_Raises');
    expect((await loadGymProfile(db)).kept).toEqual(['Leg_Press', 'Standing_Calf_Raises']);
  });

  it('rejects keeping an unknown exercise', async () => {
    await expect(keepExercise(db, 'Nope')).rejects.toThrow(/Nope/);
    expect(await db.settings.get('gym')).toBeUndefined();
  });

  it('saving the gym clears kept (a new profile asks again)', async () => {
    await keepExercise(db, 'Leg_Press');
    const saved = await saveGymProfile(db, defaultGymProfile().equipment, 3_000);
    expect(saved.kept).toEqual([]);
    expect((await loadGymProfile(db)).kept).toEqual([]);
  });

  it('falls back sanely on a damaged row', async () => {
    await db.settings.put({ key: 'gym', value: 'nonsense' });
    expect(await loadGymProfile(db)).toEqual(defaultGymProfile());
    await db.settings.put({
      key: 'gym',
      value: {
        equipment: ['dumbbells', 'hover-board', 7],
        kept: ['Leg_Press', 'Nope'],
        updatedAt: 5,
      },
    });
    expect(await loadGymProfile(db)).toEqual({
      equipment: ['dumbbells'],
      kept: ['Leg_Press'],
      updatedAt: 5,
    });
  });

  it('needs no table of its own (the profile lives in settings)', () => {
    expect(db.tables.map((t) => t.name)).not.toContain('gym');
  });
});
