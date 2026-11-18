import { afterEach, describe, expect, it, vi } from 'vitest';

const zx = vi.hoisted(() => ({
  prepareZXingModule: vi.fn(() => Promise.resolve({})),
  readBarcodes: vi.fn(() => Promise.resolve([] as { isValid: boolean; text: string }[])),
}));

vi.mock('zxing-wasm/reader', () => zx);
vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({ default: '/assets/zxing_reader-abc123.wasm' }));

import { loadBarcodeDecoder, resetBarcodeDecoderForTests } from './barcodeDecoder';

const frame = { width: 2, height: 2, data: new Uint8ClampedArray(16) } as unknown as ImageData;

type LocateOpts = { overrides: { locateFile: (p: string, prefix: string) => string } };

afterEach(() => {
  resetBarcodeDecoderForTests();
  zx.prepareZXingModule.mockClear();
  zx.readBarcodes.mockReset();
  zx.readBarcodes.mockImplementation(() => Promise.resolve([]));
});

describe('loadBarcodeDecoder', () => {
  it('loads the wasm from our own origin, never the CDN default', async () => {
    await loadBarcodeDecoder();
    expect(zx.prepareZXingModule).toHaveBeenCalledTimes(1);
    const opts = (zx.prepareZXingModule.mock.calls[0] as unknown as [LocateOpts])[0];
    expect(opts.overrides.locateFile('zxing_reader.wasm', 'https://cdn.jsdelivr.net/x/')).toBe(
      '/assets/zxing_reader-abc123.wasm',
    );
  });

  it('loads once and shares the decoder', async () => {
    const [a, b] = await Promise.all([loadBarcodeDecoder(), loadBarcodeDecoder()]);
    expect(a).toBe(b);
    expect(zx.prepareZXingModule).toHaveBeenCalledTimes(1);
  });

  it('asks only for retail formats and returns the first valid code', async () => {
    zx.readBarcodes.mockResolvedValue([
      { isValid: false, text: '123' },
      { isValid: true, text: '8850999220000' },
    ]);
    const d = await loadBarcodeDecoder();
    await expect(d.decode(frame)).resolves.toBe('8850999220000');
    expect(zx.readBarcodes).toHaveBeenCalledWith(frame, expect.objectContaining({ formats: ['EAN13', 'EAN8', 'UPCA'] }));
  });

  it('returns null when nothing (or nothing numeric) is found', async () => {
    const d = await loadBarcodeDecoder();
    await expect(d.decode(frame)).resolves.toBeNull();
    zx.readBarcodes.mockResolvedValue([{ isValid: true, text: 'abc' }]);
    await expect(d.decode(frame)).resolves.toBeNull();
  });

  it('a failed load is not cached, so a retry can succeed', async () => {
    const boom = vi.fn(() => Promise.reject(new Error('offline')));
    await expect(loadBarcodeDecoder(boom)).rejects.toThrow('offline');
    await expect(loadBarcodeDecoder()).resolves.toBeDefined();
  });
});
