// Where MediaPipe's wasm runtime and the pose model come from (self-hosted, no CDN).
//
// Web/PWA (http/https): unchanged, MediaPipe loads the files from our own paths itself.
// Native (Capacitor, capacitor://localhost): we fetch the loader script ourselves (same-origin
// fetch) and hand MediaPipe a blob: URL, and fetch the model into a buffer. MediaPipe would
// otherwise inject <script crossorigin="anonymous"> for the loader, whose only failure signal is a
// bare error Event; our own fetch avoids the CORS-mode script load on the custom scheme and, if a
// file is missing or blocked, fails with its name and the reason.
import { describeLoadError, fileLoadError } from './loadError';

export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export type WasmFiles = { wasmLoaderPath: string; wasmBinaryPath: string };

/** True for any non-web scheme (capacitor:), where we load the files ourselves. */
export function isNativeScheme(protocol: string): boolean {
  return protocol !== 'http:' && protocol !== 'https:';
}

export function wasmFilePaths(base: string): WasmFiles {
  const dir = `${base}mediapipe/wasm`;
  return {
    wasmLoaderPath: `${dir}/vision_wasm_internal.js`,
    wasmBinaryPath: `${dir}/vision_wasm_internal.wasm`,
  };
}

async function get(url: string, fetchFn: FetchLike) {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchFn(url);
  } catch (err) {
    throw fileLoadError(url, describeLoadError(err));
  }
  if (!res.ok) throw fileLoadError(url, `HTTP ${res.status}`);
  return res;
}

export type LoadFilesetOptions = {
  base: string;
  native: boolean;
  /** Page origin, e.g. "capacitor://localhost"; makes the native paths absolute. */
  origin: string;
  fetchFn: FetchLike;
  createObjectURL: (b: Blob) => string;
  revokeObjectURL: (url: string) => void;
};

/** The WasmFileset for PoseLandmarker; call `release()` once the landmarker is created. */
export async function loadWasmFileset(o: LoadFilesetOptions): Promise<{ fileset: WasmFiles; release(): void }> {
  const paths = wasmFilePaths(o.base);
  if (!o.native) return { fileset: paths, release: () => {} };
  const loaderUrl = new URL(paths.wasmLoaderPath, o.origin).href;
  const code = await (await get(loaderUrl, o.fetchFn)).text();
  const blobUrl = o.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  return {
    fileset: { wasmLoaderPath: blobUrl, wasmBinaryPath: new URL(paths.wasmBinaryPath, o.origin).href },
    release: () => o.revokeObjectURL(blobUrl),
  };
}

/** The model file's bytes (native path: passed to MediaPipe as modelAssetBuffer). */
export async function loadModelBuffer(url: string, fetchFn: FetchLike): Promise<Uint8Array> {
  const res = await get(url, fetchFn);
  try {
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    throw fileLoadError(url, describeLoadError(err));
  }
}
