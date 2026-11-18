// M12 slice 2 task 10: TypeScript side of the GymSpeech plugin (ios/App/App/Plugins/GymSpeech):
// hold-to-talk speech-to-text for the coach chat. On-device only, English, live partial text.
//
// - Web first: on the PWA (no native Capacitor) the mic is "unavailable: notNative" and every call
//   is a quiet no-op.
// - Never throws: a missing plugin, a denied microphone, junk replies and plugin errors all end in
//   a plain result.
// - Nothing here asks for permission by itself: only `start()` reaches the iOS microphone prompt,
//   and only the first time. `loadSpeech`, `createSpeech` and `availability()` never prompt.
// - No audio reaches TypeScript, only text and a loudness number. Nothing is stored here.
// - No `@capacitor/core` import at module level (same reason as src/native/health.ts).
// - Where the mic may be used (never in a set, never on the camera) is decided by
//   src/core/trainer/speakRules.ts, not here.
import { isNative, type CapacitorGlobal } from './health';

export const GYM_SPEECH_PLUGIN = 'GymSpeech';
/** The only locale in M12 slice 2. */
export const SPEECH_LOCALE = 'en';
/** A reply longer than this is cut (the phone caps listening at 60 s). */
export const MAX_SPEECH_CHARS = 2000;

export const SPEECH_UNAVAILABLE_REASONS = [
  'notNative',
  'unsupported',
  'modelNotInstalled',
  'modelDownloading',
  'permissionDenied',
] as const;
/**
 * Why the mic can't be used. `notNative`: not the iPhone app. `unsupported`: this iPhone has no
 * on-device English speech model (nothing is sent to a server instead). `modelNotInstalled`: iOS
 * can download it (`installModel()`). `permissionDenied`: the microphone is off for Gym Clean in
 * iOS Settings.
 */
export type SpeechUnavailableReason = (typeof SPEECH_UNAVAILABLE_REASONS)[number];
export type SpeechAvailability =
  { available: true } | { available: false; reason: SpeechUnavailableReason };

export const SPEECH_ERROR_CODES = [
  'permissionDenied',
  'unavailable',
  'busy',
  'interrupted',
  'failed',
] as const;
/** `interrupted`: the app went to the background or a call came in; nothing should be sent. */
export type SpeechErrorCode = (typeof SPEECH_ERROR_CODES)[number];

export type SpeechStartResult = { ok: true } | { ok: false; code: SpeechErrorCode };

/** Callbacks for one hold-to-talk session. They stop after `final` or `error`. */
export type SpeechHandlers = {
  /** The whole text heard so far; it can still change. */
  partial?: (text: string) => void;
  /** Loudness 0–1, about ten times a second, for the level ring. */
  level?: (rms: number) => void;
  /** The finished text after `stop()`. `capped`: the 60 s limit ended it. */
  final?: (text: string, capped: boolean) => void;
  /** Listening ended without a text (after a successful start). */
  error?: (code: SpeechErrorCode) => void;
};

type ListenerHandle = { remove?: () => unknown };

/** Raw shape of the Swift plugin, as registered with `registerPlugin('GymSpeech')`. */
export interface SpeechBridge {
  availability(options?: { locale: string }): Promise<unknown>;
  start(options: { locale: string }): Promise<unknown>;
  stop(): Promise<unknown>;
  installModel?(options?: { locale: string }): Promise<unknown>;
  addListener(
    event: 'partial' | 'level' | 'final' | 'error',
    listener: (data: unknown) => void,
  ): Promise<ListenerHandle> | ListenerHandle;
}

export interface Speech {
  /** Reads device support and the stored permission. Never prompts. */
  availability(): Promise<SpeechAvailability>;
  /** Button down. The first call shows the iOS microphone prompt. */
  start(handlers: SpeechHandlers): Promise<SpeechStartResult>;
  /** Button up. Resolves with the finished text ('' if there is none). */
  stop(): Promise<string>;
  /** Asks iOS to download the English speech model. True when it is installed afterwards. */
  installModel(): Promise<boolean>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string =>
  typeof v === 'string' ? v.slice(0, MAX_SPEECH_CHARS).trim() : '';

const NATIVE_ERRORS: Record<string, SpeechErrorCode> = {
  PERMISSION_DENIED: 'permissionDenied',
  UNAVAILABLE: 'unavailable',
  BUSY: 'busy',
  INTERRUPTED: 'interrupted',
  FAILED: 'failed',
};

function errorCode(v: unknown): SpeechErrorCode {
  return (SPEECH_ERROR_CODES as readonly unknown[]).includes(v) ? (v as SpeechErrorCode) : 'failed';
}

function rejectionCode(e: unknown): SpeechErrorCode {
  const code = isObj(e) || e instanceof Error ? (e as Obj).code : undefined;
  return (typeof code === 'string' ? NATIVE_ERRORS[code] : undefined) ?? 'failed';
}

/** Pure mapping of the plugin's `availability()` reply. Anything unclear is "unsupported". */
export function mapSpeechAvailability(reply: unknown): SpeechAvailability {
  if (!isObj(reply)) return { available: false, reason: 'unsupported' };
  if (reply.available === true) return { available: true };
  const reason = reply.reason;
  const known =
    reason !== 'notNative' && (SPEECH_UNAVAILABLE_REASONS as readonly unknown[]).includes(reason);
  return { available: false, reason: known ? (reason as SpeechUnavailableReason) : 'unsupported' };
}

/** Wraps a plugin (or `null` on the web) into the never-throwing `Speech` API. */
export function createSpeech(bridge: SpeechBridge | null): Speech {
  let handlers: SpeechHandlers | null = null;
  let starting = false;
  let listening: Promise<boolean> | null = null;

  const done = (): SpeechHandlers | null => {
    const h = handlers;
    handlers = null;
    return h;
  };

  const onEvent: Record<'partial' | 'level' | 'final' | 'error', (data: unknown) => void> = {
    partial(data) {
      if (isObj(data) && typeof data.text === 'string') handlers?.partial?.(text(data.text));
    },
    level(data) {
      const rms = isObj(data) ? data.rms : undefined;
      if (typeof rms !== 'number' || !Number.isFinite(rms)) return;
      handlers?.level?.(Math.min(1, Math.max(0, rms)));
    },
    final(data) {
      const d = isObj(data) ? data : {};
      done()?.final?.(text(d.text), d.capped === true);
    },
    error(data) {
      // A failed start is reported by start()'s result, not twice.
      if (starting) return;
      done()?.error?.(errorCode(isObj(data) ? data.code : undefined));
    },
  };

  /** Attaches the four listeners once; they stay for the life of the page. */
  const listen = (b: SpeechBridge): Promise<boolean> => {
    listening ??= (async () => {
      try {
        for (const event of ['partial', 'level', 'final', 'error'] as const) {
          await b.addListener(event, (data) => {
            try {
              onEvent[event](data);
            } catch {
              // A throwing callback must not break the plugin's event delivery.
            }
          });
        }
        return true;
      } catch {
        listening = null;
        return false;
      }
    })();
    return listening;
  };

  return {
    async availability() {
      if (!bridge) return { available: false, reason: 'notNative' };
      try {
        return mapSpeechAvailability(await bridge.availability({ locale: SPEECH_LOCALE }));
      } catch {
        return { available: false, reason: 'unsupported' };
      }
    },

    async start(next) {
      if (!bridge) return { ok: false, code: 'unavailable' };
      if (starting) return { ok: false, code: 'busy' };
      starting = true;
      const previous = handlers;
      try {
        if (!(await listen(bridge))) return { ok: false, code: 'failed' };
        handlers = next;
        await bridge.start({ locale: SPEECH_LOCALE });
        return { ok: true };
      } catch (e) {
        const code = rejectionCode(e);
        // Busy: the running session keeps its callbacks.
        handlers = code === 'busy' ? previous : null;
        return { ok: false, code };
      } finally {
        starting = false;
      }
    },

    async stop() {
      if (!bridge) return '';
      try {
        const reply: unknown = await bridge.stop();
        return isObj(reply) ? text(reply.text) : '';
      } catch {
        return '';
      }
    },

    async installModel() {
      if (!bridge || typeof bridge.installModel !== 'function') return false;
      try {
        const reply: unknown = await bridge.installModel({ locale: SPEECH_LOCALE });
        return isObj(reply) && reply.installed === true;
      } catch {
        return false;
      }
    },
  };
}

/** `window.Capacitor` plus the event call the iOS bridge injects. */
export type SpeechCapacitorGlobal = CapacitorGlobal & {
  addListener?: (
    plugin: string,
    event: string,
    listener: (data: unknown) => void,
  ) => ListenerHandle;
};

type CoreModule = { registerPlugin: (name: string) => unknown };

export type LoadSpeechEnv = {
  cap?: SpeechCapacitorGlobal | undefined;
  importCore?: () => Promise<CoreModule>;
};

function globalCapacitor(): SpeechCapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: SpeechCapacitorGlobal }).Capacitor;
}

function looksLikeBridge(p: unknown): p is SpeechBridge {
  if ((typeof p !== 'object' && typeof p !== 'function') || p === null) return false;
  const o = p as Obj;
  return (
    typeof o.availability === 'function' &&
    typeof o.start === 'function' &&
    typeof o.stop === 'function' &&
    typeof o.addListener === 'function'
  );
}

/** How long the direct availability() call may take before the mic counts as unavailable. */
export const DIRECT_SPEECH_TIMEOUT_MS = 4000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('GymSpeech did not answer')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * Resolves the Speech API for this runtime. Web → `createSpeech(null)` without importing
 * `@capacitor/core`. Native → the `GymSpeech` plugin if the Swift side registered it. Like
 * GymHealth, an in-app plugin's header can land after the page has started; then the native side
 * is called directly (`nativePromise` + the bridge's `addListener`).
 */
export async function loadSpeech(env: LoadSpeechEnv = {}): Promise<Speech> {
  const cap = 'cap' in env ? env.cap : globalCapacitor();
  if (!isNative(cap)) return createSpeech(null);

  const existing = cap?.Plugins?.[GYM_SPEECH_PLUGIN];
  if (looksLikeBridge(existing)) return createSpeech(existing);

  const hasHeader = cap?.PluginHeaders?.some((h) => h.name === GYM_SPEECH_PLUGIN) === true;
  if (!hasHeader) {
    const call = cap?.nativePromise;
    const listen = cap?.addListener;
    if (typeof call !== 'function' || typeof listen !== 'function') return createSpeech(null);
    const direct: SpeechBridge = {
      // If the plugin really isn't there, Capacitor iOS never settles the call: give up quietly.
      availability: (o) =>
        withTimeout(
          call.call(cap, GYM_SPEECH_PLUGIN, 'availability', o ?? {}),
          DIRECT_SPEECH_TIMEOUT_MS,
        ),
      start: (o) => call.call(cap, GYM_SPEECH_PLUGIN, 'start', o),
      stop: () => call.call(cap, GYM_SPEECH_PLUGIN, 'stop', {}),
      installModel: (o) => call.call(cap, GYM_SPEECH_PLUGIN, 'installModel', o ?? {}),
      addListener: (event, listener) => listen.call(cap, GYM_SPEECH_PLUGIN, event, listener),
    };
    return createSpeech(direct);
  }

  try {
    const importCore = env.importCore ?? (() => import('@capacitor/core'));
    const core = await importCore();
    return createSpeech(core.registerPlugin(GYM_SPEECH_PLUGIN) as SpeechBridge);
  } catch {
    return createSpeech(null);
  }
}
