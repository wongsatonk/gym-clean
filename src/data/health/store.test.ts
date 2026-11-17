import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HealthDay, HealthSettings } from '../../core/types';
import { GymDb } from '../db';
import { currentWeight } from '../../core/nutrition/targets';
import { deleteWeighIn, listWeighIns, saveWeighIn } from '../nutrition/store';
import {
  HEALTH_SETTINGS_DEFAULT,
  HEALTH_SETTINGS_KEY,
  HEALTH_WEIGH_IN_RULE,
  clearDisabledHealthTypes,
  clearHealthType,
  getHealthSettings,
  importHealthWeighIns,
  listHealthDays,
  mergeHealthDays,
  saveHealthSettings,
  setHealthTypeEnabled,
} from './store';

// Made-up numbers only (the repo is public).
let db: GymDb;
let n = 0;
beforeEach(async () => {
  db = new GymDb(`health-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const at = (y: number, mo: number, d: number, h: number): number =>
  new Date(y, mo - 1, d, h).getTime();

const allOn: HealthSettings = {
  ...HEALTH_SETTINGS_DEFAULT,
  enabled: {
    bodyMass: true,
    workouts: true,
    activeEnergy: true,
    sleep: true,
    restingHr: true,
    hrv: true,
    bodyFat: true,
    leanMass: true,
  },
};

const full = (date: string): HealthDay => ({
  date,
  sleepMin: 410,
  restingHr: 55,
  hrvMs: 48,
  hrvSource: 'WHOOP',
  activeKcal: 520,
  workouts: [{ start: at(2030, 1, 7, 7), minutes: 40, kind: 'running', source: 'WHOOP' }],
});

describe('health settings (settings key "health")', () => {
  it('defaults to every type off, route apple, nothing deleted', async () => {
    expect(HEALTH_SETTINGS_KEY).toBe('health');
    expect(await getHealthSettings(db)).toEqual({
      enabled: {
        bodyMass: false,
        workouts: false,
        activeEnergy: false,
        sleep: false,
        restingHr: false,
        hrv: false,
        bodyFat: false,
        leanMass: false,
      },
      route: 'apple',
      deletedHealthWeighIns: [],
    });
  });

  it('M12 1b: a row saved before body fat / lean mass existed reads both as off, the rest unchanged', async () => {
    // Exactly what 1.12.0 stored after Connect: six switches, no bodyFat / leanMass keys.
    await db.settings.put({
      key: HEALTH_SETTINGS_KEY,
      value: {
        enabled: {
          bodyMass: true,
          workouts: true,
          activeEnergy: true,
          sleep: true,
          restingHr: true,
          hrv: true,
        },
        route: 'apple',
        deletedHealthWeighIns: ['2030-01-03'],
        lastReadAt: 1234,
        weighInRule: HEALTH_WEIGH_IN_RULE,
      },
    });
    const s = await getHealthSettings(db);
    expect(s.enabled).toEqual({
      bodyMass: true,
      workouts: true,
      activeEnergy: true,
      sleep: true,
      restingHr: true,
      hrv: true,
      bodyFat: false,
      leanMass: false,
    });
    // No re-read and nothing else reset by the update.
    expect(s.lastReadAt).toBe(1234);
    expect(s.deletedHealthWeighIns).toEqual(['2030-01-03']);
  });

  it('M12 1b: only a real `true` turns body fat / lean mass on', async () => {
    await db.settings.put({
      key: HEALTH_SETTINGS_KEY,
      value: { enabled: { bodyFat: 'yes', leanMass: 1 } },
    });
    const s = await getHealthSettings(db);
    expect(s.enabled.bodyFat).toBe(false);
    expect(s.enabled.leanMass).toBe(false);
    await saveHealthSettings(db, { ...s, enabled: { ...s.enabled, bodyFat: true } });
    expect((await getHealthSettings(db)).enabled).toMatchObject({ bodyFat: true, leanMass: false });
  });

  it('round-trips and repairs a damaged row field by field', async () => {
    await saveHealthSettings(db, { ...allOn, lastReadAt: 123, deletedHealthWeighIns: ['2030-01-07'] });
    expect(await getHealthSettings(db)).toEqual({
      ...allOn,
      lastReadAt: 123,
      deletedHealthWeighIns: ['2030-01-07'],
    });
    await db.settings.put({
      key: 'health',
      value: { enabled: { sleep: true, hrv: 'yes' }, route: 'nope', lastReadAt: 'x', deletedHealthWeighIns: [1, '2030-01-08'] },
    });
    const s = await getHealthSettings(db);
    expect(s.enabled.sleep).toBe(true);
    expect(s.enabled.hrv).toBe(false);
    expect(s.route).toBe('apple');
    expect(s.lastReadAt).toBeUndefined();
    expect(s.deletedHealthWeighIns).toEqual(['2030-01-08']);
  });

  it('one-time catch-up: a row saved before the Health-wins rule forgets lastReadAt (35-day re-read)', async () => {
    // An install from before the change: lastReadAt set, no weigh-in rule marker.
    await db.settings.put({ key: 'health', value: { ...allOn, lastReadAt: 123 } });
    const old = await getHealthSettings(db);
    expect(old.lastReadAt).toBeUndefined();
    expect(old.enabled).toEqual(allOn.enabled);
    // An older marker counts as missing too.
    await db.settings.put({ key: 'health', value: { ...allOn, lastReadAt: 123, weighInRule: 1 } });
    expect((await getHealthSettings(db)).lastReadAt).toBeUndefined();

    // A save (e.g. the sync's lastReadAt) writes the current marker, so it is kept from then on.
    await saveHealthSettings(db, { ...old, lastReadAt: 456 });
    expect(HEALTH_WEIGH_IN_RULE).toBe(2);
    expect((await db.settings.get('health'))?.value).toMatchObject({
      lastReadAt: 456,
      weighInRule: HEALTH_WEIGH_IN_RULE,
    });
    expect(await getHealthSettings(db)).toEqual({ ...allOn, lastReadAt: 456 });
  });

  it('keeps the readiness history and repairs a damaged one field by field', async () => {
    const card = {
      date: '2030-01-07',
      signals: ['sleepShort', 'restingHrHigh'] as const,
      reasons: ['Sleep was about 1 h shorter than usual.', 'Resting heart rate is higher than usual.'],
      offer: 'lighter' as const,
    };
    const readiness = {
      lastCard: { ...card, signals: [...card.signals] },
      answeredDate: '2030-01-07',
      lastDeloadOfferDate: '2030-01-01',
    };
    await saveHealthSettings(db, { ...allOn, readiness });
    expect((await getHealthSettings(db)).readiness).toEqual(readiness);

    await db.settings.put({
      key: 'health',
      value: {
        ...allOn,
        readiness: {
          lastCard: { ...card, signals: ['sleepShort', 'bogus'], offer: 'nap' },
          answeredDate: 'yesterday',
          lastDeloadOfferDate: '2030-01-01',
        },
      },
    });
    expect((await getHealthSettings(db)).readiness).toEqual({ lastDeloadOfferDate: '2030-01-01' });

    await db.settings.put({ key: 'health', value: { ...allOn, readiness: { lastCard: { date: 3 } } } });
    expect((await getHealthSettings(db)).readiness).toBeUndefined();
    await db.settings.put({ key: 'health', value: { ...allOn, readiness: 'x' } });
    expect((await getHealthSettings(db)).readiness).toBeUndefined();
  });
});

describe('healthDays', () => {
  it('merges per date: new fields win, missing fields are kept, workouts are unioned', async () => {
    await mergeHealthDays(db, [full('2030-01-07')]);
    await mergeHealthDays(db, [
      {
        date: '2030-01-07',
        activeKcal: 610,
        workouts: [
          { start: at(2030, 1, 7, 7), minutes: 40, kind: 'running', source: 'WHOOP' },
          { start: at(2030, 1, 7, 18), minutes: 90, kind: 'soccer', source: 'WHOOP' },
        ],
      },
      { date: '2030-01-08', sleepMin: 380 },
    ]);
    const days = await listHealthDays(db);
    expect(days.map((d) => d.date)).toEqual(['2030-01-07', '2030-01-08']);
    expect(days[0]).toMatchObject({ sleepMin: 410, restingHr: 55, activeKcal: 610 });
    expect(days[0]?.workouts?.map((w) => w.kind)).toEqual(['running', 'soccer']);
    expect(await listHealthDays(db, '2030-01-08')).toEqual([{ date: '2030-01-08', sleepMin: 380 }]);
    expect(await listHealthDays(db, '2030-01-01', '2030-01-07')).toHaveLength(1);
  });

  it('refuses a bad date', async () => {
    await expect(mergeHealthDays(db, [{ date: 'today', sleepMin: 1 }])).rejects.toThrow(/date/);
  });
});

describe('clearHealthType', () => {
  it('removes only that type’s values; a row left with nothing is deleted', async () => {
    await mergeHealthDays(db, [full('2030-01-07'), { date: '2030-01-08', hrvMs: 50, hrvSource: 'WHOOP' }]);
    await clearHealthType(db, 'hrv');
    expect(await listHealthDays(db)).toEqual([
      {
        date: '2030-01-07',
        sleepMin: 410,
        restingHr: 55,
        activeKcal: 520,
        workouts: full('2030-01-07').workouts,
      },
    ]);
    await clearHealthType(db, 'sleep');
    await clearHealthType(db, 'restingHr');
    await clearHealthType(db, 'activeEnergy');
    expect(await listHealthDays(db)).toEqual([
      { date: '2030-01-07', workouts: full('2030-01-07').workouts },
    ]);
    await clearHealthType(db, 'workouts');
    expect(await db.healthDays.count()).toBe(0);
  });

  it('bodyMass deletes imported weigh-ins and keeps typed ones', async () => {
    await saveWeighIn(db, { date: '2030-01-07', kg: 70.1 });
    await saveWeighIn(db, { date: '2030-01-08', kg: 70.2, source: 'health' });
    await saveWeighIn(db, { date: '2030-01-09', kg: 70.3, source: 'manual' });
    await clearHealthType(db, 'bodyMass');
    expect(await listWeighIns(db)).toEqual([
      { date: '2030-01-07', kg: 70.1 },
      { date: '2030-01-09', kg: 70.3, source: 'manual' },
    ]);
  });

  it('turning a type off clears it; turning it on keeps data', async () => {
    await saveHealthSettings(db, allOn);
    await mergeHealthDays(db, [full('2030-01-07')]);
    await setHealthTypeEnabled(db, 'sleep', false);
    expect((await getHealthSettings(db)).enabled.sleep).toBe(false);
    expect((await listHealthDays(db))[0]?.sleepMin).toBeUndefined();
    await setHealthTypeEnabled(db, 'sleep', true);
    expect((await getHealthSettings(db)).enabled.sleep).toBe(true);
    expect((await listHealthDays(db))[0]?.restingHr).toBe(55);
  });

  it('turning a type on forgets lastReadAt so the next read goes 35 days back; off keeps it', async () => {
    await saveHealthSettings(db, { ...allOn, enabled: { ...allOn.enabled, hrv: false }, lastReadAt: 123 });
    await setHealthTypeEnabled(db, 'sleep', false);
    expect((await getHealthSettings(db)).lastReadAt).toBe(123);
    await setHealthTypeEnabled(db, 'hrv', true);
    expect((await getHealthSettings(db)).lastReadAt).toBeUndefined();
  });

  it('clearDisabledHealthTypes clears every type that is off (row values only)', async () => {
    await saveHealthSettings(db, { ...allOn, enabled: { ...allOn.enabled, hrv: false, bodyMass: false } });
    await saveWeighIn(db, { date: '2030-01-08', kg: 70.2, source: 'health' });
    await mergeHealthDays(db, [full('2030-01-07')]);
    await clearDisabledHealthTypes(db);
    const d = (await listHealthDays(db))[0];
    expect(d?.hrvMs).toBeUndefined();
    expect(d?.hrvSource).toBeUndefined();
    expect(d?.sleepMin).toBe(410);
    // Weigh-ins are his backed-up data; only clearHealthType('bodyMass') removes them.
    expect(await listWeighIns(db)).toHaveLength(1);
  });
});

describe('body fat + lean mass (M12 1b)', () => {
  const comp = (date: string): HealthDay => ({ date, sleepMin: 410, bodyFatPct: 22.1, leanMassKg: 53.4 });

  it('are stored in healthDays and merge per field like the other values', async () => {
    await mergeHealthDays(db, [{ date: '2030-01-07', sleepMin: 410 }]);
    await mergeHealthDays(db, [{ date: '2030-01-07', bodyFatPct: 22.1, leanMassKg: 53.4 }]);
    await mergeHealthDays(db, [{ date: '2030-01-07', bodyFatPct: 21.8 }]);
    expect(await listHealthDays(db)).toEqual([
      { date: '2030-01-07', sleepMin: 410, bodyFatPct: 21.8, leanMassKg: 53.4 },
    ]);
  });

  it('turning one switch off deletes only that value; a row left empty is removed', async () => {
    await saveHealthSettings(db, allOn);
    await mergeHealthDays(db, [comp('2030-01-07'), { date: '2030-01-08', bodyFatPct: 22 }]);
    await setHealthTypeEnabled(db, 'bodyFat', false);
    expect((await getHealthSettings(db)).enabled).toMatchObject({ bodyFat: false, leanMass: true });
    expect(await listHealthDays(db)).toEqual([
      { date: '2030-01-07', sleepMin: 410, leanMassKg: 53.4 },
    ]);
    await clearHealthType(db, 'leanMass');
    expect(await listHealthDays(db)).toEqual([{ date: '2030-01-07', sleepMin: 410 }]);
  });

  it('turning a switch on forgets lastReadAt, so its history is read (35 days)', async () => {
    await saveHealthSettings(db, {
      ...allOn,
      enabled: { ...allOn.enabled, bodyFat: false, leanMass: false },
      lastReadAt: 123,
    });
    await setHealthTypeEnabled(db, 'leanMass', true);
    const s = await getHealthSettings(db);
    expect(s.enabled).toMatchObject({ bodyFat: false, leanMass: true });
    expect(s.lastReadAt).toBeUndefined();
  });

  it('never touch weigh-ins: clearing them leaves typed and imported weights alone', async () => {
    await saveWeighIn(db, { date: '2030-01-07', kg: 70.1 });
    await saveWeighIn(db, { date: '2030-01-08', kg: 70.2, source: 'health' });
    await mergeHealthDays(db, [comp('2030-01-07')]);
    expect(await listWeighIns(db)).toHaveLength(2);
    await clearHealthType(db, 'bodyFat');
    await clearHealthType(db, 'leanMass');
    expect(await listWeighIns(db)).toEqual([
      { date: '2030-01-07', kg: 70.1 },
      { date: '2030-01-08', kg: 70.2, source: 'health' },
    ]);
  });

  it('clearDisabledHealthTypes (after a restore) removes both when their switches are off', async () => {
    await saveHealthSettings(db, {
      ...allOn,
      enabled: { ...allOn.enabled, bodyFat: false, leanMass: false },
    });
    await mergeHealthDays(db, [comp('2030-01-07')]);
    await clearDisabledHealthTypes(db);
    expect(await listHealthDays(db)).toEqual([{ date: '2030-01-07', sleepMin: 410 }]);
  });
});

describe('importHealthWeighIns', () => {
  const samples = [
    { time: at(2030, 1, 7, 7), kg: 70.2 },
    { time: at(2030, 1, 8, 7), kg: 70.4 },
    { time: at(2030, 1, 9, 7), kg: 70.6 },
  ];

  it('Health wins: replaces a typed weigh-in on a date it has a sample for; deleted dates stay as he left them', async () => {
    await saveWeighIn(db, { date: '2030-01-07', kg: 69.9 });
    await saveWeighIn(db, { date: '2030-01-09', kg: 69.7, source: 'manual' });
    await saveWeighIn(db, { date: '2030-01-10', kg: 69.5 }); // no Health sample that day
    await saveHealthSettings(db, { ...allOn, deletedHealthWeighIns: ['2030-01-09'] });
    expect(await importHealthWeighIns(db, samples)).toEqual([
      { date: '2030-01-07', kg: 70.2, source: 'health' },
      { date: '2030-01-08', kg: 70.4, source: 'health' },
    ]);
    expect(await listWeighIns(db)).toEqual([
      { date: '2030-01-07', kg: 70.2, source: 'health' },
      { date: '2030-01-08', kg: 70.4, source: 'health' },
      { date: '2030-01-09', kg: 69.7, source: 'manual' },
      { date: '2030-01-10', kg: 69.5 },
    ]);
  });

  it("a later read moves an imported weigh-in to Health's new pick; same value writes nothing", async () => {
    await importHealthWeighIns(db, [{ time: at(2030, 1, 7, 19), kg: 71.1 }]);
    expect(await db.weighIns.get('2030-01-07')).toEqual({ date: '2030-01-07', kg: 71.1, source: 'health' });
    const later = [
      { time: at(2030, 1, 7, 19), kg: 71.1 },
      { time: at(2030, 1, 7, 6), kg: 70.5 },
    ];
    expect(await importHealthWeighIns(db, later)).toEqual([
      { date: '2030-01-07', kg: 70.5, source: 'health' },
    ]);
    expect(await importHealthWeighIns(db, later)).toEqual([]);
    expect(await listWeighIns(db)).toEqual([{ date: '2030-01-07', kg: 70.5, source: 'health' }]);
  });

  it("Fuel's current weight is the Health value after it replaces today's typed weigh-in", async () => {
    await saveWeighIn(db, { date: '2030-01-09', kg: 74, source: 'manual' });
    await importHealthWeighIns(db, [{ time: at(2030, 1, 9, 7), kg: 70.6 }]);
    expect(currentWeight(await listWeighIns(db), '2030-01-09')).toEqual({ kg: 70.6, from: 'avg7' });
  });

  it('a weigh-in typed over an import stays until the next read brings a Health value for that date', async () => {
    await importHealthWeighIns(db, samples);
    await saveWeighIn(db, { date: '2030-01-08', kg: 69.0, source: 'manual' });
    expect(await db.weighIns.get('2030-01-08')).toEqual({ date: '2030-01-08', kg: 69.0, source: 'manual' });
    // Next read without a sample that day (e.g. outside its window): the typed row stays.
    await importHealthWeighIns(db, [{ time: at(2030, 1, 9, 7), kg: 70.6 }]);
    expect(await db.weighIns.get('2030-01-08')).toEqual({ date: '2030-01-08', kg: 69.0, source: 'manual' });
    // A read that has that date: Health wins.
    await importHealthWeighIns(db, samples);
    expect(await db.weighIns.get('2030-01-08')).toEqual({ date: '2030-01-08', kg: 70.4, source: 'health' });
  });

  it('a deleted import is remembered and never comes back; Undo forgets it', async () => {
    await importHealthWeighIns(db, samples);
    const removed = await deleteWeighIn(db, '2030-01-08');
    expect(removed).toEqual({ date: '2030-01-08', kg: 70.4, source: 'health' });
    expect((await getHealthSettings(db)).deletedHealthWeighIns).toEqual(['2030-01-08']);
    expect(await importHealthWeighIns(db, samples)).toEqual([]);
    expect(await db.weighIns.get('2030-01-08')).toBeUndefined();

    // Undo puts the import back and forgets the deletion.
    await saveWeighIn(db, removed as NonNullable<typeof removed>);
    expect((await getHealthSettings(db)).deletedHealthWeighIns).toEqual([]);
  });

  it('deleting a typed weigh-in is not remembered (Health may fill that date later)', async () => {
    await saveWeighIn(db, { date: '2030-01-08', kg: 69 });
    await deleteWeighIn(db, '2030-01-08');
    expect((await getHealthSettings(db)).deletedHealthWeighIns).toEqual([]);
    expect(await importHealthWeighIns(db, samples)).toHaveLength(3);
  });
});
