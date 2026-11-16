import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  HealthMassPoint,
  HealthRead,
  HealthRestingHrPoint,
  HealthSleepRead,
} from '../../core/health/days';
import { answerCard, syncHealth, type HealthSyncSource } from '../../core/health/sync';
import { addDate } from '../../core/trainer/plan';
import type { HealthType } from '../../core/types';
import { GymDb } from '../db';
import { saveWeighIn } from '../nutrition/store';
import {
  HEALTH_SETTINGS_DEFAULT,
  getHealthSettings,
  saveHealthSettings,
  setHealthTypeEnabled,
} from './store';
import { healthSyncStore } from './sync';

// Made-up numbers only (the repo is public).
let tz: string | undefined;
beforeAll(() => {
  tz = process.env.TZ;
  process.env.TZ = 'Asia/Bangkok';
});
afterAll(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

let db: GymDb;
let n = 0;
beforeEach(async () => {
  db = new GymDb(`health-sync-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const TODAY = '2026-06-30';
const NOW = Date.parse('2026-06-30T07:30:00+07:00');
const HOUR = 3_600_000;

function read(): HealthRead {
  const out: {
    sleep: HealthSleepRead[];
    restingHr: HealthRestingHrPoint[];
    bodyMass: HealthMassPoint[];
  } = {
    sleep: [],
    restingHr: [],
    bodyMass: [],
  };
  for (let k = 0; k <= 28; k++) {
    const d = addDate(TODAY, -k);
    const wake = Date.parse(`${d}T06:30:00+07:00`);
    const bad = k === 0;
    out.sleep.push({
      start: wake - 7 * HOUR,
      end: wake,
      asleepMin: bad ? 300 : 420,
      source: 'WHOOP',
    });
    out.restingHr.push({ start: wake + HOUR, bpm: bad ? 63 : 55, source: 'WHOOP' });
    out.bodyMass.push({ start: wake, kg: 70.4, source: 'Scale' });
  }
  return out;
}

function plugin(data: HealthRead, afterRead?: () => Promise<void>): HealthSyncSource {
  return {
    isAvailable: async () => true,
    read: async ({ types }) => {
      const r: Record<string, unknown> = { status: 'ok' };
      for (const t of types as HealthType[]) r[t] = data[t] ?? [];
      await afterRead?.();
      return r as HealthRead & { status: string };
    },
  };
}

const on = { ...HEALTH_SETTINGS_DEFAULT.enabled, sleep: true, restingHr: true, bodyMass: true };

describe('healthSyncStore (Dexie glue for core syncHealth)', () => {
  it('stores days, weigh-ins (typed wins), lastReadAt and today’s card; answerCard hides it', async () => {
    await saveHealthSettings(db, { ...HEALTH_SETTINGS_DEFAULT, enabled: on });
    await saveWeighIn(db, { date: TODAY, kg: 71 });
    const store = healthSyncStore(db);
    const res = await syncHealth({
      health: plugin(read()),
      store,
      now: NOW,
      today: TODAY,
      trainingDay: true,
    });

    expect(res.status).toBe('ok');
    expect(await db.healthDays.count()).toBe(29);
    expect(await db.weighIns.get(TODAY)).toEqual({ date: TODAY, kg: 71 });
    expect(await db.weighIns.get(addDate(TODAY, -1))).toEqual({
      date: addDate(TODAY, -1),
      kg: 70.4,
      source: 'health',
    });
    const s = await getHealthSettings(db);
    expect(s.lastReadAt).toBe(NOW);
    expect(res.card?.signals).toEqual(['sleepShort', 'restingHrHigh']);
    expect(s.readiness?.lastCard).toEqual(res.card);

    expect(await answerCard(store, TODAY)).toBe(true);
    expect((await getHealthSettings(db)).readiness?.answeredDate).toBe(TODAY);
    const again = await syncHealth({
      health: plugin(read()),
      store,
      now: NOW + HOUR,
      today: TODAY,
      trainingDay: true,
    });
    expect(again.card).toBeNull();
  });

  it('a type turned off in Settings while the read runs stays off and stays empty', async () => {
    await saveHealthSettings(db, { ...HEALTH_SETTINGS_DEFAULT, enabled: on });
    const store = healthSyncStore(db);
    const res = await syncHealth({
      health: plugin(read(), () => setHealthTypeEnabled(db, 'sleep', false)),
      store,
      now: NOW,
      today: TODAY,
    });
    expect(res.status).toBe('ok');
    const s = await getHealthSettings(db);
    expect(s.enabled.sleep).toBe(false);
    expect(s.lastReadAt).toBe(NOW);
    const days = await db.healthDays.toArray();
    expect(days.some((d) => d.sleepMin !== undefined)).toBe(false);
    expect(days.find((d) => d.date === TODAY)?.restingHr).toBe(63);
  });
});
