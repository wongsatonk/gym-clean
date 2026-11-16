import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDate } from '../trainer/plan';
import type { HealthDay, HealthSettings, HealthType, WeighIn } from '../types';
import type { HealthRead } from './days';
import { planWeighInImport, type BodyMassSample } from './weighIns';
import {
  FIRST_READ_DAYS,
  answerCard,
  healthReadSince,
  syncHealth,
  type HealthSyncSource,
  type HealthSyncStore,
  type SettingsPatch,
} from './sync';

/** Made-up numbers only (the repo is public). */
let tz: string | undefined;
beforeAll(() => {
  tz = process.env.TZ;
  process.env.TZ = 'Asia/Bangkok';
});
afterAll(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

const TODAY = '2026-06-30';
const NOW = Date.parse('2026-06-30T07:30:00+07:00');
const HOUR = 3_600_000;
const midnight = (date: string): number => Date.parse(`${date}T00:00:00+07:00`);

const ALL_ON: Record<HealthType, boolean> = {
  bodyMass: true,
  workouts: true,
  activeEnergy: true,
  sleep: true,
  restingHr: true,
  hrv: true,
};
const ALL_OFF: Record<HealthType, boolean> = {
  bodyMass: false,
  workouts: false,
  activeEnergy: false,
  sleep: false,
  restingHr: false,
  hrv: false,
};

/** In-memory store with the same rules as src/data/health/store.ts (merge by field). */
class FakeStore implements HealthSyncStore {
  settings: HealthSettings;
  days = new Map<string, HealthDay>();
  weighIns: WeighIn[] = [];
  merges: HealthDay[][] = [];
  patches: SettingsPatch[] = [];
  /** Runs right after the plugin read resolves (e.g. he turns a type off). */
  constructor(s: Partial<HealthSettings> = {}) {
    this.settings = { enabled: { ...ALL_ON }, route: 'apple', deletedHealthWeighIns: [], ...s };
  }
  getSettings = async (): Promise<HealthSettings> => structuredClone(this.settings);
  patchSettings = async (update: (s: HealthSettings) => SettingsPatch): Promise<void> => {
    const patch = update(structuredClone(this.settings));
    this.patches.push(patch);
    this.settings = { ...this.settings, ...patch };
  };
  mergeDays = async (days: readonly HealthDay[]): Promise<void> => {
    this.merges.push([...days]);
    for (const d of days) this.days.set(d.date, { ...this.days.get(d.date), ...d });
  };
  listDays = async (from?: string, to?: string): Promise<HealthDay[]> =>
    [...this.days.values()]
      .filter((d) => (from === undefined || d.date >= from) && (to === undefined || d.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date));
  importWeighIns = async (samples: readonly BodyMassSample[]): Promise<WeighIn[]> => {
    const rows = planWeighInImport({
      samples,
      existing: this.weighIns,
      deleted: this.settings.deletedHealthWeighIns ?? [],
    });
    this.weighIns.push(...rows);
    return rows;
  };
}

type ReadCall = { types: readonly HealthType[]; since: number; until?: number };

/** Fake plugin: returns `data` filtered to the asked types, like the real bridge. */
class FakeHealth implements HealthSyncSource {
  calls: ReadCall[] = [];
  available = true;
  status = 'ok';
  throws = false;
  afterRead?: () => Promise<void>;
  constructor(public data: HealthRead = {}) {}
  isAvailable = async (): Promise<boolean> => {
    if (this.throws) throw new Error('bridge gone');
    return this.available;
  };
  read = async (o: ReadCall): Promise<HealthRead & { status: string }> => {
    this.calls.push(o);
    if (this.throws) throw new Error('bridge gone');
    const out: HealthRead & { status: string } = { status: this.status };
    for (const t of o.types) (out as Record<string, unknown>)[t] = this.data[t] ?? [];
    await this.afterRead?.();
    return out;
  };
}

/** A usual night/morning on each of the `n` days before `date` (sleep 420, RHR 55, HRV 60). */
function usualRead(date = TODAY, n = 28): HealthRead {
  const r: Required<HealthRead> = {
    bodyMass: [],
    workouts: [],
    activeEnergy: [],
    sleep: [],
    restingHr: [],
    hrv: [],
  };
  for (let k = 1; k <= n; k++) {
    const d = addDate(date, -k);
    const wake = Date.parse(`${d}T06:30:00+07:00`);
    r.sleep = [...r.sleep, { start: wake - 7 * HOUR, end: wake, asleepMin: 420, source: 'WHOOP' }];
    r.restingHr = [...r.restingHr, { start: wake + HOUR, bpm: 55, source: 'WHOOP' }];
    r.hrv = [...r.hrv, { start: wake + HOUR, ms: 60, source: 'WHOOP' }];
    r.activeEnergy = [...r.activeEnergy, { date: d, start: midnight(d), kcal: 450 }];
    r.bodyMass = [...r.bodyMass, { start: wake + 30 * 60_000, kg: 70 + k / 10, source: 'Scale' }];
  }
  return r;
}

/** Today: short sleep (300) + high resting HR (63) = 2 signals. */
function badToday(base: HealthRead = usualRead(), date = TODAY): HealthRead {
  const wake = Date.parse(`${date}T06:30:00+07:00`);
  return {
    ...base,
    sleep: [
      ...(base.sleep ?? []),
      { start: wake - 5 * HOUR, end: wake, asleepMin: 300, source: 'WHOOP' },
    ],
    restingHr: [...(base.restingHr ?? []), { start: wake + HOUR, bpm: 63, source: 'WHOOP' }],
  };
}

const run = (health: HealthSyncSource | null, store: HealthSyncStore, over = {}) =>
  syncHealth({ health, store, now: NOW, today: TODAY, trainingDay: true, ...over });

describe('healthReadSince', () => {
  it('first read: local midnight 35 days back', () => {
    expect(FIRST_READ_DAYS).toBe(35);
    expect(healthReadSince(undefined, TODAY, NOW)).toBe(midnight(addDate(TODAY, -35)));
  });
  it('then from local midnight of the day before the last read (whole days, no partial totals)', () => {
    const last = Date.parse('2026-06-29T21:10:00+07:00');
    expect(healthReadSince(last, TODAY, NOW)).toBe(midnight('2026-06-28'));
  });
  it('never further back than the first read, never after now', () => {
    expect(healthReadSince(midnight('2026-01-01'), TODAY, NOW)).toBe(midnight(addDate(TODAY, -35)));
    expect(healthReadSince(NOW + 10 * 24 * HOUR, TODAY, NOW)).toBe(midnight('2026-06-29'));
    expect(healthReadSince(Number.NaN, TODAY, NOW)).toBe(midnight(addDate(TODAY, -35)));
  });
});

describe('syncHealth', () => {
  it('first connect: reads 35 days of enabled types, merges days, imports weigh-ins, saves lastReadAt', async () => {
    const store = new FakeStore();
    const health = new FakeHealth(usualRead());
    const res = await run(health, store);

    expect(health.calls).toHaveLength(1);
    expect(health.calls[0]?.since).toBe(midnight(addDate(TODAY, -35)));
    expect(health.calls[0]?.until).toBe(NOW);
    expect([...(health.calls[0]?.types ?? [])].sort()).toEqual(Object.keys(ALL_ON).sort());
    expect(res.status).toBe('ok');
    expect(res.daysMerged).toBe(28);
    expect(store.days.get(addDate(TODAY, -1))).toEqual({
      date: addDate(TODAY, -1),
      sleepMin: 420,
      restingHr: 55,
      hrvMs: 60,
      hrvSource: 'WHOOP',
      activeKcal: 450,
    });
    expect(res.weighIns).toHaveLength(28);
    expect(store.weighIns.find((w) => w.date === addDate(TODAY, -1))).toEqual({
      date: addDate(TODAY, -1),
      kg: 70.1,
      source: 'health',
    });
    expect(store.settings.lastReadAt).toBe(NOW);
    expect(res.card).toBeNull(); // a normal morning: no card
    expect(store.settings.readiness).toBeUndefined();
  });

  it('incremental: reads since the day before lastReadAt; merge keeps older rows', async () => {
    const store = new FakeStore();
    await run(new FakeHealth(usualRead()), store);
    const later = NOW + 26 * HOUR; // next morning
    const health = new FakeHealth(usualRead(addDate(TODAY, 1), 2));
    const res = await syncHealth({
      health,
      store,
      now: later,
      today: addDate(TODAY, 1),
      trainingDay: true,
    });
    expect(health.calls[0]?.since).toBe(midnight(addDate(TODAY, -1)));
    expect(res.status).toBe('ok');
    expect(store.days.size).toBe(29); // 28 old + today's (wake-up date TODAY)
    expect(store.settings.lastReadAt).toBe(later);
  });

  it('only enabled types are asked for, and only they are stored', async () => {
    const store = new FakeStore({ enabled: { ...ALL_OFF, sleep: true, hrv: true } });
    const health = new FakeHealth(usualRead());
    await run(health, store);
    expect([...(health.calls[0]?.types ?? [])].sort()).toEqual(['hrv', 'sleep']);
    const row = store.days.get(addDate(TODAY, -1));
    expect(row).toEqual({ date: addDate(TODAY, -1), sleepMin: 420, hrvMs: 60, hrvSource: 'WHOOP' });
    expect(store.weighIns).toEqual([]);
  });

  it('a type turned off while the read runs: its values are dropped, the switch is not undone', async () => {
    const store = new FakeStore();
    const health = new FakeHealth(usualRead());
    health.afterRead = async () => {
      store.settings = {
        ...store.settings,
        enabled: { ...store.settings.enabled, sleep: false, bodyMass: false },
      };
    };
    const res = await run(health, store);
    expect(res.status).toBe('ok');
    for (const d of store.days.values()) expect(d.sleepMin).toBeUndefined();
    expect(store.days.get(addDate(TODAY, -1))?.restingHr).toBe(55);
    expect(store.weighIns).toEqual([]);
    expect(store.settings.enabled.sleep).toBe(false);
    expect(store.settings.enabled.bodyMass).toBe(false);
    for (const p of store.patches) expect(p).not.toHaveProperty('enabled');
  });

  it('a type turned off between syncs is not asked for again', async () => {
    const store = new FakeStore();
    await run(new FakeHealth(usualRead()), store);
    store.settings.enabled.restingHr = false;
    const health = new FakeHealth(usualRead());
    await run(health, store, { now: NOW + HOUR });
    expect(health.calls[0]?.types).not.toContain('restingHr');
  });

  it('nothing enabled: no read, no writes, no card', async () => {
    const store = new FakeStore({ enabled: { ...ALL_OFF } });
    const health = new FakeHealth(badToday());
    const res = await run(health, store);
    expect(res).toEqual({ status: 'off', daysMerged: 0, weighIns: [], card: null });
    expect(health.calls).toEqual([]);
    expect(store.patches).toEqual([]);
  });

  it('plugin unavailable (PWA), missing or throwing: quiet no-op, never throws', async () => {
    for (const make of [
      () => null,
      () => Object.assign(new FakeHealth(badToday()), { available: false }),
      () => Object.assign(new FakeHealth(badToday()), { throws: true }),
    ]) {
      const store = new FakeStore();
      const res = await run(make(), store);
      expect(res.card).toBeNull();
      expect(res.daysMerged).toBe(0);
      expect(['unavailable', 'failed']).toContain(res.status);
      expect(store.merges).toEqual([]);
      expect(store.patches).toEqual([]);
      expect(store.weighIns).toEqual([]);
    }
  });

  it('a store that throws: reported as failed, never thrown', async () => {
    const store = new FakeStore();
    store.mergeDays = async () => {
      throw new Error('quota');
    };
    const res = await run(new FakeHealth(usualRead()), store);
    expect(res.status).toBe('failed');
    expect(res.card).toBeNull();
  });

  it('locked phone / failed read: nothing merged, lastReadAt kept, card still from stored days', async () => {
    const store = new FakeStore();
    await run(new FakeHealth(badToday()), store, { trainingDay: false });
    const before = store.settings.lastReadAt;
    const health = Object.assign(new FakeHealth(usualRead()), { status: 'locked' });
    store.merges = [];
    const res = await run(health, store, { now: NOW + HOUR });
    expect(res.status).toBe('locked');
    expect(store.merges).toEqual([]);
    expect(store.settings.lastReadAt).toBe(before);
    expect(res.card?.signals).toEqual(['sleepShort', 'restingHrHigh']);
  });

  it('makes today’s card and persists it as lastCard', async () => {
    const store = new FakeStore();
    const res = await run(new FakeHealth(badToday()), store);
    expect(res.card).toMatchObject({
      date: TODAY,
      offer: 'lighter',
      signals: ['sleepShort', 'restingHrHigh'],
    });
    expect(store.settings.readiness?.lastCard).toEqual(res.card);
    expect(store.settings.readiness?.lastDeloadOfferDate).toBeUndefined();
  });

  it('no card on a rest day, mid-workout, or when trainingDay is not known', async () => {
    for (const over of [{ trainingDay: false }, { inWorkout: true }, { trainingDay: undefined }]) {
      const store = new FakeStore();
      const res = await run(new FakeHealth(badToday()), store, over);
      expect(res.status).toBe('ok');
      expect(res.card).toBeNull();
      expect(store.settings.readiness).toBeUndefined();
    }
  });

  it('once per day: the same card again on reopen; none after he answered it', async () => {
    const store = new FakeStore();
    const first = await run(new FakeHealth(badToday()), store);
    // Later reads change today's numbers, but today's card stays as it was shown.
    const second = await run(new FakeHealth(usualRead()), store, { now: NOW + HOUR });
    expect(second.card).toEqual(first.card);

    await answerCard(store, TODAY);
    expect(store.settings.readiness?.answeredDate).toBe(TODAY);
    expect(store.settings.readiness?.lastCard).toEqual(first.card);
    const third = await run(new FakeHealth(badToday()), store, { now: NOW + 2 * HOUR });
    expect(third.card).toBeNull();

    // Next day is a new day.
    const next = addDate(TODAY, 1);
    const fourth = await syncHealth({
      health: new FakeHealth(badToday(usualRead(next), next)),
      store,
      now: NOW + 24 * HOUR,
      today: next,
      trainingDay: true,
    });
    expect(fourth.card?.date).toBe(next);
  });

  it('answerCard never throws', async () => {
    const store = new FakeStore();
    store.patchSettings = async () => {
      throw new Error('quota');
    };
    await expect(answerCard(store, TODAY)).resolves.toBe(false);
  });

  it('deload offer: persisted with lastDeloadOfferDate, then spaced 14 days', async () => {
    // The 2-signal rule fired on 3 of the last 7 days (days -1, -2, -3) and today.
    const base = usualRead(addDate(TODAY, -3), 28);
    const extra: HealthRead = { sleep: [], restingHr: [] };
    for (const d of [addDate(TODAY, -3), addDate(TODAY, -2), addDate(TODAY, -1), TODAY]) {
      const wake = Date.parse(`${d}T06:30:00+07:00`);
      extra.sleep = [
        ...(extra.sleep ?? []),
        { start: wake - 5 * HOUR, end: wake, asleepMin: 300, source: 'WHOOP' },
      ];
      extra.restingHr = [
        ...(extra.restingHr ?? []),
        { start: wake + HOUR, bpm: 63, source: 'WHOOP' },
      ];
    }
    const read: HealthRead = {
      ...base,
      sleep: [...(base.sleep ?? []), ...(extra.sleep ?? [])],
      restingHr: [...(base.restingHr ?? []), ...(extra.restingHr ?? [])],
    };
    const store = new FakeStore();
    const res = await run(new FakeHealth(read), store);
    expect(res.card?.offer).toBe('deload');
    expect(store.settings.readiness).toEqual({ lastCard: res.card, lastDeloadOfferDate: TODAY });

    // Next day, still firing: Lighter, not another Deload (14-day spacing), date kept.
    const next = addDate(TODAY, 1);
    const wake = Date.parse(`${next}T06:30:00+07:00`);
    const res2 = await syncHealth({
      health: new FakeHealth({
        sleep: [{ start: wake - 5 * HOUR, end: wake, asleepMin: 300, source: 'WHOOP' }],
        restingHr: [{ start: wake + HOUR, bpm: 63, source: 'WHOOP' }],
      }),
      store,
      now: NOW + 24 * HOUR,
      today: next,
      trainingDay: true,
    });
    expect(res2.card?.offer).toBe('lighter');
    expect(store.settings.readiness?.lastDeloadOfferDate).toBe(TODAY);
    expect(store.settings.readiness?.lastCard?.date).toBe(next);
  });
});
