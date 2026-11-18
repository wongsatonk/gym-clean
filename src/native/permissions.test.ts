import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PERMISSIONS_TIMEOUT_MS,
  mapPermissionState,
  nativePermissions,
  requestMicPermission,
  type PermissionsCapacitor,
} from './permissions';

// The native side is a fake of GymSpeech.permissions() / requestMic() (ios/App/App/Plugins/GymSpeech).

type Call = (plugin: string, method: string, options?: unknown) => Promise<unknown>;

function nativeCap(call: Call, over: Partial<PermissionsCapacitor> = {}): PermissionsCapacitor {
  return { isNativePlatform: () => true, nativePromise: vi.fn(call), ...over };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('mapPermissionState', () => {
  it('passes the three known states through', () => {
    for (const s of ['granted', 'denied', 'prompt'] as const) expect(mapPermissionState(s)).toBe(s);
  });
  it('treats anything else as denied (never claims granted)', () => {
    for (const s of [undefined, null, 'restricted', 'GRANTED', 1, {}]) {
      expect(mapPermissionState(s)).toBe('denied');
    }
  });
});

describe('nativePermissions', () => {
  it('is null on the web (no Capacitor, or not native)', async () => {
    expect(await nativePermissions({ cap: undefined })).toBeNull();
    const call = vi.fn(async () => ({ camera: 'granted', mic: 'granted' }));
    expect(
      await nativePermissions({ cap: { isNativePlatform: () => false, nativePromise: call } }),
    ).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it('is null when the bridge has no native call', async () => {
    expect(await nativePermissions({ cap: { isNativePlatform: () => true } })).toBeNull();
  });

  it('reads GymSpeech.permissions() and maps the reply', async () => {
    const cap = nativeCap(async () => ({ camera: 'granted', mic: 'prompt' }));
    expect(await nativePermissions({ cap })).toEqual({ camera: 'granted', mic: 'prompt' });
    expect(cap.nativePromise).toHaveBeenCalledWith('GymSpeech', 'permissions', {});
  });

  it('prefers a registered plugin object', async () => {
    const permissions = vi.fn(async () => ({ camera: 'denied', mic: 'granted' }));
    const cap = nativeCap(async () => ({ camera: 'granted', mic: 'granted' }), {
      Plugins: { GymSpeech: { permissions, requestMic: vi.fn() } },
    });
    expect(await nativePermissions({ cap })).toEqual({ camera: 'denied', mic: 'granted' });
    expect(permissions).toHaveBeenCalledTimes(1);
    expect(cap.nativePromise).not.toHaveBeenCalled();
  });

  it('maps unknown values to denied', async () => {
    const cap = nativeCap(async () => ({ camera: 'restricted' }));
    expect(await nativePermissions({ cap })).toEqual({ camera: 'denied', mic: 'denied' });
  });

  it('is null on a junk reply or a rejection (an older app build without the method)', async () => {
    expect(await nativePermissions({ cap: nativeCap(async () => 'yes') })).toBeNull();
    expect(
      await nativePermissions({
        cap: nativeCap(async () => {
          throw Object.assign(new Error('not implemented'), { code: 'UNIMPLEMENTED' });
        }),
      }),
    ).toBeNull();
  });

  it('gives up after the timeout when the native side never answers', async () => {
    vi.useFakeTimers();
    const cap = nativeCap(() => new Promise<unknown>(() => undefined));
    const p = nativePermissions({ cap });
    await vi.advanceTimersByTimeAsync(PERMISSIONS_TIMEOUT_MS);
    expect(await p).toBeNull();
  });

  it('never throws when isNativePlatform throws', async () => {
    const cap: PermissionsCapacitor = {
      isNativePlatform: () => {
        throw new Error('boom');
      },
    };
    expect(await nativePermissions({ cap })).toBeNull();
  });
});

describe('requestMicPermission', () => {
  it('is null on the web and asks nothing', async () => {
    expect(await requestMicPermission({ cap: undefined })).toBeNull();
  });

  it('asks GymSpeech.requestMic() and returns the new mic state', async () => {
    const cap = nativeCap(async (_p, method) =>
      method === 'requestMic' ? { mic: 'granted' } : { camera: 'prompt', mic: 'prompt' },
    );
    expect(await requestMicPermission({ cap })).toEqual({ mic: 'granted' });
    expect(cap.nativePromise).toHaveBeenCalledWith('GymSpeech', 'requestMic', {});
  });

  it('a refused prompt is denied', async () => {
    const cap = nativeCap(async () => ({ mic: 'denied' }));
    expect(await requestMicPermission({ cap })).toEqual({ mic: 'denied' });
  });

  it('uses a registered plugin object when there is one', async () => {
    const requestMic = vi.fn(async () => ({ mic: 'granted' }));
    const cap = nativeCap(async () => ({ mic: 'denied' }), {
      Plugins: { GymSpeech: { permissions: vi.fn(), requestMic } },
    });
    expect(await requestMicPermission({ cap })).toEqual({ mic: 'granted' });
    expect(cap.nativePromise).not.toHaveBeenCalled();
  });

  it('is null on a rejection or junk', async () => {
    expect(await requestMicPermission({ cap: nativeCap(async () => null) })).toBeNull();
    expect(
      await requestMicPermission({
        cap: nativeCap(async () => {
          throw new Error('no');
        }),
      }),
    ).toBeNull();
  });
});
