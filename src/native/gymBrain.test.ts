import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GymBrainRequest } from '../core/types';
import {
  DIRECT_BRAIN_TIMEOUT_MS,
  GymBrainError,
  MAX_BRAIN_REPLY_CHARS,
  MAX_TOOL_CALLS,
  RESPOND_BACKSTOP_MS,
  createGymBrain,
  loadGymBrain,
  mapBrainAvailability,
  mapBrainRejection,
  mapBrainResponse,
  mapTokenCounts,
  type GymBrainNativeBridge,
} from './gymBrain';

// Made-up text only. The bridge is a fake of the GymBrain Swift plugin.

const req: GymBrainRequest = {
  instructions: 'Be brief.',
  context: "Today's plan: Pull A.",
  messages: [{ role: 'user', text: 'Can I skip legs?' }],
  toolResults: { weekSummary: '2 of 3 done.' },
};

function fake(over: Partial<GymBrainNativeBridge> = {}) {
  const bridge: GymBrainNativeBridge = {
    availability: vi.fn(async () => ({ available: true })),
    respond: vi.fn(async () => ({ text: 'Sure.', toolCalls: [], latencyMs: 812 })),
    prewarm: vi.fn(async () => undefined),
    measure: vi.fn(async () => ({
      instructions: 300,
      tools: 1500,
      prompt: 900,
      contextSize: 4096,
    })),
    ...over,
  };
  return bridge;
}

const nativeError = (code: string, data?: object) =>
  Object.assign(new Error('The on-device model did not answer'), { code, data });

afterEach(() => vi.useRealTimers());

describe('createGymBrain(null): web / PWA', () => {
  it('is unavailable (notNative); respond rejects; prewarm and measure are no-ops', async () => {
    const b = createGymBrain(null);
    expect(await b.availability()).toEqual({ available: false, reason: 'notNative' });
    await expect(b.respond(req)).rejects.toMatchObject({ code: 'other' });
    await expect(b.prewarm('Be brief.')).resolves.toBeUndefined();
    expect(await b.measure(req)).toBeNull();
  });
});

describe('availability', () => {
  it('passes every native reason through', async () => {
    for (const reason of [
      'deviceNotEligible',
      'appleIntelligenceNotEnabled',
      'modelNotReady',
      'unsupported',
    ]) {
      const b = createGymBrain(fake({ availability: async () => ({ available: false, reason }) }));
      expect(await b.availability()).toEqual({ available: false, reason });
    }
    expect(await createGymBrain(fake()).availability()).toEqual({ available: true });
  });

  it.each([
    ['null', null],
    ['a string', 'yes'],
    ['an array', [true]],
    ['available as a string', { available: 'true' }],
    ['no reason', { available: false }],
    ['an unknown reason', { available: false, reason: 'sleepy' }],
    [
      'notNative from native (only TypeScript says that)',
      { available: false, reason: 'notNative' },
    ],
    ['a number reason', { available: false, reason: 3 }],
  ])('junk reply (%s) → unavailable: unsupported', async (_, reply) => {
    expect(mapBrainAvailability(reply)).toEqual({ available: false, reason: 'unsupported' });
    const b = createGymBrain(fake({ availability: async () => reply }));
    expect(await b.availability()).toEqual({ available: false, reason: 'unsupported' });
  });

  it('a throwing plugin → unavailable', async () => {
    const b = createGymBrain(
      fake({
        availability: async () => {
          throw new Error('boom');
        },
      }),
    );
    expect(await b.availability()).toEqual({ available: false, reason: 'unsupported' });
  });

  it('a plugin that never answers → unavailable after the timeout', async () => {
    vi.useFakeTimers();
    const b = createGymBrain(fake({ availability: () => new Promise(() => undefined) }));
    const p = b.availability();
    await vi.advanceTimersByTimeAsync(DIRECT_BRAIN_TIMEOUT_MS + 1);
    expect(await p).toEqual({ available: false, reason: 'unsupported' });
  });
});

describe('respond', () => {
  it('passes the request through unchanged and returns a clean reply', async () => {
    const bridge = fake({
      respond: vi.fn(async () => ({
        text: '  Move it to Saturday.  ',
        toolCalls: [{ name: 'postponeSession', args: { mode: 'useRestDay' } }],
        latencyMs: 1234.4,
      })),
    });
    const reply = await createGymBrain(bridge).respond(req);
    expect(bridge.respond).toHaveBeenCalledWith(req);
    expect(reply).toEqual({
      text: 'Move it to Saturday.',
      toolCalls: [{ name: 'postponeSession', args: { mode: 'useRestDay' } }],
      latencyMs: 1234,
    });
  });

  it('drops malformed tool calls, keeps args objects only, caps the count', () => {
    const r = mapBrainResponse(
      {
        text: 'Ok',
        toolCalls: [
          { name: 'lighterToday' },
          { name: 'avoidBodyArea', args: ['legs'] },
          { name: 5, args: {} },
          'swapExercise',
          null,
          { name: 'bad name!', args: {} },
          ...Array.from({ length: 20 }, () => ({ name: 'deloadWeek', args: {} })),
        ],
        latencyMs: 10,
      },
      0,
    );
    expect(r?.toolCalls[0]).toEqual({ name: 'lighterToday', args: {} });
    expect(r?.toolCalls[1]).toEqual({ name: 'avoidBodyArea', args: {} });
    expect(r?.toolCalls).toHaveLength(MAX_TOOL_CALLS);
  });

  it('caps the text and falls back to its own latency', () => {
    const r = mapBrainResponse({ text: 'a'.repeat(5000), toolCalls: 'nope', latencyMs: -1 }, 42);
    expect(r?.text).toHaveLength(MAX_BRAIN_REPLY_CHARS);
    expect(r?.toolCalls).toEqual([]);
    expect(r?.latencyMs).toBe(42);
  });

  it.each([
    ['null', null],
    ['a string', 'Sure.'],
    ['no text', { toolCalls: [] }],
    ['a number text', { text: 5 }],
  ])('junk reply (%s) → rejects with other', async (_, reply) => {
    const b = createGymBrain(fake({ respond: async () => reply }));
    const err = await b.respond(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GymBrainError);
    expect(err).toMatchObject({ code: 'other' });
  });

  it.each(['guardrail', 'contextTooLong', 'unsupportedLanguage', 'timeout', 'other'] as const)(
    'native rejection %s → GymBrainError with that code and the latency',
    async (code) => {
      const b = createGymBrain(
        fake({
          respond: async () => {
            throw nativeError(code, { code, latencyMs: 900 });
          },
        }),
      );
      const err = await b.respond(req).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(GymBrainError);
      expect(err).toMatchObject({ code, latencyMs: 900 });
    },
  );

  it('unknown codes (incl. invalidRequest) and odd rejections → other', () => {
    expect(mapBrainRejection(nativeError('invalidRequest')).code).toBe('other');
    expect(mapBrainRejection('boom').code).toBe('other');
    expect(mapBrainRejection(null).code).toBe('other');
    expect(mapBrainRejection({ code: 'guardrail' }).code).toBe('guardrail');
    expect(mapBrainRejection(nativeError('timeout', { latencyMs: 'x' })).latencyMs).toBeUndefined();
  });

  it('a native call that never settles → timeout after the backstop', async () => {
    vi.useFakeTimers();
    const b = createGymBrain(fake({ respond: () => new Promise(() => undefined) }));
    const p = b.respond(req).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(RESPOND_BACKSTOP_MS + 1);
    expect(await p).toMatchObject({ code: 'timeout' });
  });
});

describe('prewarm and measure', () => {
  it('prewarm sends the instructions and never throws or waits', async () => {
    const bridge = fake();
    await createGymBrain(bridge).prewarm('Be brief.');
    expect(bridge.prewarm).toHaveBeenCalledWith({ instructions: 'Be brief.' });
    const hanging = createGymBrain(fake({ prewarm: () => new Promise(() => undefined) }));
    await expect(hanging.prewarm('Be brief.')).resolves.toBeUndefined();
    const failing = createGymBrain(
      fake({
        prewarm: async () => {
          throw new Error('no');
        },
      }),
    );
    await expect(failing.prewarm('Be brief.')).resolves.toBeUndefined();
    const empty = fake();
    await createGymBrain(empty).prewarm('');
    expect(empty.prewarm).not.toHaveBeenCalled();
  });

  it('measure returns counts, or null for {} (before iOS 26.4) and junk', async () => {
    expect(await createGymBrain(fake()).measure(req)).toEqual({
      instructions: 300,
      tools: 1500,
      prompt: 900,
      contextSize: 4096,
    });
    expect(mapTokenCounts({})).toBeNull();
    expect(mapTokenCounts({ instructions: 1, tools: 2, prompt: -3, contextSize: 4 })).toBeNull();
    expect(mapTokenCounts('x')).toBeNull();
    const failing = createGymBrain(
      fake({
        measure: async () => {
          throw new Error('no');
        },
      }),
    );
    expect(await failing.measure(req)).toBeNull();
  });
});

describe('loadGymBrain', () => {
  it('web (no Capacitor) → notNative without importing @capacitor/core', async () => {
    const importCore = vi.fn();
    const b = await loadGymBrain({ cap: undefined, importCore });
    expect(await b.availability()).toEqual({ available: false, reason: 'notNative' });
    expect(importCore).not.toHaveBeenCalled();
  });

  it('uses a plugin already on Capacitor.Plugins (e2e fake)', async () => {
    const bridge = fake();
    const b = await loadGymBrain({
      cap: { isNativePlatform: () => true, Plugins: { GymBrain: bridge } },
    });
    expect(await b.availability()).toEqual({ available: true });
  });

  it('registers the plugin when its header is there', async () => {
    const bridge = fake();
    const registerPlugin = vi.fn(() => bridge);
    const b = await loadGymBrain({
      cap: { isNativePlatform: () => true, PluginHeaders: [{ name: 'GymBrain' }] },
      importCore: async () => ({ registerPlugin }),
    });
    expect(registerPlugin).toHaveBeenCalledWith('GymBrain');
    expect((await b.respond(req)).text).toBe('Sure.');
  });

  it('no header yet → calls the native side directly', async () => {
    const nativePromise = vi.fn(async (_p: string, method: string) =>
      method === 'availability' ? { available: false, reason: 'modelNotReady' } : {},
    );
    const b = await loadGymBrain({ cap: { isNativePlatform: () => true, nativePromise } });
    expect(await b.availability()).toEqual({ available: false, reason: 'modelNotReady' });
    expect(nativePromise).toHaveBeenCalledWith('GymBrain', 'availability', {});
  });

  it('native without any way to call → notNative', async () => {
    const b = await loadGymBrain({ cap: { isNativePlatform: () => true } });
    expect(await b.availability()).toEqual({ available: false, reason: 'notNative' });
  });

  it('makes no network request', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('no network');
    });
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const b = createGymBrain(fake());
      await b.availability();
      await b.respond(req);
      await b.prewarm('x');
      await b.measure(req);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
