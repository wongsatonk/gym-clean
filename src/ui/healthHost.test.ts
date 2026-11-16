/// <reference types="node" />
// M11 task 11: the Health wiring (healthHost.ts) with a fake plugin and fake-indexeddb, plus the
// privacy check that nothing from Health reaches the coach context. Made-up numbers only.
import 'fake-indexeddb/auto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthRead } from '../core/health/days';
import { addDate } from '../core/trainer/plan';
import { HEALTH_TYPES, type HealthType } from '../core/types';
import { GymDb } from '../data/db';
import { getHealthSettings, listHealthDays } from '../data/health/store';
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

function host(api: HealthApi | null) {
  const renders = { n: 0 };
  const h = createHealthHost({
    db,
    now: () => NOW,
    render: () => renders.n++,
    trainingDay: () => true,
    inWorkout: () => false,
    sessions: () => [],
    onWeighIns: () => undefined,
    logError: (err) => {
      throw err;
    },
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
    expect(calls.requestRead).toEqual([[...HEALTH_TYPES]]);
    const s = await getHealthSettings(db);
    expect(HEALTH_TYPES.every((t) => s.enabled[t])).toBe(true);
    const card = h.todayProps().readiness;
    expect(card?.signals.sort()).toEqual(['restingHrHigh', 'sleepShort']);
    expect(card?.reasons).toHaveLength(2);
    // Connected → the switches and Read now, no Connect button.
    const el = asFake(h.settingsScreen(() => undefined));
    expect(attr(el, 'data-health-read-now')).toHaveLength(1);
    expect(attr(el, 'data-health-connect')).toHaveLength(0);
    expect(h.todayProps().weekLoad).toEqual({ gymSessions: 0, outside: [], outsideMinutes: 0 });
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
