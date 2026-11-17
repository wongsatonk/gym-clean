import { describe, expect, it, vi } from 'vitest';
import {
  DIRECT_AVAILABLE_TIMEOUT_MS,
  createHealth,
  loadHealth,
  type HealthBridge,
  type HealthReadResult,
} from './health';

// Made-up numbers only. The bridge is a fake of the GymHealth Swift plugin's raw replies.

const SINCE = Date.UTC(2026, 9, 12); // 35 days before "today" in these tests
const UNTIL = Date.UTC(2026, 10, 16);

function fakeBridge(over: Partial<HealthBridge> = {}): HealthBridge {
  return {
    isAvailable: vi.fn(async () => ({ available: true })),
    requestRead: vi.fn(async () => ({ requested: true })),
    read: vi.fn(async () => ({})),
    ...over,
  };
}

function expectEmpty(r: HealthReadResult): void {
  expect(r.bodyMass).toEqual([]);
  expect(r.workouts).toEqual([]);
  expect(r.activeEnergy).toEqual([]);
  expect(r.sleep).toEqual([]);
  expect(r.restingHr).toEqual([]);
  expect(r.hrv).toEqual([]);
}

const FULL_REPLY = {
  appBundleId: 'com.example.gymclean',
  bodyMass: [
    { start: 1_790_000_000_000, kg: 80.25, source: 'Scale App', bundleId: 'com.example.scale' },
  ],
  restingHr: [
    { start: 1_790_000_100_000, bpm: 52, source: 'WHOOP', bundleId: 'com.example.whoop' },
  ],
  hrv: [{ start: 1_790_000_200_000, ms: 61.5, source: 'WHOOP', bundleId: 'com.example.whoop' }],
  activeEnergy: [{ date: '2026-11-15', start: 1_790_000_300_000, kcal: 640.4 }],
  sleep: [
    {
      start: 1_790_000_400_000,
      end: 1_790_027_400_000,
      asleepMin: 420,
      source: 'WHOOP',
      bundleId: 'com.example.whoop',
    },
  ],
  workouts: [
    {
      start: 1_790_000_500_000,
      minutes: 41.5,
      kind: 'running',
      kcal: 410,
      source: 'WHOOP',
      bundleId: 'com.example.whoop',
    },
    {
      start: 1_790_000_600_000,
      minutes: 55,
      kind: 'traditionalStrengthTraining',
      source: 'Gym Clean',
      bundleId: 'com.example.gymclean',
    },
  ],
};

describe('createHealth: no plugin (web / PWA)', () => {
  it('is unavailable, asks nothing, reads nothing, never throws', async () => {
    const h = createHealth(null);
    expect(await h.isAvailable()).toBe(false);
    expect(await h.requestRead(['sleep'])).toBe(false);
    const r = await h.read({ types: ['sleep', 'hrv'], since: SINCE });
    expect(r.status).toBe('unavailable');
    expectEmpty(r);
  });
});

describe('createHealth: isAvailable', () => {
  it('passes through the plugin answer', async () => {
    expect(await createHealth(fakeBridge()).isAvailable()).toBe(true);
    const off = fakeBridge({ isAvailable: vi.fn(async () => ({ available: false })) });
    expect(await createHealth(off).isAvailable()).toBe(false);
  });

  it('is false when the plugin throws or answers junk', async () => {
    const boom = fakeBridge({ isAvailable: vi.fn(async () => Promise.reject(new Error('x'))) });
    expect(await createHealth(boom).isAvailable()).toBe(false);
    const junk = fakeBridge({ isAvailable: vi.fn(async () => ({ available: 'yes' }) as never) });
    expect(await createHealth(junk).isAvailable()).toBe(false);
  });
});

describe('createHealth: requestRead', () => {
  it('asks only for known types, once each', async () => {
    const b = fakeBridge();
    const ok = await createHealth(b).requestRead(['sleep', 'hrv', 'sleep', 'steps' as never]);
    expect(ok).toBe(true);
    expect(b.requestRead).toHaveBeenCalledWith({ types: ['sleep', 'hrv'] });
  });

  it('does not call the plugin for an empty list', async () => {
    const b = fakeBridge();
    expect(await createHealth(b).requestRead([])).toBe(false);
    expect(b.requestRead).not.toHaveBeenCalled();
  });

  it('is false (no throw) when unavailable or the plugin rejects', async () => {
    const off = fakeBridge({ isAvailable: vi.fn(async () => ({ available: false })) });
    expect(await createHealth(off).requestRead(['sleep'])).toBe(false);
    expect(off.requestRead).not.toHaveBeenCalled();
    const boom = fakeBridge({ requestRead: vi.fn(async () => Promise.reject(new Error('x'))) });
    expect(await createHealth(boom).requestRead(['sleep'])).toBe(false);
  });
});

describe('createHealth: read', () => {
  it('maps a full reply into app units and drops Gym Clean’s own workouts', async () => {
    const b = fakeBridge({ read: vi.fn(async () => FULL_REPLY) });
    const r = await createHealth(b).read({
      types: ['bodyMass', 'workouts', 'activeEnergy', 'sleep', 'restingHr', 'hrv'],
      since: SINCE,
      until: UNTIL,
    });
    expect(b.read).toHaveBeenCalledWith({
      types: ['bodyMass', 'workouts', 'activeEnergy', 'sleep', 'restingHr', 'hrv'],
      since: SINCE,
      until: UNTIL,
    });
    expect(r.status).toBe('ok');
    expect(r.bodyMass).toEqual([
      { start: 1_790_000_000_000, kg: 80.25, source: 'Scale App', bundleId: 'com.example.scale' },
    ]);
    expect(r.restingHr[0]?.bpm).toBe(52);
    expect(r.hrv[0]?.ms).toBe(61.5);
    expect(r.activeEnergy).toEqual([{ date: '2026-11-15', start: 1_790_000_300_000, kcal: 640.4 }]);
    expect(r.sleep[0]).toMatchObject({ asleepMin: 420, source: 'WHOOP' });
    expect(r.workouts).toEqual([
      { start: 1_790_000_500_000, minutes: 41.5, kind: 'running', kcal: 410, source: 'WHOOP' },
    ]);
  });

  it('denied looks like no data (HealthKit hides read denial): empty arrays, status ok', async () => {
    const b = fakeBridge({
      read: vi.fn(async () => ({
        bodyMass: [],
        sleep: [],
        hrv: [],
        restingHr: [],
        workouts: [],
        activeEnergy: [],
      })),
    });
    const r = await createHealth(b).read({ types: ['bodyMass', 'sleep'], since: SINCE });
    expect(r.status).toBe('ok');
    expectEmpty(r);
  });

  it('partial: only asked-for types come back; missing ones are empty', async () => {
    const b = fakeBridge({ read: vi.fn(async () => FULL_REPLY) });
    const r = await createHealth(b).read({ types: ['sleep', 'hrv'], since: SINCE });
    expect(r.sleep).toHaveLength(1);
    expect(r.hrv).toHaveLength(1);
    expect(r.bodyMass).toEqual([]);
    expect(r.workouts).toEqual([]);
    expect(r.activeEnergy).toEqual([]);
    expect(r.restingHr).toEqual([]);
  });

  it('locked phone: empty result with status locked, no throw', async () => {
    const err = Object.assign(new Error('Health data is locked'), { code: 'LOCKED' });
    const b = fakeBridge({ read: vi.fn(async () => Promise.reject(err)) });
    const r = await createHealth(b).read({ types: ['sleep'], since: SINCE });
    expect(r.status).toBe('locked');
    expectEmpty(r);
  });

  it('any other plugin failure: empty result with status failed, no throw', async () => {
    const b = fakeBridge({ read: vi.fn(async () => Promise.reject(new Error('boom'))) });
    const r = await createHealth(b).read({ types: ['sleep'], since: SINCE });
    expect(r.status).toBe('failed');
    expectEmpty(r);
  });

  it('unavailable device: does not call read', async () => {
    const b = fakeBridge({ isAvailable: vi.fn(async () => ({ available: false })) });
    const r = await createHealth(b).read({ types: ['sleep'], since: SINCE });
    expect(r.status).toBe('unavailable');
    expect(b.read).not.toHaveBeenCalled();
    expectEmpty(r);
  });

  it('no known types or a bad time range: no plugin call', async () => {
    const b = fakeBridge({ read: vi.fn(async () => FULL_REPLY) });
    const h = createHealth(b);
    expect((await h.read({ types: [], since: SINCE })).status).toBe('ok');
    expect((await h.read({ types: ['sleep'], since: Number.NaN })).status).toBe('failed');
    expect((await h.read({ types: ['sleep'], since: UNTIL, until: SINCE })).status).toBe('failed');
    expect(b.read).not.toHaveBeenCalled();
  });

  it('drops malformed or out-of-range entries instead of failing', async () => {
    const b = fakeBridge({
      read: vi.fn(async () => ({
        bodyMass: [
          { start: 1, kg: Number.NaN, source: 'a' },
          { start: 2, kg: -3, source: 'a' },
          { start: 3, kg: 900, source: 'a' },
          { start: 4, kg: 79.9 }, // no source
          { start: 5, kg: 79.9, source: 'Scale App' },
          'junk',
          null,
        ],
        hrv: { not: 'an array' },
        restingHr: [{ start: 6, bpm: 0, source: 'a' }],
        sleep: [
          { start: 10, end: 5, asleepMin: 400, source: 'a' }, // ends before it starts
          { start: 10, end: 20, asleepMin: 2000, source: 'a' }, // > 24 h
        ],
        workouts: [{ start: 7, minutes: -1, kind: 'running', source: 'a' }],
        activeEnergy: [{ date: '15/11/2026', start: 8, kcal: 100 }],
      })),
    });
    const r = await createHealth(b).read({
      types: ['bodyMass', 'hrv', 'restingHr', 'sleep', 'workouts', 'activeEnergy'],
      since: SINCE,
    });
    expect(r.status).toBe('ok');
    expect(r.bodyMass).toEqual([{ start: 5, kg: 79.9, source: 'Scale App' }]);
    expect(r.hrv).toEqual([]);
    expect(r.restingHr).toEqual([]);
    expect(r.sleep).toEqual([]);
    expect(r.workouts).toEqual([]);
    expect(r.activeEnergy).toEqual([]);
  });

  it('body fat and lean mass (M12 1b): mapped only when asked for, with range filters', async () => {
    const reply = {
      ...FULL_REPLY,
      bodyFat: [
        { start: 1_790_000_700_000, pct: 18.5, source: 'Scale App', bundleId: 'com.example.scale' },
        { start: 1_790_000_700_001, pct: 0.185, source: 'Scale App' }, // a fraction, not a percent
        { start: 1_790_000_700_002, pct: 0, source: 'Scale App' },
        { start: 1_790_000_700_003, pct: 100, source: 'Scale App' },
        { start: 1_790_000_700_004, pct: Number.NaN, source: 'Scale App' },
        { start: 1_790_000_700_005, pct: 22 }, // no source
        { pct: 22, source: 'Scale App' }, // no time
        'junk',
      ],
      leanMass: [
        { start: 1_790_000_800_000, kg: 61.34, source: 'Scale App' },
        { start: 1_790_000_800_001, kg: 3, source: 'Scale App' },
        { start: 1_790_000_800_002, kg: 900, source: 'Scale App' },
      ],
    };
    const b = fakeBridge({ read: vi.fn(async () => reply) });
    const h = createHealth(b);

    const both = await h.read({ types: ['bodyFat', 'leanMass'], since: SINCE, until: UNTIL });
    expect(b.read).toHaveBeenCalledWith({
      types: ['bodyFat', 'leanMass'],
      since: SINCE,
      until: UNTIL,
    });
    expect(both.status).toBe('ok');
    expect(both.bodyFat).toEqual([
      { start: 1_790_000_700_000, pct: 18.5, source: 'Scale App', bundleId: 'com.example.scale' },
    ]);
    expect(both.leanMass).toEqual([{ start: 1_790_000_800_000, kg: 61.34, source: 'Scale App' }]);
    expect(both.bodyMass).toEqual([]); // not asked for

    // Switches off (the default): the keys are absent even if the plugin sent data.
    const neither = await h.read({ types: ['bodyMass'], since: SINCE });
    expect(neither.bodyMass).toHaveLength(1);
    expect('bodyFat' in neither).toBe(false);
    expect('leanMass' in neither).toBe(false);

    // Asked for but nothing in Health (or denied): empty arrays.
    const empty = await createHealth(fakeBridge()).read({
      types: ['bodyFat', 'leanMass'],
      since: SINCE,
    });
    expect(empty.bodyFat).toEqual([]);
    expect(empty.leanMass).toEqual([]);
  });

  it('requestRead passes the two new types through only when listed', async () => {
    const b = fakeBridge();
    const h = createHealth(b);
    await h.requestRead(['sleep']);
    expect(b.requestRead).toHaveBeenLastCalledWith({ types: ['sleep'] });
    await h.requestRead(['bodyFat', 'leanMass']);
    expect(b.requestRead).toHaveBeenLastCalledWith({ types: ['bodyFat', 'leanMass'] });
  });

  it('a junk reply is an empty ok result', async () => {
    const b = fakeBridge({ read: vi.fn(async () => 'nonsense' as never) });
    const r = await createHealth(b).read({ types: ['sleep'], since: SINCE });
    expect(r.status).toBe('ok');
    expectEmpty(r);
  });

  it('workout source falls back to the bundle id; avgHr kept when present', async () => {
    const b = fakeBridge({
      read: vi.fn(async () => ({
        workouts: [
          {
            start: 9,
            minutes: 30,
            kind: 'soccer',
            avgHr: 141,
            source: '',
            bundleId: 'com.example.ball',
          },
        ],
      })),
    });
    const r = await createHealth(b).read({ types: ['workouts'], since: SINCE });
    expect(r.workouts).toEqual([
      { start: 9, minutes: 30, kind: 'soccer', avgHr: 141, source: 'com.example.ball' },
    ]);
  });
});

describe('loadHealth', () => {
  it('web: no Capacitor global → unavailable, core never imported', async () => {
    const importCore = vi.fn();
    const h = await loadHealth({ cap: undefined, importCore });
    expect(await h.isAvailable()).toBe(false);
    expect(importCore).not.toHaveBeenCalled();
  });

  it('a Capacitor global that is not native → unavailable', async () => {
    const importCore = vi.fn();
    const h = await loadHealth({ cap: { isNativePlatform: () => false }, importCore });
    expect(await h.isAvailable()).toBe(false);
    expect(importCore).not.toHaveBeenCalled();
  });

  it('native without the GymHealth header calls the native side directly (in-app plugin header can arrive late)', async () => {
    const plugin = fakeBridge();
    const methods = plugin as unknown as Record<string, (o?: unknown) => Promise<unknown>>;
    const nativePromise = vi.fn(async (_p: string, m: string, o?: unknown): Promise<unknown> => {
      const fn = methods[m];
      if (!fn) throw new Error('no method');
      return fn(o);
    });
    const importCore = vi.fn();
    const cap = {
      isNativePlatform: () => true,
      PluginHeaders: [{ name: 'Haptics' }],
      nativePromise,
    };
    const h = await loadHealth({ cap, importCore });
    expect(await h.isAvailable()).toBe(true);
    expect(nativePromise).toHaveBeenCalledWith('GymHealth', 'isAvailable', {});
    expect(importCore).not.toHaveBeenCalled();
  });

  it('native without the header and the plugin missing → unavailable, never throws', async () => {
    const nativePromise = vi.fn(async () => {
      throw new Error('"GymHealth" plugin is not implemented on ios');
    });
    const cap = {
      isNativePlatform: () => true,
      PluginHeaders: [{ name: 'Haptics' }],
      nativePromise,
    };
    const h = await loadHealth({ cap });
    expect(await h.isAvailable()).toBe(false);
    expect((await h.read({ types: ['sleep'], since: 0 })).status).toBe('unavailable');
  });

  it('native without the header: a call that never settles (plugin missing on iOS) → unavailable after a timeout', async () => {
    vi.useFakeTimers();
    try {
      const nativePromise = vi.fn(() => new Promise<unknown>(() => {}));
      const cap = { isNativePlatform: () => true, PluginHeaders: [], nativePromise };
      const h = await loadHealth({ cap });
      const avail = h.isAvailable();
      await vi.advanceTimersByTimeAsync(DIRECT_AVAILABLE_TIMEOUT_MS + 1);
      expect(await avail).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('native without the header and no nativePromise → unavailable', async () => {
    const cap = { isNativePlatform: () => true, PluginHeaders: [] };
    const h = await loadHealth({ cap });
    expect(await h.isAvailable()).toBe(false);
  });

  it('native with the header → registers GymHealth through @capacitor/core', async () => {
    const plugin = fakeBridge();
    const registerPlugin = vi.fn(() => plugin);
    const importCore = vi.fn(async () => ({ registerPlugin }));
    const cap = { isNativePlatform: () => true, PluginHeaders: [{ name: 'GymHealth' }] };
    const h = await loadHealth({ cap, importCore });
    expect(registerPlugin).toHaveBeenCalledWith('GymHealth');
    expect(await h.isAvailable()).toBe(true);
  });

  it('uses an already-present Capacitor.Plugins.GymHealth (e2e fake) without importing core', async () => {
    const plugin = fakeBridge();
    const importCore = vi.fn();
    const cap = { isNativePlatform: () => true, Plugins: { GymHealth: plugin } };
    const h = await loadHealth({ cap, importCore });
    expect(await h.isAvailable()).toBe(true);
    expect(importCore).not.toHaveBeenCalled();
  });

  it('a failing core import → unavailable, no throw', async () => {
    const importCore = vi.fn(async () => Promise.reject(new Error('chunk failed')));
    const cap = { isNativePlatform: () => true, PluginHeaders: [{ name: 'GymHealth' }] };
    const h = await loadHealth({ cap, importCore });
    expect(await h.isAvailable()).toBe(false);
  });
});
