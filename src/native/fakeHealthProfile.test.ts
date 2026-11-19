import { afterEach, describe, expect, it } from 'vitest';
import { FAKE_HEALTH_PROFILE, installFakeHealthProfile } from './fakeHealthProfile';
import { loadHealth, type CapacitorGlobal } from './health';

type G = { Capacitor?: CapacitorGlobal; __gymCleanFakeHealthProfile?: { calls: number } };
const g = globalThis as unknown as G;

afterEach(() => {
  delete g.Capacitor;
  delete g.__gymCleanFakeHealthProfile;
});

describe('installFakeHealthProfile (e2e fake)', () => {
  it('installs a native-looking GymHealth that answers the made-up profile', async () => {
    installFakeHealthProfile(FAKE_HEALTH_PROFILE);
    const h = await loadHealth();
    expect(await h.readProfile()).toEqual({ heightCm: 170, birthYear: 1990, sex: 'female' });
    expect(g.__gymCleanFakeHealthProfile?.calls).toBe(1);
  });

  it('adds readProfile to a GymHealth fake that is already there, keeping its other methods', async () => {
    const read = async () => ({ bodyMass: [] });
    g.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { GymHealth: { isAvailable: async () => ({ available: true }), read } },
    };
    installFakeHealthProfile({ heightCm: 182 });
    expect((g.Capacitor.Plugins?.GymHealth as { read: unknown }).read).toBe(read);
    expect(await (await loadHealth()).readProfile()).toEqual({ heightCm: 182 });
  });

  it('null → an empty reply (nothing allowed) → no profile', async () => {
    installFakeHealthProfile(null);
    expect(await (await loadHealth()).readProfile()).toBeNull();
  });

  it('is self-contained so Playwright can serialise it', () => {
    const src = installFakeHealthProfile.toString();
    expect(src).not.toMatch(/FAKE_HEALTH_PROFILE|loadHealth|import\(/);
  });
});
