/**
 * M11 task 8: the Dexie side of a Health sync. The decisions (what to read, what to keep, the
 * card) are pure in src/core/health/sync.ts; this only maps its `HealthSyncStore` onto
 * src/data/health/store.ts.
 */
import type { HealthSyncStore } from '../../core/health/sync';
import type { GymDb } from '../db';
import {
  getHealthSettings,
  importHealthWeighIns,
  listHealthDays,
  mergeHealthDays,
  saveHealthSettings,
} from './store';

export function healthSyncStore(db: GymDb): HealthSyncStore {
  return {
    getSettings: () => getHealthSettings(db),
    // Read-modify-write in one transaction so a switch flipped in Settings meanwhile isn't undone.
    patchSettings: (update) =>
      db.transaction('rw', db.settings, async () => {
        const s = await getHealthSettings(db);
        await saveHealthSettings(db, { ...s, ...update(s) });
      }),
    mergeDays: (days) => mergeHealthDays(db, days),
    listDays: (from, to) => listHealthDays(db, from, to),
    importWeighIns: (samples) => importHealthWeighIns(db, samples),
  };
}
