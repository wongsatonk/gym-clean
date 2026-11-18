// M11 task 4: TypeScript side of the read-only GymHealth plugin (ios/App/App/Plugins/GymHealth).
//
// - Web first: on the PWA (no native Capacitor) every call is a quiet no-op ("unavailable").
// - Never throws: unavailable, denied, partial, locked phone and plugin errors all end in an empty
//   result. HealthKit hides read denial by design, so "denied" simply looks like "no data".
// - No `@capacitor/core` import at module level: `loadHealth` imports it lazily, only on the
//   native app and only when the Swift plugin is present, so the web main chunk carries no
//   Capacitor plugin code.
// - Read-only: there are no write methods. Nothing here stores anything; the caller turns the
//   result into per-day summaries (src/core/health/days.ts) and drops the samples.
import { HEALTH_TYPES, type HealthType, type HealthWorkout } from '../core/types';

/** Raw shape of the Swift plugin, as registered with `registerPlugin('GymHealth')`. */
export interface HealthBridge {
  isAvailable(): Promise<{ available: boolean }>;
  requestRead(options: { types: HealthType[] }): Promise<{ requested: boolean }>;
  read(options: { types: HealthType[]; since: number; until?: number }): Promise<unknown>;
}

/** One body-mass sample in kg. Times are epoch ms. */
export type HealthMassSample = { start: number; kg: number; source: string; bundleId?: string };
/** One body-fat sample as a percentage 0–100 (HealthKit's fraction × 100). */
export type HealthBodyFatSample = { start: number; pct: number; source: string; bundleId?: string };
/** One lean-body-mass sample in kg. */
export type HealthLeanMassSample = { start: number; kg: number; source: string; bundleId?: string };
/** One resting-heart-rate sample in beats per minute. */
export type HealthRestingHrSample = {
  start: number;
  bpm: number;
  source: string;
  bundleId?: string;
};
/** One HRV (SDNN) sample in milliseconds. */
export type HealthHrvSample = { start: number; ms: number; source: string; bundleId?: string };
/** Active energy for one local day (HealthKit's de-duplicated daily sum across sources). */
export type HealthEnergyDay = { date: string; start: number; kcal: number };
/** One sleep session from one source: asleep stages (core, deep, REM, unspecified) summed. */
export type HealthSleepSession = {
  start: number;
  end: number;
  asleepMin: number;
  source: string;
  bundleId?: string;
};

export type HealthReadStatus = 'ok' | 'unavailable' | 'locked' | 'failed';

export type HealthReadResult = {
  status: HealthReadStatus;
  bodyMass: HealthMassSample[];
  workouts: HealthWorkout[];
  activeEnergy: HealthEnergyDay[];
  sleep: HealthSleepSession[];
  restingHr: HealthRestingHrSample[];
  hrv: HealthHrvSample[];
  /** M12 slice 1b. Present (maybe empty) only when `bodyFat` was asked for. */
  bodyFat?: HealthBodyFatSample[];
  /** M12 slice 1b. Present (maybe empty) only when `leanMass` was asked for. */
  leanMass?: HealthLeanMassSample[];
};

export type HealthReadOptions = {
  types: readonly HealthType[];
  /** Epoch ms, inclusive. */
  since: number;
  /** Epoch ms, exclusive. Defaults to "now" on the phone. */
  until?: number;
};

export interface Health {
  isAvailable(): Promise<boolean>;
  /** Shows the iOS Health sheet for types not asked about yet. True if the request ran. */
  requestRead(types: readonly HealthType[]): Promise<boolean>;
  read(options: HealthReadOptions): Promise<HealthReadResult>;
}

export const GYM_HEALTH_PLUGIN = 'GymHealth';

// Sanity ranges: drop values that can't be a real reading (bad unit, corrupt sample). These are
// data-quality filters only, never judgments about his health.
const RANGE = {
  kg: [20, 400],
  bodyFatPct: [1, 75],
  leanKg: [10, 300],
  bpm: [20, 250],
  ms: [1, 500],
  kcalDay: [0, 20_000],
  workoutMin: [0, 24 * 60],
  sleepMin: [0, 24 * 60],
} as const;

export function emptyHealthResult(status: HealthReadStatus): HealthReadResult {
  return {
    status,
    bodyMass: [],
    workouts: [],
    activeEnergy: [],
    sleep: [],
    restingHr: [],
    hrv: [],
  };
}

function knownTypes(types: readonly unknown[]): HealthType[] {
  const out: HealthType[] = [];
  for (const t of types) {
    if ((HEALTH_TYPES as readonly unknown[]).includes(t) && !out.includes(t as HealthType)) {
      out.push(t as HealthType);
    }
  }
  return out;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const inRange = (v: number | undefined, [lo, hi]: readonly [number, number], loOpen = false) =>
  v !== undefined && (loOpen ? v > lo : v >= lo) && v <= hi;
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;
const rows = (reply: Obj, key: string): Obj[] => {
  const v = reply[key];
  return Array.isArray(v) ? v.filter(isObj) : [];
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Source name, falling back to the bundle id; plus the bundle id when the plugin sent one. */
function sourceOf(r: Obj): { source: string; bundleId?: string } | undefined {
  const bundleId = str(r.bundleId);
  const source = str(r.source) ?? bundleId;
  if (!source) return undefined;
  return bundleId ? { source, bundleId } : { source };
}

function samples<K extends 'kg' | 'bpm' | 'ms' | 'pct'>(
  reply: Obj,
  key: string,
  field: K,
  range: readonly [number, number],
): ({ start: number; source: string; bundleId?: string } & Record<K, number>)[] {
  const out: ({ start: number; source: string; bundleId?: string } & Record<K, number>)[] = [];
  for (const r of rows(reply, key)) {
    const start = num(r.start);
    const value = num(r[field]);
    const src = sourceOf(r);
    if (start === undefined || !inRange(value, range) || !src) continue;
    out.push({ start, [field]: value, ...src } as { start: number; source: string } & Record<
      K,
      number
    >);
  }
  return out;
}

function sleepSessions(reply: Obj): HealthSleepSession[] {
  const out: HealthSleepSession[] = [];
  for (const r of rows(reply, 'sleep')) {
    const start = num(r.start);
    const end = num(r.end);
    const asleepMin = num(r.asleepMin);
    const src = sourceOf(r);
    if (start === undefined || end === undefined || end <= start || !src) continue;
    if (!inRange(asleepMin, RANGE.sleepMin, true)) continue;
    out.push({ start, end, asleepMin: asleepMin as number, ...src });
  }
  return out;
}

function energyDays(reply: Obj): HealthEnergyDay[] {
  const out: HealthEnergyDay[] = [];
  for (const r of rows(reply, 'activeEnergy')) {
    const date = str(r.date);
    const start = num(r.start);
    const kcal = num(r.kcal);
    if (!date || !ISO_DATE.test(date) || start === undefined || !inRange(kcal, RANGE.kcalDay))
      continue;
    out.push({ date, start, kcal: kcal as number });
  }
  return out;
}

function workouts(reply: Obj): HealthWorkout[] {
  const own = str(reply.appBundleId);
  const out: HealthWorkout[] = [];
  for (const r of rows(reply, 'workouts')) {
    const start = num(r.start);
    const minutes = num(r.minutes);
    const kind = str(r.kind) ?? 'other';
    const src = sourceOf(r);
    if (start === undefined || !inRange(minutes, RANGE.workoutMin, true) || !src) continue;
    if (own && src.bundleId === own) continue; // never count Gym Clean's own sessions twice
    const w: HealthWorkout = { start, minutes: minutes as number, kind, source: src.source };
    const kcal = num(r.kcal);
    if (kcal !== undefined && kcal >= 0) w.kcal = kcal;
    const avgHr = num(r.avgHr);
    if (inRange(avgHr, RANGE.bpm)) w.avgHr = avgHr as number;
    out.push(w);
  }
  return out;
}

/** Pure mapping of the plugin's raw reply. Types that weren't asked for are left empty. */
export function mapHealthReply(reply: unknown, types: readonly HealthType[]): HealthReadResult {
  const r = emptyHealthResult('ok');
  if (!isObj(reply)) return r;
  const want = new Set(types);
  if (want.has('bodyMass')) r.bodyMass = samples(reply, 'bodyMass', 'kg', RANGE.kg);
  if (want.has('restingHr')) r.restingHr = samples(reply, 'restingHr', 'bpm', RANGE.bpm);
  if (want.has('hrv')) r.hrv = samples(reply, 'hrv', 'ms', RANGE.ms);
  if (want.has('activeEnergy')) r.activeEnergy = energyDays(reply);
  if (want.has('sleep')) r.sleep = sleepSessions(reply);
  if (want.has('workouts')) r.workouts = workouts(reply);
  if (want.has('bodyFat')) r.bodyFat = samples(reply, 'bodyFat', 'pct', RANGE.bodyFatPct);
  if (want.has('leanMass')) r.leanMass = samples(reply, 'leanMass', 'kg', RANGE.leanKg);
  return r;
}

function errorCode(e: unknown): string | undefined {
  return isObj(e) || e instanceof Error ? str((e as Obj).code) : undefined;
}

/** Wraps a plugin (or `null` on the web) into the never-throwing `Health` API. */
export function createHealth(bridge: HealthBridge | null): Health {
  const isAvailable = async (): Promise<boolean> => {
    if (!bridge) return false;
    try {
      const res: unknown = await bridge.isAvailable();
      return isObj(res) && res.available === true;
    } catch {
      return false;
    }
  };

  return {
    isAvailable,

    async requestRead(types) {
      const list = knownTypes(types);
      if (!bridge || list.length === 0 || !(await isAvailable())) return false;
      try {
        const res: unknown = await bridge.requestRead({ types: list });
        return isObj(res) && res.requested === true;
      } catch {
        return false;
      }
    },

    async read({ types, since, until }) {
      if (!bridge || !(await isAvailable())) return emptyHealthResult('unavailable');
      const list = knownTypes(types);
      if (list.length === 0) return emptyHealthResult('ok');
      if (
        !Number.isFinite(since) ||
        (until !== undefined && (!Number.isFinite(until) || until <= since))
      ) {
        return emptyHealthResult('failed');
      }
      try {
        const reply = await bridge.read(
          until === undefined ? { types: list, since } : { types: list, since, until },
        );
        return mapHealthReply(reply, list);
      } catch (e) {
        return emptyHealthResult(errorCode(e) === 'LOCKED' ? 'locked' : 'failed');
      }
    },
  };
}

/** The bits of `window.Capacitor` we look at (set by Capacitor's native bridge, or an e2e fake). */
export type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  PluginHeaders?: readonly { name: string }[];
  Plugins?: Record<string, unknown>;
  /** Capacitor's native call, injected by the iOS bridge before the page runs. */
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
};

type CoreModule = { registerPlugin: (name: string) => unknown };

export type LoadHealthEnv = {
  cap?: CapacitorGlobal | undefined;
  importCore?: () => Promise<CoreModule>;
};

/** True only inside the Capacitor native app. */
export function isNative(cap: CapacitorGlobal | undefined = globalCapacitor()): boolean {
  try {
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function globalCapacitor(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

function looksLikeBridge(p: unknown): p is HealthBridge {
  return (
    (typeof p === 'object' || typeof p === 'function') &&
    p !== null &&
    typeof (p as Obj).isAvailable === 'function' &&
    typeof (p as Obj).read === 'function'
  );
}

/** How long the direct isAvailable() call may take before Health counts as unavailable. */
export const DIRECT_AVAILABLE_TIMEOUT_MS = 4000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('GymHealth did not answer')), ms);
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
 * Resolves the Health API for this runtime. Web → `createHealth(null)` without importing
 * `@capacitor/core`. Native → the `GymHealth` plugin if the Swift side registered it.
 */
export async function loadHealth(env: LoadHealthEnv = {}): Promise<Health> {
  const cap = 'cap' in env ? env.cap : globalCapacitor();
  if (!isNative(cap)) return createHealth(null);

  const existing = cap?.Plugins?.[GYM_HEALTH_PLUGIN];
  if (looksLikeBridge(existing)) return createHealth(existing);

  const hasHeader = cap?.PluginHeaders?.some((h) => h.name === GYM_HEALTH_PLUGIN) === true;
  if (!hasHeader) {
    // GymHealth is an in-app plugin registered in `capacitorDidLoad`; its header script can land
    // after the page has started (seen on the iPhone, 2026-11-16), and Capacitor's registerPlugin
    // then treats it as unimplemented. Call the native side directly instead. If the plugin really
    // isn't there, Capacitor iOS only logs and never settles the call, so isAvailable() gives up
    // after DIRECT_AVAILABLE_TIMEOUT_MS; createHealth turns that into "unavailable" and never calls
    // requestRead/read.
    const call = cap?.nativePromise;
    if (typeof call !== 'function') return createHealth(null);
    const direct: HealthBridge = {
      isAvailable: () =>
        withTimeout(
          call.call(cap, GYM_HEALTH_PLUGIN, 'isAvailable', {}) as Promise<{ available: boolean }>,
          DIRECT_AVAILABLE_TIMEOUT_MS,
        ),
      requestRead: (o) =>
        call.call(cap, GYM_HEALTH_PLUGIN, 'requestRead', o) as Promise<{ requested: boolean }>,
      read: (o) => call.call(cap, GYM_HEALTH_PLUGIN, 'read', o),
    };
    return createHealth(direct);
  }

  try {
    const importCore = env.importCore ?? (() => import('@capacitor/core'));
    const core = await importCore();
    return createHealth(core.registerPlugin(GYM_HEALTH_PLUGIN) as HealthBridge);
  } catch {
    return createHealth(null);
  }
}
