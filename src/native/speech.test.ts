import { describe, expect, it, vi } from 'vitest';
import {
  DIRECT_SPEECH_TIMEOUT_MS,
  MAX_SPEECH_CHARS,
  createSpeech,
  loadSpeech,
  mapSpeechAvailability,
  type SpeechBridge,
  type SpeechHandlers,
} from './speech';

// Made-up text only. The bridge is a fake of the GymSpeech Swift plugin.

type Listener = (data: unknown) => void;

function fakeBridge(over: Partial<SpeechBridge> = {}) {
  const listeners = new Map<string, Listener[]>();
  const bridge: SpeechBridge = {
    availability: vi.fn(async () => ({ available: true })),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => ({ text: '' })),
    installModel: vi.fn(async () => ({ installed: true })),
    addListener: vi.fn(async (event: string, listener: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return { remove: async () => undefined };
    }),
    ...over,
  };
  const emit = (event: string, data: unknown): void => {
    for (const l of listeners.get(event) ?? []) l(data);
  };
  return { bridge, emit, listeners };
}

function spies() {
  return {
    partial: vi.fn<(text: string) => void>(),
    level: vi.fn<(rms: number) => void>(),
    final: vi.fn<(text: string, capped: boolean) => void>(),
    error: vi.fn<(code: string) => void>(),
  } satisfies SpeechHandlers;
}

const rejection = (code: string) => Object.assign(new Error('Speech did not start'), { code });

describe('createSpeech: no plugin (web / PWA)', () => {
  it('is unavailable (notNative), never listens, never throws', async () => {
    const s = createSpeech(null);
    expect(await s.availability()).toEqual({ available: false, reason: 'notNative' });
    expect(await s.start(spies())).toEqual({ ok: false, code: 'unavailable' });
    expect(await s.stop()).toBe('');
    expect(await s.installModel()).toBe(false);
  });
});

describe('createSpeech: nothing happens before the first start', () => {
  it('creating it calls nothing; availability() only reads', async () => {
    const { bridge } = fakeBridge();
    const s = createSpeech(bridge);
    expect(bridge.availability).not.toHaveBeenCalled();
    expect(bridge.addListener).not.toHaveBeenCalled();
    await s.availability();
    expect(bridge.availability).toHaveBeenCalledWith({ locale: 'en' });
    // Only start() can reach the iOS microphone prompt.
    expect(bridge.start).not.toHaveBeenCalled();
    expect(bridge.addListener).not.toHaveBeenCalled();
  });
});

describe('mapSpeechAvailability', () => {
  it('passes known answers through', () => {
    expect(mapSpeechAvailability({ available: true })).toEqual({ available: true });
    for (const reason of [
      'unsupported',
      'modelNotInstalled',
      'modelDownloading',
      'permissionDenied',
    ]) {
      expect(mapSpeechAvailability({ available: false, reason })).toEqual({
        available: false,
        reason,
      });
    }
  });

  it('junk or unknown reasons are "unsupported", never available', () => {
    for (const junk of [
      undefined,
      null,
      'yes',
      [],
      {},
      { available: 'true' },
      { available: 1 },
      { available: false },
      { available: false, reason: 'serverOnly' },
      { available: false, reason: 'notNative' },
    ]) {
      expect(mapSpeechAvailability(junk)).toEqual({ available: false, reason: 'unsupported' });
    }
  });
});

describe('createSpeech: availability', () => {
  it('a throwing plugin is unavailable', async () => {
    const { bridge } = fakeBridge({
      availability: vi.fn(async () => Promise.reject(new Error('boom'))),
    });
    expect(await createSpeech(bridge).availability()).toEqual({
      available: false,
      reason: 'unsupported',
    });
  });
});

describe('createSpeech: a hold-to-talk session', () => {
  it('start → partials and levels → stop → final', async () => {
    const { bridge, emit } = fakeBridge({
      stop: vi.fn(async () => ({ text: 'Move leg day to Friday.' })),
    });
    const s = createSpeech(bridge);
    const h = spies();

    expect(await s.start(h)).toEqual({ ok: true });
    expect(bridge.start).toHaveBeenCalledWith({ locale: 'en' });

    emit('partial', { text: 'move leg' });
    emit('level', { rms: 0.4 });
    emit('partial', { text: 'move leg day to fri' });
    expect(h.partial.mock.calls).toEqual([['move leg'], ['move leg day to fri']]);
    expect(h.level.mock.calls).toEqual([[0.4]]);

    const stopped = s.stop();
    emit('final', { text: 'Move leg day to Friday.' });
    expect(await stopped).toBe('Move leg day to Friday.');
    expect(h.final.mock.calls).toEqual([['Move leg day to Friday.', false]]);
    expect(h.error).not.toHaveBeenCalled();
  });

  it('callbacks stop after final; the next session gets its own', async () => {
    const { bridge, emit } = fakeBridge();
    const s = createSpeech(bridge);
    const first = spies();
    await s.start(first);
    emit('final', { text: 'one' });
    emit('partial', { text: 'late' });
    emit('final', { text: 'late' });
    expect(first.partial).not.toHaveBeenCalled();
    expect(first.final).toHaveBeenCalledTimes(1);

    const second = spies();
    await s.start(second);
    emit('partial', { text: 'two' });
    expect(second.partial.mock.calls).toEqual([['two']]);
    expect(first.partial).not.toHaveBeenCalled();
    // Listeners are attached once, not once per session.
    expect(bridge.addListener).toHaveBeenCalledTimes(4);
  });

  it('the 60 s cap arrives as final with capped', async () => {
    const { bridge, emit } = fakeBridge();
    const s = createSpeech(bridge);
    const h = spies();
    await s.start(h);
    emit('final', { text: 'a long story', capped: true });
    expect(h.final.mock.calls).toEqual([['a long story', true]]);
  });

  it('background / interruption: error, no final', async () => {
    const { bridge, emit } = fakeBridge();
    const s = createSpeech(bridge);
    const h = spies();
    await s.start(h);
    emit('partial', { text: 'move' });
    emit('error', { code: 'interrupted' });
    emit('final', { text: 'move' });
    expect(h.error.mock.calls).toEqual([['interrupted']]);
    expect(h.final).not.toHaveBeenCalled();
  });

  it('junk events are dropped or made safe', async () => {
    const { bridge, emit } = fakeBridge();
    const s = createSpeech(bridge);
    const h = spies();
    await s.start(h);
    emit('partial', null);
    emit('partial', { text: 42 });
    emit('partial', 'text');
    emit('level', { rms: 'loud' });
    emit('level', { rms: Number.NaN });
    emit('level', { rms: 7 });
    emit('level', { rms: -1 });
    emit('partial', { text: `  ${'x'.repeat(MAX_SPEECH_CHARS + 50)}` });
    expect(h.partial).toHaveBeenCalledTimes(1);
    expect(h.partial.mock.calls[0]?.[0]).toHaveLength(MAX_SPEECH_CHARS - 2);
    expect(h.level.mock.calls).toEqual([[1], [0]]);
    emit('error', { code: 'somethingNew' });
    expect(h.error.mock.calls).toEqual([['failed']]);
  });

  it('a junk final is an empty text; a junk stop reply is an empty text', async () => {
    const { bridge, emit } = fakeBridge({ stop: vi.fn(async () => 'nope') });
    const s = createSpeech(bridge);
    const h = spies();
    await s.start(h);
    const stopped = s.stop();
    emit('final', null);
    expect(await stopped).toBe('');
    expect(h.final.mock.calls).toEqual([['', false]]);
  });

  it('a throwing callback does not break the plugin events', async () => {
    const { bridge, emit } = fakeBridge();
    const s = createSpeech(bridge);
    const final = vi.fn();
    await s.start({
      partial: () => {
        throw new Error('ui bug');
      },
      final,
    });
    expect(() => emit('partial', { text: 'hi' })).not.toThrow();
    emit('final', { text: 'hi' });
    expect(final).toHaveBeenCalledWith('hi', false);
  });

  it('stop never throws', async () => {
    const { bridge } = fakeBridge({ stop: vi.fn(async () => Promise.reject(new Error('boom'))) });
    expect(await createSpeech(bridge).stop()).toBe('');
  });
});

describe('createSpeech: start failures', () => {
  it.each([
    ['PERMISSION_DENIED', 'permissionDenied'],
    ['UNAVAILABLE', 'unavailable'],
    ['INTERRUPTED', 'interrupted'],
    ['FAILED', 'failed'],
    ['SOMETHING_NEW', 'failed'],
  ])('%s → { ok: false, code: %s }, reported once', async (native, code) => {
    const fake = fakeBridge();
    const { bridge, emit } = fake;
    bridge.start = vi.fn(async () => {
      emit('error', { code }); // the plugin also sends the event
      throw rejection(native);
    });
    const s = createSpeech(bridge);
    const h = spies();
    expect(await s.start(h)).toEqual({ ok: false, code });
    expect(h.error).not.toHaveBeenCalled();
    // Nothing of a failed start reaches the callbacks later.
    emit('partial', { text: 'ghost' });
    emit('final', { text: 'ghost' });
    expect(h.partial).not.toHaveBeenCalled();
    expect(h.final).not.toHaveBeenCalled();
  });

  it('a rejection without a code is "failed"', async () => {
    const { bridge } = fakeBridge({ start: vi.fn(async () => Promise.reject(new Error('x'))) });
    expect(await createSpeech(bridge).start(spies())).toEqual({ ok: false, code: 'failed' });
  });

  it('busy: the running session keeps its callbacks', async () => {
    const { bridge, emit } = fakeBridge();
    const s = createSpeech(bridge);
    const first = spies();
    await s.start(first);
    bridge.start = vi.fn(async () => Promise.reject(rejection('BUSY')));
    const second = spies();
    expect(await s.start(second)).toEqual({ ok: false, code: 'busy' });
    emit('final', { text: 'still the first' });
    expect(first.final).toHaveBeenCalledWith('still the first', false);
    expect(second.final).not.toHaveBeenCalled();
  });

  it('a second start while the first is still starting is busy and calls nothing', async () => {
    let release: () => void = () => undefined;
    const { bridge } = fakeBridge({
      start: vi.fn(() => new Promise<void>((resolve) => (release = resolve))),
    });
    const s = createSpeech(bridge);
    const first = s.start(spies());
    await vi.waitFor(() => expect(bridge.start).toHaveBeenCalledTimes(1));
    expect(await s.start(spies())).toEqual({ ok: false, code: 'busy' });
    release();
    expect(await first).toEqual({ ok: true });
    expect(bridge.start).toHaveBeenCalledTimes(1);
  });

  it('released while the permission prompt was up: an empty final, no error', async () => {
    const fake = fakeBridge();
    const { bridge, emit } = fake;
    bridge.start = vi.fn(async () => {
      emit('final', { text: '' });
    });
    const h = spies();
    expect(await createSpeech(bridge).start(h)).toEqual({ ok: true });
    expect(h.final.mock.calls).toEqual([['', false]]);
  });

  it('listeners that cannot be attached: failed, the plugin is not started', async () => {
    const { bridge } = fakeBridge({
      addListener: vi.fn(async () => Promise.reject(new Error('no events'))),
    });
    expect(await createSpeech(bridge).start(spies())).toEqual({ ok: false, code: 'failed' });
    expect(bridge.start).not.toHaveBeenCalled();
  });
});

describe('createSpeech: installModel', () => {
  it('true only for a clear yes', async () => {
    expect(await createSpeech(fakeBridge().bridge).installModel()).toBe(true);
    for (const reply of [{ installed: false }, {}, null, 'yes']) {
      const { bridge } = fakeBridge({ installModel: vi.fn(async () => reply) });
      expect(await createSpeech(bridge).installModel()).toBe(false);
    }
    const { bridge } = fakeBridge({
      installModel: vi.fn(async () => Promise.reject(new Error('offline'))),
    });
    expect(await createSpeech(bridge).installModel()).toBe(false);
  });
});

describe('loadSpeech', () => {
  it('web: no Capacitor global → notNative, core never imported', async () => {
    const importCore = vi.fn();
    const s = await loadSpeech({ cap: undefined, importCore });
    expect(await s.availability()).toEqual({ available: false, reason: 'notNative' });
    expect(importCore).not.toHaveBeenCalled();
  });

  it('a Capacitor global that is not native → notNative, the plugin is never called', async () => {
    const { bridge } = fakeBridge();
    const cap = { isNativePlatform: () => false, Plugins: { GymSpeech: bridge } };
    const s = await loadSpeech({ cap });
    expect(await s.availability()).toEqual({ available: false, reason: 'notNative' });
    expect(await s.start(spies())).toEqual({ ok: false, code: 'unavailable' });
    expect(bridge.availability).not.toHaveBeenCalled();
    expect(bridge.start).not.toHaveBeenCalled();
  });

  it('loading asks for nothing (no permission prompt at launch)', async () => {
    const { bridge } = fakeBridge();
    const cap = { isNativePlatform: () => true, Plugins: { GymSpeech: bridge } };
    await loadSpeech({ cap });
    expect(bridge.availability).not.toHaveBeenCalled();
    expect(bridge.start).not.toHaveBeenCalled();
    expect(bridge.addListener).not.toHaveBeenCalled();
  });

  it('uses an already-present Capacitor.Plugins.GymSpeech (e2e fake) without importing core', async () => {
    const { bridge, emit } = fakeBridge();
    const importCore = vi.fn();
    const cap = { isNativePlatform: () => true, Plugins: { GymSpeech: bridge } };
    const s = await loadSpeech({ cap, importCore });
    const h = spies();
    expect(await s.start(h)).toEqual({ ok: true });
    emit('partial', { text: 'hi' });
    expect(h.partial).toHaveBeenCalledWith('hi');
    expect(importCore).not.toHaveBeenCalled();
  });

  it('native with the header → registers GymSpeech through @capacitor/core', async () => {
    const { bridge } = fakeBridge();
    const registerPlugin = vi.fn(() => bridge);
    const importCore = vi.fn(async () => ({ registerPlugin }));
    const cap = { isNativePlatform: () => true, PluginHeaders: [{ name: 'GymSpeech' }] };
    const s = await loadSpeech({ cap, importCore });
    expect(registerPlugin).toHaveBeenCalledWith('GymSpeech');
    expect(await s.availability()).toEqual({ available: true });
  });

  it('native without the header calls the native side directly, events included', async () => {
    const { bridge, emit } = fakeBridge();
    const methods = bridge as unknown as Record<string, (o?: unknown) => Promise<unknown>>;
    const nativePromise = vi.fn(async (_p: string, m: string, o?: unknown): Promise<unknown> => {
      const fn = methods[m];
      if (!fn) throw new Error('no method');
      return fn(o);
    });
    const addListener = vi.fn((_p: string, event: string, listener: Listener) => {
      void bridge.addListener(event as 'partial', listener);
      return { remove: async () => undefined };
    });
    const importCore = vi.fn();
    const cap = {
      isNativePlatform: () => true,
      PluginHeaders: [{ name: 'Haptics' }],
      nativePromise,
      addListener,
    };
    const s = await loadSpeech({ cap, importCore });
    expect(await s.availability()).toEqual({ available: true });
    expect(nativePromise).toHaveBeenCalledWith('GymSpeech', 'availability', { locale: 'en' });

    const h = spies();
    expect(await s.start(h)).toEqual({ ok: true });
    expect(addListener.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['GymSpeech', 'partial'],
      ['GymSpeech', 'level'],
      ['GymSpeech', 'final'],
      ['GymSpeech', 'error'],
    ]);
    emit('partial', { text: 'hi' });
    expect(h.partial).toHaveBeenCalledWith('hi');
    await s.stop();
    expect(nativePromise).toHaveBeenCalledWith('GymSpeech', 'stop', {});
    expect(importCore).not.toHaveBeenCalled();
  });

  it('native without the header: a call that never settles (plugin missing) → unavailable after a timeout', async () => {
    vi.useFakeTimers();
    try {
      const nativePromise = vi.fn(() => new Promise<unknown>(() => {}));
      const cap = {
        isNativePlatform: () => true,
        PluginHeaders: [],
        nativePromise,
        addListener: vi.fn(),
      };
      const s = await loadSpeech({ cap });
      const avail = s.availability();
      await vi.advanceTimersByTimeAsync(DIRECT_SPEECH_TIMEOUT_MS + 1);
      expect(await avail).toEqual({ available: false, reason: 'unsupported' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('native without the header and no native calls → notNative-like no-op', async () => {
    const cap = { isNativePlatform: () => true, PluginHeaders: [] };
    const s = await loadSpeech({ cap });
    expect(await s.start(spies())).toEqual({ ok: false, code: 'unavailable' });
  });

  it('a failing core import → no-op, no throw', async () => {
    const importCore = vi.fn(async () => Promise.reject(new Error('chunk failed')));
    const cap = { isNativePlatform: () => true, PluginHeaders: [{ name: 'GymSpeech' }] };
    const s = await loadSpeech({ cap, importCore });
    expect(await s.start(spies())).toEqual({ ok: false, code: 'unavailable' });
  });
});
