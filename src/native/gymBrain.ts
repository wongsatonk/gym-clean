// M12 slice 2 task 7 (M10 B4): TypeScript side of the GymBrain plugin
// (ios/App/App/Plugins/GymBrain): Apple's on-device model for the coach chat.
//
// - Web first: on the PWA (no native Capacitor) the brain is "unavailable: notNative" and the
//   router keeps the rules brain. No `@capacitor/core` import at module level (see health.ts).
// - `availability()` resolves only a real answer: the PWA's `notNative`, or what the native plugin
//   said (incl. `unsupported`, e.g. no English). A plugin rejection, a junk reply or no answer
//   within DIRECT_BRAIN_TIMEOUT_MS rejects with `GymBrainAvailabilityError`, so the router treats
//   it as a failed check (generic note, nothing stored) and never as "this iPhone can't".
// - `respond()` follows src/data/brain/apple.ts's `GymBrainBridge` convention: it resolves a
//   clean `GymBrainResponse` or rejects with a `GymBrainError` whose `code` is a `BrainErrorCode`
//   (junk replies and unknown codes → `other`).
// - Nothing leaves the phone: Apple's model runs on the device; this file makes no request.
// - Every change the model wants comes back as a recorded tool call; TypeScript turns it into a
//   proposal card and nothing is applied without a tap.
import type {
  BrainErrorCode,
  BrainUnavailableReason,
  GymBrainRequest,
  GymBrainResponse,
  ToolCall,
} from '../core/types';
import { isNative, type CapacitorGlobal } from './health';

export const GYM_BRAIN_PLUGIN = 'GymBrain';
/** A longer reply is cut (the instructions ask for ≤ 4 short sentences). */
export const MAX_BRAIN_REPLY_CHARS = 2000;
/** More tool calls than this in one reply are dropped. */
export const MAX_TOOL_CALLS = 8;
/** Swift times out at 15 s; this is the backstop if the native call never settles. */
export const RESPOND_BACKSTOP_MS = 20_000;
/**
 * How long availability() may take before it rejects. Shorter than the router's 4 s status
 * timeout (src/data/brain/router.ts STATUS_TIMEOUT_MS), so this one always fires first.
 */
export const DIRECT_BRAIN_TIMEOUT_MS = 3000;
/** measure() gives up after this (dev eval only). */
export const MEASURE_TIMEOUT_MS = 10_000;

const NATIVE_REASONS: readonly BrainUnavailableReason[] = [
  'deviceNotEligible',
  'appleIntelligenceNotEnabled',
  'modelNotReady',
  'unsupported',
];
const ERROR_CODES: readonly BrainErrorCode[] = [
  'guardrail',
  'contextTooLong',
  'unsupportedLanguage',
  'timeout',
  'other',
];

export type GymBrainAvailability =
  { available: true } | { available: false; reason: BrainUnavailableReason };

/** Token counts measured on the phone (iOS 26.4+), for the dev eval / Checkpoint J budget check. */
export type BrainTokenCounts = {
  instructions: number;
  tools: number;
  prompt: number;
  contextSize: number;
};

/** A failed `respond`: `code` is what the router's note and the dev log use. */
export class GymBrainError extends Error {
  readonly code: BrainErrorCode;
  readonly latencyMs?: number;
  constructor(code: BrainErrorCode, latencyMs?: number) {
    super(`GymBrain: ${code}`);
    this.name = 'GymBrainError';
    this.code = code;
    if (latencyMs !== undefined) this.latencyMs = latencyMs;
  }
}

/** The availability check failed (rejection, junk reply or timeout): not a reason. */
export class GymBrainAvailabilityError extends Error {
  constructor(why: 'rejected' | 'junk' | 'timeout') {
    super(`GymBrain availability check failed: ${why}`);
    this.name = 'GymBrainAvailabilityError';
  }
}

/** Raw shape of the Swift plugin, as registered with `registerPlugin('GymBrain')`. */
export interface GymBrainNativeBridge {
  availability(): Promise<unknown>;
  respond(request: GymBrainRequest): Promise<unknown>;
  prewarm?(options: { instructions: string }): Promise<unknown>;
  measure?(request: GymBrainRequest): Promise<unknown>;
}

export interface GymBrain {
  /** Never prompts. Rejects with GymBrainAvailabilityError when the check itself failed. */
  availability(): Promise<GymBrainAvailability>;
  /** Resolves the reply or rejects with `GymBrainError`. */
  respond(request: GymBrainRequest): Promise<GymBrainResponse>;
  /** Call on a strong signal (text box focus, mic down), ≥ 1 s before `respond`. Never throws. */
  prewarm(instructions: string): Promise<void>;
  /** Token counts of instructions, the 14 tools and the prompt; null where iOS can't count. */
  measure(request: GymBrainRequest): Promise<BrainTokenCounts | null>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Pure mapping of the plugin's `availability()` reply. Null for a junk reply. */
export function mapBrainAvailability(reply: unknown): GymBrainAvailability | null {
  if (!isObj(reply)) return null;
  if (reply.available === true) return { available: true };
  if (reply.available !== false) return null;
  if (!(NATIVE_REASONS as readonly unknown[]).includes(reply.reason)) return null;
  return { available: false, reason: reply.reason as BrainUnavailableReason };
}

/** Keeps only well-formed `{ name, args }` calls (at most MAX_TOOL_CALLS). */
function toolCalls(v: unknown): ToolCall[] {
  if (!Array.isArray(v)) return [];
  const out: ToolCall[] = [];
  for (const c of v) {
    if (!isObj(c) || typeof c.name !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(c.name)) {
      continue;
    }
    out.push({ name: c.name, args: isObj(c.args) ? { ...c.args } : {} });
    if (out.length >= MAX_TOOL_CALLS) break;
  }
  return out;
}

/** Pure mapping of a `respond` reply. Null when it isn't a reply at all. */
export function mapBrainResponse(
  reply: unknown,
  fallbackLatencyMs: number,
): GymBrainResponse | null {
  if (!isObj(reply) || typeof reply.text !== 'string') return null;
  const latency = reply.latencyMs;
  return {
    text: reply.text.slice(0, MAX_BRAIN_REPLY_CHARS).trim(),
    toolCalls: toolCalls(reply.toolCalls),
    latencyMs:
      typeof latency === 'number' && Number.isFinite(latency) && latency >= 0
        ? Math.round(latency)
        : Math.max(0, Math.round(fallbackLatencyMs)),
  };
}

/** A plugin rejection → `GymBrainError` (unknown codes, incl. `invalidRequest`, → `other`). */
export function mapBrainRejection(e: unknown): GymBrainError {
  if (e instanceof GymBrainError) return e;
  const o = isObj(e) || e instanceof Error ? (e as unknown as Obj) : {};
  const code = (ERROR_CODES as readonly unknown[]).includes(o.code)
    ? (o.code as BrainErrorCode)
    : 'other';
  const data = isObj(o.data) ? o.data : {};
  return new GymBrainError(code, count(data.latencyMs) ? data.latencyMs : undefined);
}

export function mapTokenCounts(reply: unknown): BrainTokenCounts | null {
  if (!isObj(reply)) return null;
  const { instructions, tools, prompt, contextSize } = reply;
  if (!count(instructions) || !count(tools) || !count(prompt) || !count(contextSize)) return null;
  return { instructions, tools, prompt, contextSize };
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(onTimeout()), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(
          e instanceof Error ? e : Object.assign(new Error('GymBrain failed'), isObj(e) ? e : {}),
        );
      },
    );
  });
}

/** Wraps a plugin (or `null` on the web) into the `GymBrain` API. */
export function createGymBrain(
  bridge: GymBrainNativeBridge | null,
  deps: { now?: () => number } = {},
): GymBrain {
  const now = deps.now ?? (() => Date.now());
  return {
    async availability() {
      if (!bridge) return { available: false, reason: 'notNative' };
      let reply: unknown;
      try {
        reply = await withTimeout(
          bridge.availability(),
          DIRECT_BRAIN_TIMEOUT_MS,
          () => new GymBrainAvailabilityError('timeout'),
        );
      } catch (e) {
        throw e instanceof GymBrainAvailabilityError
          ? e
          : new GymBrainAvailabilityError('rejected');
      }
      const mapped = mapBrainAvailability(reply);
      if (!mapped) throw new GymBrainAvailabilityError('junk');
      return mapped;
    },

    async respond(request) {
      if (!bridge) throw new GymBrainError('other');
      const started = now();
      let reply: unknown;
      try {
        reply = await withTimeout(
          bridge.respond(request),
          RESPOND_BACKSTOP_MS,
          () => new GymBrainError('timeout', RESPOND_BACKSTOP_MS),
        );
      } catch (e) {
        throw mapBrainRejection(e);
      }
      const mapped = mapBrainResponse(reply, now() - started);
      if (!mapped) throw new GymBrainError('other', Math.max(0, now() - started));
      return mapped;
    },

    async prewarm(instructions) {
      if (!bridge || typeof bridge.prewarm !== 'function' || !instructions) return;
      // Not awaited: a failed or never-settling prewarm only costs the first reply some speed.
      try {
        bridge.prewarm({ instructions }).catch(() => undefined);
      } catch {
        // same
      }
    },

    async measure(request) {
      if (!bridge || typeof bridge.measure !== 'function') return null;
      try {
        return mapTokenCounts(
          await withTimeout(
            bridge.measure(request),
            MEASURE_TIMEOUT_MS,
            () => new Error('timeout'),
          ),
        );
      } catch {
        return null;
      }
    },
  };
}

type CoreModule = { registerPlugin: (name: string) => unknown };

export type LoadGymBrainEnv = {
  cap?: CapacitorGlobal | undefined;
  importCore?: () => Promise<CoreModule>;
};

function globalCapacitor(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

function looksLikeBridge(p: unknown): p is GymBrainNativeBridge {
  if ((typeof p !== 'object' && typeof p !== 'function') || p === null) return false;
  const o = p as Obj;
  return typeof o.availability === 'function' && typeof o.respond === 'function';
}

/**
 * Resolves the GymBrain API for this runtime. Web → `createGymBrain(null)` without importing
 * `@capacitor/core`. Native → the `GymBrain` plugin (or an e2e fake on `Capacitor.Plugins`). Like
 * GymHealth, an in-app plugin's header can land after the page has started; then the native side
 * is called directly through `nativePromise`.
 */
export async function loadGymBrain(env: LoadGymBrainEnv = {}): Promise<GymBrain> {
  const cap = 'cap' in env ? env.cap : globalCapacitor();
  if (!isNative(cap)) return createGymBrain(null);

  const existing = cap?.Plugins?.[GYM_BRAIN_PLUGIN];
  if (looksLikeBridge(existing)) return createGymBrain(existing);

  const hasHeader = cap?.PluginHeaders?.some((h) => h.name === GYM_BRAIN_PLUGIN) === true;
  if (!hasHeader) {
    const call = cap?.nativePromise;
    if (typeof call !== 'function') return createGymBrain(null);
    return createGymBrain({
      availability: () => call.call(cap, GYM_BRAIN_PLUGIN, 'availability', {}),
      respond: (r) => call.call(cap, GYM_BRAIN_PLUGIN, 'respond', r),
      prewarm: (o) => call.call(cap, GYM_BRAIN_PLUGIN, 'prewarm', o),
      measure: (r) => call.call(cap, GYM_BRAIN_PLUGIN, 'measure', r),
    });
  }

  try {
    const importCore = env.importCore ?? (() => import('@capacitor/core'));
    const core = await importCore();
    return createGymBrain(core.registerPlugin(GYM_BRAIN_PLUGIN) as GymBrainNativeBridge);
  } catch {
    return createGymBrain(null);
  }
}
