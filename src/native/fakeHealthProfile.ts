// Fake of the GymHealth `readProfile` method (M13d task 7) for unit tests and Playwright e2e.
// Never part of the app bundle: nothing in src/ imports this file except tests.
//
// `installFakeHealthProfile` is self-contained (no imports, no module-level references), so a spec
// can pass it straight to Playwright, after any other GymHealth fake it installs:
//
//   await page.addInitScript(installFakeHealthProfile, { heightCm: 170, birthYear: 1990, sex: 'female' });
//   // later: await page.evaluate(() => window.__gymCleanFakeHealthProfile.calls)
//
// It makes `window.Capacitor` look native and adds `readProfile` to an existing
// `Capacitor.Plugins.GymHealth` fake, or installs a minimal one (available, asks nothing, reads
// nothing). Pass `null` to answer like Health with nothing allowed (an empty reply).
import type { HealthProfile } from '../core/types';

/** The made-up profile e2e uses (SPEC M13d task 7). */
export const FAKE_HEALTH_PROFILE: HealthProfile = { heightCm: 170, birthYear: 1990, sex: 'female' };

export type FakeHealthProfileState = {
  /** How many times `readProfile` was called. */
  calls: number;
  /** Every `requestRead` options object the minimal fake saw (not used when another fake exists). */
  requests: unknown[];
};

export function installFakeHealthProfile(profile: HealthProfile | null = null): void {
  type Plugin = Record<string, unknown>;
  const w = globalThis as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: Record<string, Plugin>;
    };
    __gymCleanFakeHealthProfile?: FakeHealthProfileState;
  };
  const state: FakeHealthProfileState = { calls: 0, requests: [] };
  w.__gymCleanFakeHealthProfile = state;
  const cap = (w.Capacitor ??= {});
  cap.isNativePlatform ??= () => true;
  cap.getPlatform ??= () => 'ios';
  const plugins = (cap.Plugins ??= {});
  const plugin: Plugin = (plugins.GymHealth ??= {
    isAvailable: async () => ({ available: true }),
    requestRead: async (o: unknown) => {
      state.requests.push(o);
      return { requested: true };
    },
    read: async () => ({}),
  });
  plugin.readProfile = async () => {
    state.calls++;
    return profile ? { ...profile } : {};
  };
}
