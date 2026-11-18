import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SelfCheck } from './screens/selfCheck';
import {
  SELF_CHECK_IDS,
  defaultSelfCheckDeps,
  selfCheckRuns,
  type SelfCheckDeps,
} from './selfCheckRuns';
import type { GymDb } from '../data/db';

// Fakes only: nothing here touches a real permission, the camera or the network.
function deps(over: Partial<SelfCheckDeps> = {}): SelfCheckDeps {
  const store = new Map<string, unknown>();
  return {
    release: '1.15.0',
    build: 'abc1234',
    native: true,
    createTracker: () => Promise.resolve({ delegate: 'GPU', close: vi.fn() }),
    cameraPermission: () => Promise.resolve('granted'),
    brain: () => Promise.resolve({ availability: () => Promise.resolve({ available: true }) }),
    speech: () => Promise.resolve({ availability: () => Promise.resolve({ available: true }) }),
    reminders: () =>
      Promise.resolve({ available: true, permission: () => Promise.resolve('granted') }),
    health: () => Promise.resolve({ isAvailable: () => Promise.resolve(true) }),
    healthConnected: () => Promise.resolve(true),
    storage: {
      put: (k, v) => (store.set(k, v), Promise.resolve()),
      get: (k) => Promise.resolve(store.get(k)),
      delete: (k) => (store.delete(k), Promise.resolve()),
    },
    persisted: () => Promise.resolve(true),
    voices: () =>
      Promise.resolve([
        { lang: 'en-GB', name: 'Daniel' },
        { lang: 'th-TH', name: 'Kanya' },
      ]),
    ...over,
  };
}

const byId = (checks: SelfCheck[], id: string) => {
  const c = checks.find((x) => x.id === id);
  if (!c) throw new Error(`no check ${id}`);
  return c;
};
const run = (d: SelfCheckDeps, id: string) => byId(selfCheckRuns(d), id).run();

afterEach(() => vi.useRealTimers());

describe('selfCheckRuns', () => {
  it('has the nine checks in order, plain names, only the version row is info-only', () => {
    const checks = selfCheckRuns(deps());
    expect(checks.map((c) => c.id)).toEqual([...SELF_CHECK_IDS]);
    expect(SELF_CHECK_IDS).toEqual([
      'version',
      'pose',
      'camera',
      'voice',
      'storage',
      'brain',
      'speech',
      'notifications',
      'health',
    ]);
    expect(checks.filter((c) => c.info).map((c) => c.id)).toEqual(['version']);
    for (const c of checks) expect(c.name.length).toBeGreaterThan(3);
  });

  it('version: release, build and which app', async () => {
    expect(await run(deps(), 'version')).toEqual({
      state: 'info',
      detail: '1.15.0 (build abc1234), iPhone app',
    });
    expect((await run(deps({ native: false, build: 'unknown' }), 'version')).detail).toBe(
      '1.15.0, web app',
    );
  });

  describe('pose engine', () => {
    it('creates the tracker (never the camera), closes it, says which delegate', async () => {
      const close = vi.fn();
      const createTracker = vi.fn(() => Promise.resolve({ delegate: 'CPU' as const, close }));
      expect(await run(deps({ createTracker }), 'pose')).toEqual({
        state: 'ok',
        detail: 'Loaded (CPU)',
      });
      expect(createTracker).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('a load failure shows the readable reason (a bare script error Event too)', async () => {
      const ev = {
        type: 'error',
        target: { src: 'capacitor://localhost/mediapipe/wasm/vision_wasm_internal.js' },
      };
      const r = await run(deps({ createTracker: () => Promise.reject(ev) }), 'pose');
      expect(r.state).toBe('fail');
      expect(r.detail).toBe("couldn't load vision_wasm_internal.js");
      expect(r.fix).toMatch(/fresh build/i);
      const web = await run(
        deps({ native: false, createTracker: () => Promise.reject(new Error('x')) }),
        'pose',
      );
      expect(web.fix).toMatch(/reload/i);
    });

    it('gives up after its timeout', async () => {
      vi.useFakeTimers();
      const p = run(deps({ createTracker: () => new Promise(() => undefined) }), 'pose');
      await vi.advanceTimersByTimeAsync(30_001);
      const r = await p;
      expect(r.state).toBe('fail');
      expect(r.detail).toContain("Didn't answer within 30 s");
    });
  });

  describe('camera permission (never prompts)', () => {
    it('granted ok; prompt and denied warn with how to allow; unknown is info', async () => {
      expect((await run(deps(), 'camera')).state).toBe('ok');
      const prompt = await run(
        deps({ cameraPermission: () => Promise.resolve('prompt') }),
        'camera',
      );
      expect(prompt.state).toBe('warn');
      expect(prompt.fix).toMatch(/Allow/);
      const denied = await run(
        deps({ cameraPermission: () => Promise.resolve('denied') }),
        'camera',
      );
      expect(denied.state).toBe('warn');
      expect(denied.fix).toMatch(/iPhone Settings/);
      const webDenied = await run(
        deps({ native: false, cameraPermission: () => Promise.resolve('denied') }),
        'camera',
      );
      expect(webDenied.fix).toMatch(/Safari/);
      const none = await run(deps({ cameraPermission: undefined }), 'camera');
      expect(none.state).toBe('info');
      const throws = await run(
        deps({ cameraPermission: () => Promise.reject(new TypeError('camera')) }),
        'camera',
      );
      expect(throws.state).toBe('info');
    });
  });

  describe('Apple on-device coach', () => {
    it('ok when available; a reason in plain words when not; iPhone app only on the web', async () => {
      expect(await run(deps(), 'brain')).toEqual({ state: 'ok', detail: 'Ready' });
      const off = await run(
        deps({
          brain: () =>
            Promise.resolve({
              availability: () =>
                Promise.resolve({ available: false, reason: 'appleIntelligenceNotEnabled' }),
            }),
        }),
        'brain',
      );
      expect(off).toMatchObject({ state: 'warn', detail: 'Apple Intelligence is off.' });
      expect(off.fix).toMatch(/Apple Intelligence & Siri/);
      const brain = vi.fn();
      const web = await run(deps({ native: false, brain }), 'brain');
      expect(web).toEqual({ state: 'info', detail: 'iPhone app only' });
      expect(brain).not.toHaveBeenCalled();
      const broken = await run(
        deps({
          brain: () => Promise.resolve({ availability: () => Promise.reject(new Error('x')) }),
        }),
        'brain',
      );
      expect(broken.state).toBe('warn');
      expect(broken.fix).toMatch(/Run again/);
    });
  });

  describe('mic speech', () => {
    it('ok / download hint / iPhone app only', async () => {
      expect((await run(deps(), 'speech')).state).toBe('ok');
      const notInstalled = await run(
        deps({
          speech: () =>
            Promise.resolve({
              availability: () =>
                Promise.resolve({ available: false, reason: 'modelNotInstalled' }),
            }),
        }),
        'speech',
      );
      expect(notInstalled.state).toBe('warn');
      expect(notInstalled.fix).toMatch(/Download speech/);
      const speech = vi.fn();
      expect(await run(deps({ native: false, speech }), 'speech')).toEqual({
        state: 'info',
        detail: 'iPhone app only',
      });
      expect(speech).not.toHaveBeenCalled();
    });
  });

  describe('notifications (never requests)', () => {
    it('granted ok, denied warn, not asked info, web info', async () => {
      const request = vi.fn();
      const rem =
        (permission: string, available = true) =>
        () =>
          Promise.resolve({
            available,
            permission: () => Promise.resolve(permission as never),
            request,
          });
      expect((await run(deps({ reminders: rem('granted') }), 'notifications')).state).toBe('ok');
      const denied = await run(deps({ reminders: rem('denied') }), 'notifications');
      expect(denied.state).toBe('warn');
      expect(denied.fix).toMatch(/Notifications/);
      expect((await run(deps({ reminders: rem('prompt') }), 'notifications')).state).toBe('info');
      expect(
        (await run(deps({ reminders: rem('unavailable', false) }), 'notifications')).state,
      ).toBe('warn');
      expect((await run(deps({ native: false }), 'notifications')).detail).toBe('iPhone app only');
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe('Apple Health (never prompts)', () => {
    it('connected ok, not connected info, not answering warn, web info', async () => {
      expect(await run(deps(), 'health')).toEqual({ state: 'ok', detail: 'Connected' });
      expect(
        (await run(deps({ healthConnected: () => Promise.resolve(false) }), 'health')).state,
      ).toBe('info');
      const missing = await run(
        deps({ health: () => Promise.resolve({ isAvailable: () => Promise.resolve(false) }) }),
        'health',
      );
      expect(missing.state).toBe('warn');
      expect((await run(deps({ native: false }), 'health')).detail).toBe('iPhone app only');
    });
  });

  describe('storage', () => {
    it('writes, reads back and deletes a temp settings row; persisted ok', async () => {
      const d = deps();
      const put = vi.spyOn(d.storage, 'put');
      const del = vi.spyOn(d.storage, 'delete');
      expect(await run(d, 'storage')).toMatchObject({ state: 'ok' });
      const key = put.mock.calls[0]?.[0];
      expect(key).toBe('selfCheckTemp');
      expect(del).toHaveBeenCalledWith('selfCheckTemp');
      expect(await d.storage.get('selfCheckTemp')).toBeUndefined();
    });

    it('a read that does not match fails', async () => {
      const d = deps();
      d.storage.get = () => Promise.resolve('something else');
      expect((await run(d, 'storage')).state).toBe('fail');
    });

    it('a write that throws fails with the reason', async () => {
      const d = deps();
      d.storage.put = () => Promise.reject(new Error('QuotaExceededError'));
      const r = await run(d, 'storage');
      expect(r).toMatchObject({ state: 'fail', detail: 'QuotaExceededError' });
    });

    it('a slow phone gets 20 s, not 6 s, before storage gives up', async () => {
      vi.useFakeTimers();
      const d = deps();
      let answer: () => void = () => undefined;
      const put = d.storage.put;
      d.storage.put = (k, v) =>
        new Promise<void>((res) => (answer = () => void put(k, v).then(res)));
      const p = run(d, 'storage');
      let done = false;
      void p.then(() => (done = true));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(done).toBe(false);
      answer();
      expect(await p).toMatchObject({ state: 'ok' });
    });

    it('no answer in 20 s says storage was slow, not a fresh build', async () => {
      vi.useFakeTimers();
      const d = deps();
      d.storage.put = () => new Promise<void>(() => undefined);
      const p = run(d, 'storage');
      await vi.advanceTimersByTimeAsync(20_001);
      const r = await p;
      expect(r.state).toBe('warn');
      expect(r.detail).toBe('Storage was slow to answer.');
      expect(r.fix).toBe('Tap Run again.');
      expect(`${r.detail} ${r.fix ?? ''}`).not.toMatch(/fresh build/i);
    });

    it('not persisted warns on the web, with a fix; the iPhone app keeps its own data', async () => {
      const web = await run(
        deps({ native: false, persisted: () => Promise.resolve(false) }),
        'storage',
      );
      expect(web.state).toBe('warn');
      expect(web.fix).toMatch(/Home Screen/);
      const app = await run(deps({ persisted: () => Promise.resolve(false) }), 'storage');
      expect(app.state).toBe('ok');
    });
  });

  describe('voice', () => {
    it('an English voice is ok; none fails with where to add one; no speech at all fails', async () => {
      expect(await run(deps(), 'voice')).toEqual({ state: 'ok', detail: '1 English voice' });
      const th = await run(
        deps({ voices: () => Promise.resolve([{ lang: 'th-TH', name: 'Kanya' }]) }),
        'voice',
      );
      expect(th.state).toBe('fail');
      expect(th.fix).toMatch(/Spoken Content/);
      expect((await run(deps({ voices: () => Promise.resolve(null) }), 'voice')).state).toBe(
        'fail',
      );
    });
  });
  describe('installed voices (real wiring)', () => {
    type Listener = () => void;
    function fakeSynth(later: { lang: string; name: string }[]) {
      const listeners = new Set<Listener>();
      let voices: { lang: string; name: string }[] = [];
      const synth = {
        getVoices: () => voices,
        addEventListener: vi.fn((type: string, fn: Listener) => {
          if (type === 'voiceschanged') listeners.add(fn);
        }),
        removeEventListener: vi.fn((type: string, fn: Listener) => {
          if (type === 'voiceschanged') listeners.delete(fn);
        }),
      };
      const fire = () => {
        voices = later;
        for (const fn of [...listeners]) fn();
      };
      return { synth, listeners, fire };
    }
    const env = { release: '1.15.0', build: '', native: false };

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('no voiceschanged within 2 s: answers with what is there and removes its listener', async () => {
      vi.useFakeTimers();
      const f = fakeSynth([]);
      vi.stubGlobal('speechSynthesis', f.synth);
      const p = defaultSelfCheckDeps({} as GymDb, env).voices();
      expect(f.listeners.size).toBe(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(await p).toEqual([]);
      expect(f.listeners.size).toBe(0);
      expect(f.synth.removeEventListener).toHaveBeenCalledWith(
        'voiceschanged',
        f.synth.addEventListener.mock.calls[0]?.[1],
      );
    });

    it('voiceschanged before 2 s: answers the new voices, no listener or timer left', async () => {
      vi.useFakeTimers();
      const f = fakeSynth([{ lang: 'en-GB', name: 'Daniel' }]);
      vi.stubGlobal('speechSynthesis', f.synth);
      const p = defaultSelfCheckDeps({} as GymDb, env).voices();
      f.fire();
      expect(await p).toEqual([{ lang: 'en-GB', name: 'Daniel' }]);
      expect(f.listeners.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
