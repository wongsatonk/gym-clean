// M13d task 37: a light (or medium) tap on main-action presses (SPEC M9 haptics line, M13d Goal 7).
// Wraps `@capacitor/haptics@8.0.2` (already a dependency and registered in the iOS app as
// `HapticsPlugin`; no new native code, no permission, nothing sent anywhere).
//
// - Web first: on the PWA every call is a silent no-op and `@capacitor/haptics` is never imported.
//   There is no static `@capacitor/*` import here, so the PWA main chunk carries none of it.
// - Native: the plugin module is imported lazily on the first tap, once, then reused.
// - Never throws or rejects: a missing plugin, a failed chunk import or a plugin error is ignored.
// - Fire and forget: callers don't await it (`void tapLight()`); the press itself never waits.
import { isNative, type CapacitorGlobal } from './health';

export const HAPTICS_PLUGIN = 'Haptics';

/** The one method of `@capacitor/haptics` used here. */
export interface HapticsBridge {
  impact(options: { style: string }): Promise<void>;
}

type HapticsModule = {
  Haptics?: unknown;
  ImpactStyle?: { Light?: string; Medium?: string };
};

export type LoadHapticsEnv = {
  cap?: CapacitorGlobal | undefined;
  importHaptics?: () => Promise<HapticsModule>;
};

export interface Haptics {
  /** Light impact: main-action presses (Set done, Apply, Save, Start). */
  tapLight(): Promise<void>;
  /** Medium impact: kept for later. */
  tapMedium(): Promise<void>;
}

const STYLE = { light: 'LIGHT', medium: 'MEDIUM' } as const;

function looksLikeBridge(p: unknown): p is HapticsBridge {
  return (
    (typeof p === 'object' || typeof p === 'function') &&
    p !== null &&
    typeof (p as { impact?: unknown }).impact === 'function'
  );
}

type Loaded = { bridge: HapticsBridge; light: string; medium: string } | null;

/** A haptics helper for this runtime. Nothing is imported until the first tap on the native app. */
export function createHaptics(env: LoadHapticsEnv = {}): Haptics {
  let loading: Promise<Loaded> | undefined;

  const load = (): Promise<Loaded> =>
    (loading ??= (async (): Promise<Loaded> => {
      const cap =
        'cap' in env ? env.cap : (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
      if (!isNative(cap)) return null;
      const existing = cap?.Plugins?.[HAPTICS_PLUGIN];
      if (looksLikeBridge(existing)) return { bridge: existing, ...STYLE };
      try {
        const importHaptics = env.importHaptics ?? (() => import('@capacitor/haptics'));
        const mod = await importHaptics();
        if (!looksLikeBridge(mod.Haptics)) return null;
        return {
          bridge: mod.Haptics,
          light: mod.ImpactStyle?.Light ?? STYLE.light,
          medium: mod.ImpactStyle?.Medium ?? STYLE.medium,
        };
      } catch {
        return null;
      }
    })());

  const tap = async (which: 'light' | 'medium'): Promise<void> => {
    try {
      const h = await load();
      if (h) await h.bridge.impact({ style: h[which] });
    } catch {
      // Haptics are a nicety: never surface an error.
    }
  };

  return { tapLight: () => tap('light'), tapMedium: () => tap('medium') };
}

let shared: Haptics | undefined;
const app = (): Haptics => (shared ??= createHaptics());

/** Light tap on the iPhone app; a silent no-op on the web. Never rejects. */
export function tapLight(): Promise<void> {
  return app().tapLight();
}

/** Medium tap on the iPhone app; a silent no-op on the web. Never rejects. */
export function tapMedium(): Promise<void> {
  return app().tapMedium();
}
