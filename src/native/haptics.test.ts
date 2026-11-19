import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createHaptics, type HapticsBridge } from './haptics';

const native = { isNativePlatform: () => true };

function fakeModule(impact: HapticsBridge['impact'] = vi.fn(async () => {})) {
  return {
    Haptics: { impact },
    ImpactStyle: { Heavy: 'HEAVY', Medium: 'MEDIUM', Light: 'LIGHT' },
  };
}

describe('haptics: web / PWA', () => {
  it('no Capacitor global → silent no-op, @capacitor/haptics never imported', async () => {
    const importHaptics = vi.fn(async () => fakeModule());
    const h = createHaptics({ cap: undefined, importHaptics });
    await expect(h.tapLight()).resolves.toBeUndefined();
    await expect(h.tapMedium()).resolves.toBeUndefined();
    expect(importHaptics).not.toHaveBeenCalled();
  });

  it('a Capacitor global that is not native → no import', async () => {
    const importHaptics = vi.fn(async () => fakeModule());
    await createHaptics({ cap: { isNativePlatform: () => false }, importHaptics }).tapLight();
    expect(importHaptics).not.toHaveBeenCalled();
  });
});

describe('haptics: native', () => {
  it('tapLight → impact({ style: LIGHT }); tapMedium → impact({ style: MEDIUM })', async () => {
    const impact = vi.fn(async () => {});
    const h = createHaptics({ cap: native, importHaptics: async () => fakeModule(impact) });
    await h.tapLight();
    expect(impact).toHaveBeenLastCalledWith({ style: 'LIGHT' });
    await h.tapMedium();
    expect(impact).toHaveBeenLastCalledWith({ style: 'MEDIUM' });
  });

  it('imports @capacitor/haptics once, on the first tap, not on create', async () => {
    const importHaptics = vi.fn(async () => fakeModule());
    const h = createHaptics({ cap: native, importHaptics });
    expect(importHaptics).not.toHaveBeenCalled();
    await Promise.all([h.tapLight(), h.tapLight(), h.tapMedium()]);
    await h.tapLight();
    expect(importHaptics).toHaveBeenCalledTimes(1);
  });

  it('uses an already-present Capacitor.Plugins.Haptics (e2e fake) without importing', async () => {
    const impact = vi.fn(async () => {});
    const importHaptics = vi.fn(async () => fakeModule());
    const cap = { ...native, Plugins: { Haptics: { impact } } };
    await createHaptics({ cap, importHaptics }).tapLight();
    expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(importHaptics).not.toHaveBeenCalled();
  });

  it('errors are swallowed: a rejecting impact, a throwing impact, a failed import, a junk module', async () => {
    const rejecting = createHaptics({
      cap: native,
      importHaptics: async () => fakeModule(vi.fn(async () => Promise.reject(new Error('no')))),
    });
    await expect(rejecting.tapLight()).resolves.toBeUndefined();

    const throwing = createHaptics({
      cap: native,
      importHaptics: async () =>
        fakeModule(
          vi.fn(() => {
            throw new Error('sync');
          }),
        ),
    });
    await expect(throwing.tapMedium()).resolves.toBeUndefined();

    const importFails = createHaptics({
      cap: native,
      importHaptics: async () => Promise.reject(new Error('chunk failed')),
    });
    await expect(importFails.tapLight()).resolves.toBeUndefined();

    const junk = createHaptics({ cap: native, importHaptics: async () => ({}) as never });
    await expect(junk.tapLight()).resolves.toBeUndefined();
  });

  it('an isNativePlatform that throws counts as web', async () => {
    const importHaptics = vi.fn(async () => fakeModule());
    const cap = {
      isNativePlatform: () => {
        throw new Error('x');
      },
    };
    await createHaptics({ cap, importHaptics }).tapLight();
    expect(importHaptics).not.toHaveBeenCalled();
  });
});

describe('haptics: bundle', () => {
  it('has no static import of @capacitor/* (the PWA main chunk stays free of it)', () => {
    const src = readFileSync(new URL('./haptics.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/^\s*import\s+(?!type\b)[^;]*['"]@capacitor\//m);
    expect(src).toMatch(/import\(\s*'@capacitor\/haptics'\s*\)/);
  });
});
