/// <reference types="node" />
// M11 task 11: the Health wiring (healthHost.ts) with a fake plugin and fake-indexeddb, plus the
// privacy check that nothing from Health reaches the coach context. Made-up numbers only.
import 'fake-indexeddb/auto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthRead } from '../core/health/days';
import { addDate } from '../core/trainer/plan';
import { HEALTH_CONNECT_TYPES, HEALTH_TYPES, type HealthType } from '../core/types';
import { GymDb } from '../data/db';
import { HEALTH_SETTINGS_KEY, getHealthSettings, listHealthDays } from '../data/health/store';
import { listWeighIns, saveWeighIn } from '../data/nutrition/store';
import { saveDayFeel } from '../data/trainerKit/store';
import { createHealthHost, type CardChip, type HealthApi } from './healthHost';
import { asFake, useFakeDom, type FakeEl } from './screens/testDom';

useFakeDom();

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
  db = new GymDb(`health-host-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const TODAY = '2026-06-30';
const NOW = Date.parse('2026-06-30T07:30:00+07:00');
const HOUR = 3_600_000;

/** 28 usual nights + a short one with a high resting HR this morning. */
function data(): HealthRead {
  const sleep = [];
  const restingHr = [];
  for (let k = 0; k <= 28; k++) {
    const wake = Date.parse(`${addDate(TODAY, -k)}T06:30:00+07:00`);
    const bad = k === 0;
    sleep.push({ start: wake - 7 * HOUR, end: wake, asleepMin: bad ? 300 : 420, source: 'Band' });
    restingHr.push({ start: wake + HOUR, bpm: bad ? 63 : 55, source: 'Band' });
  }
  return { sleep, restingHr, bodyMass: [{ start: NOW - HOUR, kg: 70.4, source: 'Scale' }] };
}

function fakeApi() {
  const calls = { requestRead: [] as HealthType[][], read: 0 };
  const d = data();
  const api: HealthApi = {
    isAvailable: async () => true,
    requestRead: async (types) => {
      calls.requestRead.push([...types]);
      return true;
    },
    read: async ({ types }) => {
      calls.read++;
      const r: Record<string, unknown> = { status: 'ok' };
      for (const t of types) r[t] = d[t] ?? [];
      return r as HealthRead & { status: string };
    },
  };
  return { api, calls };
}

function host(
  api: HealthApi | null,
  clock = { now: NOW, trainingDay: true as boolean | undefined },
  logError: (err: unknown) => void = (err) => {
    throw err;
  },
) {
  const renders = { n: 0 };
  const h = createHealthHost({
    db,
    now: () => clock.now,
    render: () => renders.n++,
    trainingDay: () => clock.trainingDay,
    inWorkout: () => false,
    sessions: () => [],
    onWeighIns: () => undefined,
    logError,
    loadHealth: async () => api,
  });
  return { h, renders };
}

const attr = (el: FakeEl, name: string, value?: string) =>
  el.find((e) => (value === undefined ? e.hasAttribute(name) : e.getAttribute(name) === value));
const one = (el: FakeEl, name: string, value?: string) => {
  const hit = attr(el, name, value)[0];
  if (!hit) throw new Error(`no [${name}${value === undefined ? '' : `=${value}`}]`);
  return hit;
};

async function connect(h: ReturnType<typeof host>['h']) {
  await h.sync(); // the app-open sync loads the plugin
  one(asFake(h.settingsScreen(() => undefined)), 'data-health-connect').click();
  await vi.waitFor(async () => expect((await getHealthSettings(db)).lastReadAt).toBe(NOW));
  await h.sync();
}

describe('healthHost', () => {
  it('PWA (no plugin): the iPhone-app line, no card, no week line, nothing stored', async () => {
    const { h } = host(null);
    await h.sync();
    expect(h.todayProps()).toEqual({ readiness: null, weekLoad: null });
    const el = asFake(h.settingsScreen(() => undefined));
    expect(attr(el, 'data-health-pwa')).toHaveLength(1);
    expect(attr(el, 'data-health-connect')).toHaveLength(0);
    expect(await db.healthDays.count()).toBe(0);
    expect(h.fuelHost.activitySuggestion('light')).toBeNull();
  });

  it('Connect with every type off turns on the six, asks iOS for them, reads, and shows the card', async () => {
    const { api, calls } = fakeApi();
    const { h } = host(api);
    await connect(h);
    expect(calls.requestRead).toEqual([[...HEALTH_CONNECT_TYPES]]);
    const s = await getHealthSettings(db);
    expect(HEALTH_CONNECT_TYPES.every((t) => s.enabled[t])).toBe(true);
    // M12 1b: body fat and lean mass have their own switches; Connect leaves them off.
    expect(s.enabled.bodyFat).toBe(false);
    expect(s.enabled.leanMass).toBe(false);
    const card = h.todayProps().readiness;
    expect(card?.signals.sort()).toEqual(['restingHrHigh', 'sleepShort']);
    expect(card?.reasons).toHaveLength(2);
    // Connected → the switches and Read now, no Connect button.
    const el = asFake(h.settingsScreen(() => undefined));
    expect(attr(el, 'data-health-read-now')).toHaveLength(1);
    expect(attr(el, 'data-health-connect')).toHaveLength(0);
    expect(h.todayProps().weekLoad).toEqual({ gymSessions: 0, outside: [], outsideMinutes: 0 });
  });

  it('M12 1b: feel-today answers reach the card; Go easy answers it and opens the area', async () => {
    // Usual nights only (no Health signal): low energy + sore shoulders are the two signals.
    const { api } = fakeApi();
    const usual = data();
    api.read = async ({ types }) => {
      const r: Record<string, unknown> = { status: 'ok' };
      for (const t of types) r[t] = t === 'sleep' || t === 'restingHr' ? usual[t]?.slice(1) : [];
      return r as HealthRead & { status: string };
    };
    await saveDayFeel(db, { date: TODAY, energy: 1, sore: ['shoulders'] });
    const { h } = host(api);
    await connect(h);
    const card = h.todayProps().readiness;
    expect(card?.signals).toEqual(expect.arrayContaining(['feltLow', 'sore']));
    const areas: string[] = [];
    h.readinessActions(
      () => undefined,
      (a) => areas.push(a),
    ).onEasyOn?.('shoulders');
    expect(areas).toEqual(['shoulders']);
    expect(h.todayProps().readiness, 'answered').toBeNull();
  });

  it('M12 1b PWA (no plugin): energy 2 + a sore area alone make the card; weekLoad stays null', async () => {
    await saveDayFeel(db, { date: TODAY, energy: 2, sore: ['chest'] });
    const { h } = host(null);
    await h.sync();
    const props = h.todayProps();
    expect(props.weekLoad).toBeNull();
    expect(props.readiness).toMatchObject({ date: TODAY, signals: ['feltLow', 'sore'] });
    expect(h.cardioMinutes()).toBeNull();
    expect(await db.healthDays.count()).toBe(0);
    expect((await getHealthSettings(db)).lastReadAt).toBeUndefined();
  });

  it('M12 1b PWA: one feel signal only → no card', async () => {
    await saveDayFeel(db, { date: TODAY, energy: 2 });
    const { h } = host(null);
    await h.sync();
    expect(h.todayProps().readiness).toBeNull();
  });

  it('M12 1b PWA: the card buttons work without Health and the answer sticks for the day', async () => {
    for (const [action, chip] of [
      ['onLighterToday', 'lighter'],
      ['onNotToday', 'notToday'],
      ['onTrainAsPlanned', null],
    ] as const) {
      await saveDayFeel(db, { date: TODAY, energy: 1, sore: ['chest'] });
      const { h } = host(null);
      await h.sync();
      expect(h.todayProps().readiness).not.toBeNull();
      const opened: CardChip[] = [];
      h.readinessActions((c) => opened.push(c))[action]?.();
      expect(h.todayProps().readiness).toBeNull();
      expect(opened).toEqual(chip ? [chip] : []);
      await vi.waitFor(async () =>
        expect((await getHealthSettings(db)).readiness?.answeredDate).toBe(TODAY),
      );
      await h.sync();
      expect(h.todayProps().readiness, 'answered: not again today').toBeNull();
      db.close();
      await db.delete();
      db = new GymDb(`health-host-${n++}`);
      await db.open();
    }
  });

  it('M12 1b PWA: Go easy on a sore area answers the card and opens the area', async () => {
    await saveDayFeel(db, { date: TODAY, energy: 2, sore: ['chest'] });
    const { h } = host(null);
    await h.sync();
    expect(h.todayProps().readiness).not.toBeNull();
    const areas: string[] = [];
    h.readinessActions(
      () => undefined,
      (a) => areas.push(a),
    ).onEasyOn?.('chest');
    expect(areas).toEqual(['chest']);
    expect(h.todayProps().readiness).toBeNull();
  });

  it('M12 1b PWA: no card on a rest day / when the day is done, and none after midnight', async () => {
    await saveDayFeel(db, { date: TODAY, energy: 2, sore: ['chest'] });
    const clock = { now: NOW, trainingDay: true as boolean | undefined };
    const { h } = host(null, clock);
    await h.sync();
    expect(h.todayProps().readiness).not.toBeNull();
    clock.trainingDay = false;
    expect(h.todayProps().readiness).toBeNull();
    clock.trainingDay = true;
    clock.now = NOW + 20 * HOUR;
    expect(h.todayProps().readiness).toBeNull();
  });

  it('M12 1b: cardio minutes and body comp are null / empty on the PWA', async () => {
    const { h } = host(null);
    await h.sync();
    expect(h.cardioMinutes()).toBeNull();
    expect(h.bodyCompDays()).toEqual([]);
  });

  it('every card button records the answer and opens its M10 chip; Train as planned opens nothing', async () => {
    for (const [action, chip] of [
      ['onLighterToday', 'lighter'],
      ['onNotToday', 'notToday'],
      ['onTrainAsPlanned', null],
    ] as const) {
      const { api } = fakeApi();
      const { h } = host(api);
      await connect(h);
      expect(h.todayProps().readiness).not.toBeNull();
      const opened: CardChip[] = [];
      h.readinessActions((c) => opened.push(c))[action]?.();
      expect(h.todayProps().readiness).toBeNull();
      expect(opened).toEqual(chip ? [chip] : []);
      await vi.waitFor(async () =>
        expect((await getHealthSettings(db)).readiness?.answeredDate).toBe(TODAY),
      );
      await h.sync();
      expect(h.todayProps().readiness, 'answered: not again today').toBeNull();
      db.close();
      await db.delete();
      db = new GymDb(`health-host-${n++}`);
      await db.open();
    }
  });

  it('Turn off and delete: the card it leaned on is gone and its values are deleted', async () => {
    const { api, calls } = fakeApi();
    const { h } = host(api);
    await connect(h);
    expect((await listHealthDays(db)).some((d) => d.sleepMin !== undefined)).toBe(true);
    const el = asFake(h.settingsScreen(() => undefined));
    one(el, 'data-health-type', 'sleep').click(); // On → asks first
    one(el, 'data-health-delete', 'sleep').click();
    await vi.waitFor(async () => expect((await getHealthSettings(db)).enabled.sleep).toBe(false));
    await h.sync();
    expect(h.todayProps().readiness).toBeNull();
    expect((await listHealthDays(db)).some((d) => d.sleepMin !== undefined)).toBe(false);
    expect((await getHealthSettings(db)).readiness?.lastCard).toBeUndefined();
    expect(calls.requestRead).toHaveLength(1); // turning off asks iOS nothing
  });

  it("no card once its date has passed or today's workout is done, even before the next sync", async () => {
    const { api } = fakeApi();
    const clock = { now: NOW, trainingDay: true as boolean | undefined };
    const { h } = host(api, clock);
    await connect(h);
    expect(h.todayProps().readiness?.date).toBe(TODAY);
    // He finished today's workout: the effective day is done (trainingDay → false).
    clock.trainingDay = false;
    expect(h.todayProps().readiness).toBeNull();
    clock.trainingDay = undefined;
    expect(h.todayProps().readiness).toBeNull();
    // Past midnight with yesterday's card still in memory.
    clock.trainingDay = true;
    expect(h.todayProps().readiness).not.toBeNull();
    clock.now = NOW + 20 * HOUR;
    expect(h.todayProps().readiness).toBeNull();
  });

  it('a switch turned on asks iOS for that type only, then reads', async () => {
    const { api, calls } = fakeApi();
    const { h } = host(api);
    await connect(h);
    const el = asFake(h.settingsScreen(() => undefined));
    one(el, 'data-health-type', 'hrv').click();
    one(el, 'data-health-delete', 'hrv').click();
    await vi.waitFor(async () => expect((await getHealthSettings(db)).enabled.hrv).toBe(false));
    await h.sync();
    const reads = calls.read;
    one(asFake(h.settingsScreen(() => undefined)), 'data-health-type', 'hrv').click();
    await vi.waitFor(async () => expect((await getHealthSettings(db)).enabled.hrv).toBe(true));
    await h.sync();
    expect(calls.requestRead.at(-1)).toEqual(['hrv']);
    expect(calls.read).toBeGreaterThan(reads);
  });
});

describe('healthHost weigh-ins (Health wins, 2026-11-16)', () => {
  it("Health's weight replaces today's typed weigh-in and Fuel is told to reload", async () => {
    await saveWeighIn(db, { date: TODAY, kg: 72.8, source: 'manual' });
    const { api } = fakeApi();
    let reloads = 0;
    const h = createHealthHost({
      db,
      now: () => NOW,
      render: () => undefined,
      trainingDay: () => true,
      inWorkout: () => false,
      sessions: () => [],
      onWeighIns: () => reloads++,
      logError: (err) => {
        throw err;
      },
      loadHealth: async () => api,
    });
    await connect(h);
    expect(await listWeighIns(db)).toEqual([{ date: TODAY, kg: 70.4, source: 'health' }]);
    expect(reloads).toBeGreaterThan(0);
  });

  it('an install from before the change re-reads the full 35 days on the next app-open sync', async () => {
    const enabled = Object.fromEntries(HEALTH_TYPES.map((t) => [t, true]));
    await db.settings.put({
      key: HEALTH_SETTINGS_KEY,
      value: { enabled, route: 'apple', deletedHealthWeighIns: [], lastReadAt: NOW - 2 * HOUR },
    });
    const sinces: number[] = [];
    const { api } = fakeApi();
    const read = api.read;
    api.read = async (o) => {
      sinces.push(o.since);
      return read(o);
    };
    const { h } = host(api);
    await h.sync();
    expect(sinces).toEqual([Date.parse(`${addDate(TODAY, -35)}T00:00:00+07:00`)]);
    expect((await getHealthSettings(db)).lastReadAt).toBe(NOW);
  });
});

describe('Health data never reaches the coach (M11-q7)', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  const HEALTH = /health|readiness|HealthDay|sleepMin|restingHr|hrvMs|activeKcal/i;

  it('no trainer module (coach context, replies, actions) imports or names Health data', () => {
    const walk = (dir: string): string[] =>
      readdirSync(join(__dirname, '..', dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(`${dir}/${e.name}`)
          : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
            ? [`${dir}/${e.name}`]
            : [],
      );
    const files = walk('core/trainer');
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const imports = src(f).match(/from '[^']+'/g) ?? [];
      for (const i of imports) expect(i, `${f}: ${i}`).not.toMatch(/health/i);
      expect(src(f), f).not.toMatch(/HealthDay|ReadinessCard|healthDays/);
    }
  });

  it("app.ts's coachContext builds the context without any Health value", () => {
    const app = src('ui/app.ts');
    const start = app.indexOf('function coachContext(');
    expect(start).toBeGreaterThan(0);
    const end = app.indexOf('\n  function ', start + 1);
    const body = app.slice(start, end);
    expect(body).toContain('return {');
    expect(body).not.toMatch(HEALTH);
  });
});

describe('M13d task 8: profile() for Set up Fuel', () => {
  const PROFILE = { heightCm: 168, birthYear: 1992, sex: 'female' as const };

  function profileApi(reply: typeof PROFILE | null = PROFILE) {
    const base = fakeApi();
    const calls = { profile: 0, options: [] as unknown[] };
    const api: HealthApi = {
      ...base.api,
      requestRead: async (types, options) => {
        calls.options.push(options);
        return base.api.requestRead(types);
      },
      readProfile: async () => {
        calls.profile++;
        return reply;
      },
    };
    return { api, calls };
  }

  it('PWA (no plugin): null, nothing read', async () => {
    const { h } = host(null);
    await h.sync();
    expect(await h.profile()).toBeNull();
  });

  it('not connected (every type off): null, Health is not asked', async () => {
    const { api, calls } = profileApi();
    const { h } = host(api);
    await h.sync();
    expect(await h.profile()).toBeNull();
    expect(calls.profile).toBe(0);
  });

  it('connected: one read per call, handed back as is and never stored', async () => {
    const { api, calls } = profileApi();
    const { h } = host(api);
    await connect(h);
    expect(await h.profile()).toEqual(PROFILE);
    expect(calls.profile).toBe(1);
    expect(await h.profile()).toEqual(PROFILE);
    expect(calls.profile).toBe(2); // read again for the next open, not cached
    // Nothing of it went into the database.
    const rows = JSON.stringify(await db.settings.toArray());
    expect(rows).not.toContain('1992');
    expect(rows).not.toContain('168');
  });

  it('Connect also asks iOS for the profile (read only)', async () => {
    const { api, calls } = profileApi();
    const { h } = host(api);
    await connect(h);
    expect(calls.options[0]).toEqual({ profile: true });
  });

  it('connected before 1.16.3: asks iOS for the profile types first, then reads', async () => {
    const order: string[] = [];
    const base = fakeApi();
    const api: HealthApi = {
      ...base.api,
      requestRead: async (types, options) => {
        order.push(`request:${types.length}:${options?.profile === true}`);
        return base.api.requestRead(types);
      },
      readProfile: async () => {
        order.push('read');
        return PROFILE;
      },
    };
    const { h } = host(api);
    await connect(h);
    order.length = 0; // Connect's own ask is not what this checks
    expect(await h.profile()).toEqual(PROFILE);
    expect(order).toEqual(['request:0:true', 'read']);
  });

  it('the profile ask is not made on the PWA or while not connected', async () => {
    const { h: web } = host(null);
    await web.sync();
    expect(await web.profile()).toBeNull();
    const { api, calls } = profileApi();
    const { h } = host(api);
    await h.sync();
    expect(await h.profile()).toBeNull();
    expect(calls.options).toEqual([]);
  });

  it('the profile ask failing: null, nothing read', async () => {
    const { api, calls } = profileApi();
    const logged: unknown[] = [];
    const { h } = host(api, undefined, (err) => logged.push(err));
    await connect(h);
    api.requestRead = async () => {
      throw new Error('denied');
    };
    expect(await h.profile()).toBeNull();
    expect(calls.profile).toBe(0);
    expect(logged).toHaveLength(1);
  });

  it('a plugin without readProfile or with nothing in Health: null', async () => {
    const { api } = profileApi(null);
    const { h } = host(api);
    await connect(h);
    expect(await h.profile()).toBeNull();
    const old = fakeApi();
    const { h: h2 } = host(old.api);
    await h2.sync(); // same database: already connected
    expect(await h2.profile()).toBeNull();
  });
});
