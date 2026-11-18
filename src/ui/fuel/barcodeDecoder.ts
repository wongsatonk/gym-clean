// On-device barcode decoder for phones without `BarcodeDetector` (iPhone Safari).
// zxing-wasm (MIT, zxing-cpp compiled to wasm), reader-only build. Lazy: the JS and the
// ~0.9 MB wasm load on the first scan, never at app start. The wasm is a Vite `?url` asset
// served from our own origin and precached by the service worker, so scanning works offline.
// Privacy: `locateFile` replaces the library's default jsDelivr CDN URL, so nothing is fetched
// from anywhere else, and frames are decoded in memory — nothing leaves the phone.

/** The retail formats a food package carries. */
export const FOOD_BARCODE_FORMATS = ['EAN13', 'EAN8', 'UPCA'] as const;

export interface BarcodeDecoder {
  /** The digits of the first valid EAN-13 / EAN-8 / UPC-A in the frame, or null. */
  decode(source: ImageData): Promise<string | null>;
}

/** The slice of `zxing-wasm/reader` we use (kept narrow so tests can fake it). */
export interface ZxingReaderLib {
  prepareZXingModule(options: {
    overrides: { locateFile: (path: string, prefix: string) => string };
    fireImmediately: true;
  }): Promise<unknown>;
  readBarcodes(
    input: ImageData,
    options: { formats: string[]; maxNumberOfSymbols: number; tryHarder: boolean },
  ): Promise<readonly { isValid: boolean; text: string }[]>;
}

export interface DecoderDeps {
  lib: ZxingReaderLib;
  /** Same-origin URL of zxing_reader.wasm. */
  wasmUrl: string;
}

async function importDeps(): Promise<DecoderDeps> {
  const [lib, wasm] = await Promise.all([
    import('zxing-wasm/reader'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  return { lib: lib as unknown as ZxingReaderLib, wasmUrl: wasm.default };
}

let pending: Promise<BarcodeDecoder> | null = null;

/** Builds a decoder from loaded deps: instantiates the wasm from our origin once. */
export async function createBarcodeDecoder({ lib, wasmUrl }: DecoderDeps): Promise<BarcodeDecoder> {
  await lib.prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
    fireImmediately: true,
  });
  return {
    async decode(source) {
      const results = await lib.readBarcodes(source, {
        formats: [...FOOD_BARCODE_FORMATS],
        maxNumberOfSymbols: 1,
        tryHarder: true,
      });
      const hit = results.find((r) => r.isValid && /^\d{8,13}$/.test(r.text));
      return hit ? hit.text : null;
    },
  };
}

/**
 * Loads the decoder once (later calls share it). A failed load is not cached, so the
 * caller can fall back to typing the digits and retry the scanner later.
 */
export function loadBarcodeDecoder(load: () => Promise<DecoderDeps> = importDeps): Promise<BarcodeDecoder> {
  if (!pending) {
    pending = load()
      .then(createBarcodeDecoder)
      .catch((err: unknown) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

/** Test hook: forget the cached decoder. */
export function resetBarcodeDecoderForTests(): void {
  pending = null;
}
