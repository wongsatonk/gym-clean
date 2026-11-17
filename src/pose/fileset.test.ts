import { describe, expect, it, vi } from 'vitest';
import { isNativeScheme, loadModelBuffer, loadWasmFileset, wasmFilePaths } from './fileset';

const okText = (body: string) => ({ ok: true, status: 200, text: async () => body, arrayBuffer: async () => new ArrayBuffer(0) });

describe('isNativeScheme', () => {
  it('is false for the web (http/https) and true for the Capacitor scheme', () => {
    expect(isNativeScheme('https:')).toBe(false);
    expect(isNativeScheme('http:')).toBe(false);
    expect(isNativeScheme('capacitor:')).toBe(true);
  });
});

describe('wasmFilePaths', () => {
  it('builds the loader and binary paths under the base', () => {
    expect(wasmFilePaths('/gym-clean/')).toEqual({
      wasmLoaderPath: '/gym-clean/mediapipe/wasm/vision_wasm_internal.js',
      wasmBinaryPath: '/gym-clean/mediapipe/wasm/vision_wasm_internal.wasm',
    });
  });
});

describe('loadWasmFileset', () => {
  it('web: plain paths, no fetch, nothing to release', async () => {
    const fetchFn = vi.fn();
    const { fileset, release } = await loadWasmFileset({ base: '/', native: false, origin: 'https://a.test', fetchFn, createObjectURL: vi.fn(), revokeObjectURL: vi.fn() });
    expect(fileset).toEqual({
      wasmLoaderPath: '/mediapipe/wasm/vision_wasm_internal.js',
      wasmBinaryPath: '/mediapipe/wasm/vision_wasm_internal.wasm',
    });
    expect(fetchFn).not.toHaveBeenCalled();
    release();
  });

  it('native: fetches the loader itself and hands MediaPipe a blob: URL; the .wasm stays an absolute bundled URL', async () => {
    const fetchFn = vi.fn(async () => okText('self.ModuleFactory=1'));
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:capacitor://localhost/1'));
    const revokeObjectURL = vi.fn();
    const { fileset, release } = await loadWasmFileset({ base: '/', native: true, origin: 'capacitor://localhost', fetchFn, createObjectURL, revokeObjectURL });
    expect(fetchFn).toHaveBeenCalledWith('capacitor://localhost/mediapipe/wasm/vision_wasm_internal.js');
    expect(fileset).toEqual({
      wasmLoaderPath: 'blob:capacitor://localhost/1',
      wasmBinaryPath: 'capacitor://localhost/mediapipe/wasm/vision_wasm_internal.wasm',
    });
    expect(blobs[0]?.type).toBe('text/javascript');
    expect(await blobs[0]?.text()).toBe('self.ModuleFactory=1');
    release();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:capacitor://localhost/1');
  });

  it('native: a missing loader names the file and the status', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(
      loadWasmFileset({ base: '/', native: true, origin: 'capacitor://localhost', fetchFn, createObjectURL: vi.fn(), revokeObjectURL: vi.fn() }),
    ).rejects.toThrow("couldn't load vision_wasm_internal.js (HTTP 404)");
  });

  it('native: a network failure names the file and keeps the reason', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Load failed');
    });
    await expect(
      loadWasmFileset({ base: '/', native: true, origin: 'capacitor://localhost', fetchFn, createObjectURL: vi.fn(), revokeObjectURL: vi.fn() }),
    ).rejects.toThrow("couldn't load vision_wasm_internal.js (Load failed)");
  });
});

describe('loadModelBuffer', () => {
  it('returns the bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, text: async () => '', arrayBuffer: async () => bytes.buffer }));
    const out = await loadModelBuffer('capacitor://localhost/models/pose_landmarker_lite.task', fetchFn);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('names the model file on failure', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(loadModelBuffer('/models/pose_landmarker_lite.task', fetchFn)).rejects.toThrow(
      "couldn't load pose_landmarker_lite.task (HTTP 404)",
    );
  });
});
