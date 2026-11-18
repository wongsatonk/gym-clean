import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import { byAttr } from './fuelTestKit';
import {
  PHOTO_JPEG_QUALITY,
  fitWithin,
  photoButton,
  preparePhoto,
  type PhotoDeps,
} from './photoCapture';

useFakeDom();

describe('fitWithin', () => {
  it('shrinks a portrait photo to a 512 px long edge', () => {
    expect(fitWithin(3024, 4032, 512)).toEqual({ w: 384, h: 512 });
  });
  it('shrinks a landscape photo to a 512 px long edge', () => {
    expect(fitWithin(4032, 3024, 512)).toEqual({ w: 512, h: 384 });
  });
  it('never upscales a small photo', () => {
    expect(fitWithin(300, 200, 512)).toEqual({ w: 300, h: 200 });
    expect(fitWithin(512, 512, 512)).toEqual({ w: 512, h: 512 });
  });
  it('keeps every side ≥ 1 and rejects bad sizes', () => {
    expect(fitWithin(10000, 3, 512)).toEqual({ w: 512, h: 1 });
    expect(fitWithin(0, 100)).toEqual({ w: 0, h: 0 });
    expect(fitWithin(Number.NaN, 100)).toEqual({ w: 0, h: 0 });
    expect(fitWithin(-5, 100)).toEqual({ w: 0, h: 0 });
  });
});

type Draw = { w: number; h: number; source: unknown };

/** Fake browser pieces: a canvas that records drawImage / toBlob. */
function fakeDeps(over: Partial<PhotoDeps> = {}) {
  const draws: Draw[] = [];
  const blobs: { type: string; q: number }[] = [];
  const revoked: string[] = [];
  const canvases: { width: number; height: number }[] = [];
  const deps: PhotoDeps = {
    createImageBitmap: undefined,
    createObjectURL: () => 'blob:fake-1',
    revokeObjectURL: (u) => revoked.push(u),
    loadImage: () =>
      Promise.resolve({ naturalWidth: 4032, naturalHeight: 3024 } as HTMLImageElement),
    createCanvas: () => {
      const c = {
        width: 0,
        height: 0,
        getContext: () => ({
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
          drawImage: (source: unknown, _x: number, _y: number, w: number, h: number) =>
            draws.push({ source, w, h }),
        }),
        toBlob: (cb: (b: Blob | null) => void, type: string, q: number) => {
          blobs.push({ type, q });
          cb(new Blob(['jpeg'], { type }));
        },
      };
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
    ...over,
  };
  return { deps, draws, blobs, revoked, canvases };
}

const FILE = new Blob(['not really an image'], { type: 'image/jpeg' });

describe('preparePhoto', () => {
  // Nothing in here may touch storage or the network.
  const fetchSpy = vi.fn();
  const g = globalThis as { fetch?: unknown; indexedDB?: unknown };
  let saved: { fetch?: unknown; indexedDB?: unknown };
  beforeEach(() => {
    saved = { fetch: g.fetch, indexedDB: g.indexedDB };
    g.fetch = fetchSpy;
    g.indexedDB = new Proxy(
      {},
      {
        get: () => {
          throw new Error('indexedDB touched');
        },
      },
    );
  });
  afterEach(() => {
    g.fetch = saved.fetch;
    g.indexedDB = saved.indexedDB;
    fetchSpy.mockReset();
  });

  it('decodes upright with createImageBitmap(from-image) and frees the bitmap', async () => {
    const close = vi.fn();
    const cib = vi.fn(() =>
      Promise.resolve({ width: 3024, height: 4032, close } as unknown as ImageBitmap),
    );
    const f = fakeDeps({ createImageBitmap: cib });
    const out = await preparePhoto(FILE, { keepBlob: false, deps: f.deps });
    expect(cib).toHaveBeenCalledWith(FILE, { imageOrientation: 'from-image' });
    expect(out.w).toBe(384);
    expect(out.h).toBe(512);
    expect(f.canvases[0]).toMatchObject({ width: 384, height: 512 });
    expect(f.draws).toEqual([{ source: expect.anything(), w: 384, h: 512 }]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(out.blob).toBeUndefined();
    expect(f.blobs).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to <img> + object URL when createImageBitmap fails, and revokes the URL', async () => {
    const f = fakeDeps({ createImageBitmap: () => Promise.reject(new Error('no options bag')) });
    const out = await preparePhoto(FILE, { keepBlob: false, deps: f.deps });
    expect(out).toMatchObject({ w: 512, h: 384 });
    expect(f.revoked).toEqual(['blob:fake-1']);
  });

  it('revokes the object URL when the image fails to load, and throws', async () => {
    const f = fakeDeps({ loadImage: () => Promise.reject(new Error('bad image')) });
    await expect(preparePhoto(FILE, { keepBlob: false, deps: f.deps })).rejects.toThrow();
    expect(f.revoked).toEqual(['blob:fake-1']);
    expect(f.draws).toEqual([]);
  });

  it('does not upscale a small photo', async () => {
    const f = fakeDeps({
      loadImage: () =>
        Promise.resolve({ naturalWidth: 320, naturalHeight: 240 } as HTMLImageElement),
    });
    const out = await preparePhoto(FILE, { keepBlob: false, deps: f.deps });
    expect(out).toMatchObject({ w: 320, h: 240 });
  });

  it('makes a JPEG (q 0.85) only when asked to keep it', async () => {
    const f = fakeDeps();
    const out = await preparePhoto(FILE, { keepBlob: true, deps: f.deps });
    expect(f.blobs).toEqual([{ type: 'image/jpeg', q: PHOTO_JPEG_QUALITY }]);
    expect(out.blob?.type).toBe('image/jpeg');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws on an empty image', async () => {
    const f = fakeDeps({
      loadImage: () => Promise.resolve({ naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement),
    });
    await expect(preparePhoto(FILE, { keepBlob: false, deps: f.deps })).rejects.toThrow();
  });
});

describe('photoButton', () => {
  it('is a button over a hidden camera file input', () => {
    const el = asFake(photoButton({ onFile: () => undefined }));
    const input = byAttr(el, 'data-photo-input');
    expect(input.tag).toBe('input');
    expect(input.getAttribute('type')).toBe('file');
    expect(input.getAttribute('accept')).toBe('image/*');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.getAttribute('tabindex')).toBe('-1');
    const btn = byAttr(el, 'data-photo-open');
    expect(btn.tag).toBe('button');
    expect(btn.textContent).toBe('Photo');
  });

  it('the button opens the input', () => {
    const el = asFake(photoButton({ onFile: () => undefined }));
    const input = byAttr(el, 'data-photo-input');
    const opened = vi.fn();
    input.addEventListener('click', opened);
    byAttr(el, 'data-photo-open').click();
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('hands over the picked file and clears the input so the same photo can be picked again', () => {
    const got: unknown[] = [];
    const el = asFake(photoButton({ onFile: (f) => got.push(f) }));
    const input = byAttr(el, 'data-photo-input') as FakeEl & { files?: unknown; value?: string };
    const file = { name: 'meal.jpg' };
    input.files = [file];
    input.value = 'C:\\fakepath\\meal.jpg';
    input.dispatch('change', {});
    expect(got).toEqual([file]);
    expect(input.value).toBe('');
  });

  it('a cancelled pick calls nothing', () => {
    const got: unknown[] = [];
    const el = asFake(photoButton({ onFile: (f) => got.push(f) }));
    const input = byAttr(el, 'data-photo-input') as FakeEl & { files?: unknown };
    input.files = [];
    input.dispatch('change', {});
    expect(got).toEqual([]);
  });
});
