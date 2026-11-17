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
import { listWeighIns, saveWeighIn } from '../nutrition/store';
import {
  HEALTH_SETTINGS_DEFAULT,
  HEALTH_SETTINGS_KEY,
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
  it('stores days, weigh-ins (Health wins over typed), lastReadAt and today’s card; answerCard hides it', async () => {
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
    expect(await db.weighIns.get(TODAY)).toEqual({ date: TODAY, kg: 70.4, source: 'health' });
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

  it('catch-up: an install from before Health wins re-reads 35 days once; Health replaces older typed weigh-ins', async () => {
    // Stored by the old build: lastReadAt a day ago, no weigh-in rule marker.
    const lastReadAt = NOW - 24 * HOUR;
    await db.settings.put({
      key: HEALTH_SETTINGS_KEY,
      value: { ...HEALTH_SETTINGS_DEFAULT, enabled: on, lastReadAt },
    });
    const old = addDate(TODAY, -10);
    await saveWeighIn(db, { date: old, kg: 73, source: 'manual' });
    const sinces: number[] = [];
    const base = plugin(read());
    const spy: HealthSyncSource = {
      isAvailable: base.isAvailable,
      read: async (o) => {
        sinces.push(o.since);
        return base.read(o);
      },
    };
    const store = healthSyncStore(db);
    await syncHealth({ health: spy, store, now: NOW, today: TODAY });
    expect(sinces[0]).toBe(Date.parse(`${addDate(TODAY, -35)}T00:00:00+07:00`));
    expect(await db.weighIns.get(old)).toEqual({ date: old, kg: 70.4, source: 'health' });
    expect((await listWeighIns(db)).every((w) => w.source === 'health')).toBe(true);

    // Only once: the next sync is incremental again.
    await syncHealth({ health: spy, store, now: NOW + HOUR, today: TODAY });
    expect(sinces[1]).toBe(Date.parse(`${addDate(TODAY, -1)}T00:00:00+07:00`));
  });
});
