// M7 task 21: the barcode scanner sheet (M7-q5, only while barcode lookup is on).
// The rear camera shows in a live <video>; frames are read on the phone by the browser's
// `BarcodeDetector` where it exists, else by the zxing-wasm reader (barcodeDecoder.ts, our own
// origin), else the sheet is typing only. Typed digits always work.
// Privacy: nothing is recorded or uploaded. A frame is a canvas read in memory, the stream stops
// on a hit, on close, and when the page is hidden. The only network call is the lookup the app
// makes with the digits (src/data/nutrition/offClient.ts), never from here.
//
// e2e hooks: dialog `[data-scan-sheet]`, `[data-scan-video]`, `[data-scan-camera=starting|on|
// none|nodecoder|stopped]`, `#scan-digits`, `[data-scan-lookup]`, `[data-scan-result=<kind>]`,
// `[data-scan-add]`, `[data-scan-again]`. M13d task 40e: Look up / Add it to My foods are the main
// round pill, Scan again a second pill (fuelButtons.ts).
import { isValidBarcode, normalizeBarcode } from '../../core/nutrition/barcode';
import { h } from '../dom';
import { loadBarcodeDecoder, type BarcodeDecoder } from './barcodeDecoder';
import { appendAll, clear, field, inputValue, sheetShell } from './common';
import { fuelMain, saveRow, secondPill } from './fuelButtons';
import './barcodeScan.css';

/** What the lookup said (set by the app after `onCode`). */
export type ScanStatus =
  | { kind: 'idle' }
  | { kind: 'looking'; code: string }
  | { kind: 'missing'; code: string; reason: 'notFound' | 'incomplete' }
  | { kind: 'off' }
  | { kind: 'error'; reason: 'offline' | 'timeout' | 'http' }
  | { kind: 'invalid' };

export type CameraState = 'starting' | 'on' | 'none' | 'nodecoder' | 'stopped';

/** Reads one video frame; null when there is no barcode in it. */
export interface FrameDecoder {
  decode(video: HTMLVideoElement): Promise<string | null>;
}

export type ScanEnv = {
  getUserMedia: ((c: MediaStreamConstraints) => Promise<MediaStream>) | null;
  /** The frame reader, or null (typing only). */
  makeDecoder: () => Promise<FrameDecoder | null>;
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
  /** Calls `cb` when the page is hidden; returns the unsubscribe. */
  onHidden: (cb: () => void) => () => void;
};

export type ScanSheetActions = {
  /** A valid code, scanned or typed. The app looks it up and calls `setStatus`. */
  onCode: (code: string) => void;
  /** "Add it to My foods" after notFound / incomplete. */
  onAddFood: (code: string) => void;
  onClose: () => void;
};

export type ScanSheet = HTMLElement & {
  setStatus: (s: ScanStatus) => void;
  /** Stops the camera and the frame loop (the app calls it when the sheet goes). */
  dispose: () => void;
  camera: () => CameraState;
};

/** Time between frame reads: enough for a steady hand, light on the battery. */
export const SCAN_INTERVAL_MS = 200;
/** Frames are scaled to at most this width before decoding. */
const FRAME_MAX_W = 960;

export const CAMERA_TEXT: Record<CameraState, string> = {
  starting: 'Starting the camera…',
  on: 'Hold the barcode inside the frame.',
  none: 'The camera isn’t available. Type the numbers instead.',
  nodecoder: 'This phone can’t read barcodes here. Type the numbers instead.',
  stopped: 'Camera off.',
};

/** The line under the scanner for a lookup result. Pure. */
export function statusText(s: ScanStatus): string {
  switch (s.kind) {
    case 'idle':
      return '';
    case 'looking':
      return `Looking up ${s.code}…`;
    case 'missing':
      return s.reason === 'notFound'
        ? `Open Food Facts doesn’t have ${s.code} yet. Add it from the package label.`
        : `Open Food Facts has ${s.code}, but without calories or protein. Add it from the package label.`;
    case 'off':
      return 'Barcode lookup is off. Turn it on in Settings, Nutrition.';
    case 'error':
      return s.reason === 'timeout'
        ? 'Open Food Facts took too long. Try again.'
        : s.reason === 'offline'
          ? 'No connection. Try again when you’re online.'
          : 'Open Food Facts didn’t answer. Try again later.';
    case 'invalid':
      return 'Check the numbers. A barcode has 8, 12 or 13 digits.';
  }
}

// ---------- frame readers ----------

type DetectorLike = { detect(source: unknown): Promise<readonly { rawValue: string }[]> };
type DetectorCtor = {
  new (opts: { formats: string[] }): DetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a'];

const firstValid = (codes: readonly string[]): string | null =>
  codes.map(normalizeBarcode).find(isValidBarcode) ?? null;

/** The browser's own reader (Android Chrome, desktop Chrome on Mac), or null when missing. */
export async function nativeDecoder(Ctor: DetectorCtor | undefined): Promise<FrameDecoder | null> {
  if (typeof Ctor !== 'function') return null;
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? NATIVE_FORMATS;
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    if (!formats.length) return null;
    const det = new Ctor({ formats });
    return {
      async decode(video) {
        const hits = await det.detect(video);
        return firstValid(hits.map((x) => x.rawValue));
      },
    };
  } catch {
    return null;
  }
}

/** Draws the current frame (scaled down) and reads its pixels; null before the first frame. */
export function grabFrame(video: HTMLVideoElement): ImageData | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(1, FRAME_MAX_W / vw);
  const w = Math.round(vw * scale);
  const hgt = Math.round(vh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, hgt);
  return ctx.getImageData(0, 0, w, hgt);
}

/** The zxing-wasm reader on grabbed frames. */
export function libraryDecoder(
  dec: BarcodeDecoder,
  grab: (v: HTMLVideoElement) => ImageData | null = grabFrame,
): FrameDecoder {
  return {
    async decode(video) {
      const frame = grab(video);
      if (!frame) return null;
      const code = await dec.decode(frame);
      return code ? firstValid([code]) : null;
    },
  };
}

/** BarcodeDetector where it exists, else the library, else null (typing only). */
export async function makeFrameDecoder(
  g: { BarcodeDetector?: unknown } = globalThis as { BarcodeDetector?: unknown },
  load: () => Promise<BarcodeDecoder> = () => loadBarcodeDecoder(),
): Promise<FrameDecoder | null> {
  const native = await nativeDecoder(g.BarcodeDetector as DetectorCtor | undefined);
  if (native) return native;
  try {
    return libraryDecoder(await load());
  } catch {
    return null;
  }
}

export function browserScanEnv(): ScanEnv {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  return {
    getUserMedia: md?.getUserMedia ? (c) => md.getUserMedia(c) : null,
    makeDecoder: () => makeFrameDecoder(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id),
    onHidden: (cb) => {
      const on = () => {
        if (document.visibilityState === 'hidden') cb();
      };
      document.addEventListener('visibilitychange', on);
      return () => document.removeEventListener('visibilitychange', on);
    },
  };
}

// ---------- the sheet ----------

export function barcodeScanSheet(a: ScanSheetActions, env: ScanEnv = browserScanEnv()): ScanSheet {
  let camera: CameraState = 'starting';
  let stream: MediaStream | null = null;
  let decoder: FrameDecoder | null = null;
  let timer: number | undefined;
  /** Bumped on every stop: a camera or decoder that resolves later is dropped. */
  let token = 0;
  let disposed = false;

  const shell = sheetShell({
    title: 'Scan a barcode',
    key: 'scan-sheet',
    closeLabel: 'Close',
    onClose: () => a.onClose(),
  });

  const video = h('video', {
    class: 'scan-video',
    'data-scan-video': true,
    muted: true,
    playsinline: true,
    autoplay: true,
    'aria-hidden': 'true',
  });
  (video as { muted: boolean }).muted = true;
  const frame = h('div', { class: 'scan-frame', 'aria-hidden': 'true' });
  const view = h('div', { class: 'scan-view' }, video, frame);
  const camLine = h('p', { class: 'scan-cam', role: 'status', 'data-scan-camera': camera });
  const again = secondPill({
    icon: 'camera',
    label: 'Scan again',
    hooks: { 'data-scan-again': true },
    onClick: () => void start(),
  });
  again.setAttribute('hidden', '');

  const digits = field({
    id: 'scan-digits',
    label: 'Or type the numbers under the bars',
    hint: '8, 12 or 13 digits',
  });
  digits.input.setAttribute('inputmode', 'numeric');
  digits.input.setAttribute('enterkeyhint', 'search');
  const lookupBtn = fuelMain({
    icon: 'search',
    label: 'Look up',
    hooks: { 'data-scan-lookup': true },
    onClick: () => submitTyped(),
  });
  const submitTyped = () => {
    const code = normalizeBarcode(inputValue(digits.input));
    if (!isValidBarcode(code)) {
      digits.error.textContent = statusText({ kind: 'invalid' });
      digits.input.focus();
      return;
    }
    digits.error.textContent = '';
    stop('stopped');
    a.onCode(code);
  };
  digits.input.addEventListener('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Enter') submitTyped();
  });

  const result = h('div', {
    class: 'scan-result',
    'aria-live': 'polite',
    'data-scan-result': 'idle',
  });

  appendAll(
    shell.body,
    view,
    camLine,
    again,
    h(
      'p',
      { class: 'fuel-hint scan-privacy' },
      'The camera picture stays on this phone. Nothing is recorded.',
    ),
    result,
    digits.wrap,
    saveRow(lookupBtn),
  );

  function paintCamera(next: CameraState): void {
    camera = next;
    camLine.setAttribute('data-scan-camera', next);
    camLine.textContent = CAMERA_TEXT[next];
    if (next === 'on' || next === 'starting') view.removeAttribute('hidden');
    else view.setAttribute('hidden', '');
    // Scan again only where a camera can come back.
    if (next === 'stopped' && env.getUserMedia && !disposed) again.removeAttribute('hidden');
    else again.setAttribute('hidden', '');
  }

  function stop(next: CameraState): void {
    token++;
    if (timer !== undefined) env.clearTimer(timer);
    timer = undefined;
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null;
    (video as { srcObject: MediaStream | null }).srcObject = null;
    if (camera === 'starting' || camera === 'on') paintCamera(next);
  }

  function schedule(my: number): void {
    timer = env.setTimer(() => void tick(my), SCAN_INTERVAL_MS);
  }

  async function tick(my: number): Promise<void> {
    timer = undefined;
    if (my !== token || !decoder) return;
    const ready = (video as { readyState?: number }).readyState;
    let code: string | null = null;
    if (ready === undefined || ready >= 2) {
      try {
        code = await decoder.decode(video);
      } catch {
        code = null; // a bad frame: try the next one
      }
    }
    if (my !== token) return;
    if (code) {
      stop('stopped');
      (digits.input as { value: string }).value = code;
      a.onCode(code);
      return;
    }
    schedule(my);
  }

  async function start(): Promise<void> {
    if (disposed) return;
    stop('stopped');
    const my = token;
    paintCamera('starting');
    if (!env.getUserMedia) {
      paintCamera('none');
      return;
    }
    // The reader loads while the camera opens (the wasm is ~0.9 MB on the first scan).
    const reading = decoder ? Promise.resolve(decoder) : env.makeDecoder().catch(() => null);
    let s: MediaStream;
    try {
      s = await env.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch {
      if (my === token) paintCamera('none');
      return;
    }
    if (my !== token || disposed) {
      // Closed or typed while the camera was opening: never leave it running.
      for (const t of s.getTracks()) t.stop();
      return;
    }
    stream = s;
    (video as { srcObject: MediaStream | null }).srcObject = s;
    void (video as { play?: () => Promise<void> }).play?.()?.catch(() => undefined);
    decoder = await reading;
    if (my !== token) return; // stop() already ended the stream
    if (!decoder) {
      stop('nodecoder');
      return;
    }
    paintCamera('on');
    schedule(my);
  }

  const unHidden = env.onHidden(() => stop('stopped'));

  function setStatus(s: ScanStatus): void {
    result.setAttribute('data-scan-result', s.kind);
    clear(result);
    const text = statusText(s);
    if (!text) return;
    result.append(
      h('p', { class: s.kind === 'looking' ? 'scan-msg' : 'fuel-note scan-msg' }, text),
    );
    if (s.kind === 'missing') {
      const code = s.code;
      result.append(
        fuelMain({
          icon: 'plus',
          label: 'Add it to My foods',
          hooks: { 'data-scan-add': code },
          onClick: () => a.onAddFood(code),
        }),
      );
    }
  }

  paintCamera('starting');
  void start();

  return Object.assign(shell.el, {
    setStatus,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      stop('stopped');
      unHidden();
    },
    camera: () => camera,
  }) as ScanSheet;
}
