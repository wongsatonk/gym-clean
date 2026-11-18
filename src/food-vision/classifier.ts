// M7b task 11: on-device food classifier (MediaPipe Image Classifier).
//
// - The model is the one the user imported in Settings (stored in IndexedDB, photoStore
//   `getModel`); it's passed to MediaPipe as `modelAssetBuffer`. No model is bundled or fetched.
// - `@mediapipe/tasks-vision` is imported lazily (its own chunk) and its wasm comes from our own
//   origin (`public/mediapipe/wasm`, precached by the service worker), the same folder the pose
//   camera uses. Nothing is fetched from anywhere else; photos never leave the phone.
// - GPU delegate first; if it fails to load or its warm-up classify throws, CPU.
// - One shared classifier; a failed load isn't cached, so the next photo retries.
// - `validateModel` reads the labels from the model's metadata (the label file in the zip the
//   MediaPipe metadata writer appends to the .tflite) and checks each is a known class (a subset
//   is fine, so older models survive a bigger class map),
//   then does a trial load so a file MediaPipe can't run is rejected at import, not at the table.
// - Preprocessing contract (matches ml/gymfood/export.py and `images.load_image`): the head is
//   trained on photos stretched to 224×224 by Pillow's antialiased bilinear resize, no crop.
//   MediaPipe's own downscale isn't antialiased (flips ~5% of THFOOD answers, more on big phone
//   photos), so `classify` first draws the photo onto its own 224×224 canvas: stretched, no crop,
//   `imageSmoothingEnabled = true`, `imageSmoothingQuality = 'high'`, and a big photo is halved
//   step by step (each step ≥ 2× on a side) before the last draw, so every step is antialiased.
//   MediaPipe only ever sees that canvas; `ms` covers resize + classify.
// - E2E seam: `window.__gymCleanFakeFoodClassifier` is read only when `import.meta.env.DEV`, so
//   the production build drops it (checked by classifier.build.test.ts).
import { readZip } from '../core/zip';
import { CLASS_LABELS } from './classMap';
import type { ScoredLabel } from './decide';

export type Delegate = 'GPU' | 'CPU';

/** What the Settings import gets back (same shape as `ModelCheck` in src/ui/screens/foodPhotos). */
export type ModelCheck =
  { ok: true; labels: string[] } | { ok: false; reason: 'mismatch' | 'unreadable' };

export interface ClassifyResult {
  /** Highest score first. Feed straight into `decide()`. */
  categories: ScoredLabel[];
  /** Resize to 224×224 + inference, in ms. */
  ms: number;
}

export interface FoodClassifier {
  readonly delegate: Delegate;
  classify(image: ClassifyImage): ClassifyResult;
  close(): void;
}

/** Anything `drawImage` takes: the prepared photo canvas, an ImageBitmap, an img or video. */
export type ClassifyImage =
  HTMLCanvasElement | OffscreenCanvas | ImageBitmap | HTMLImageElement | HTMLVideoElement;

/** The slice of a 2D canvas the resizer uses (narrow so tests can fake it). */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(id: '2d'): {
    imageSmoothingEnabled: boolean;
    imageSmoothingQuality: ImageSmoothingQuality;
    drawImage(image: never, dx: number, dy: number, dw: number, dh: number): void;
  } | null;
}

/** The stored model as photoStore `getModel` returns it (only these fields are read). */
export interface FoodModelSource {
  blob: Blob;
  /** Identifies the model version: a re-imported model replaces the loaded classifier. */
  importedAt: number;
}

// --- the slice of @mediapipe/tasks-vision we use (narrow so tests can fake it) ----------------

interface CreateOptions {
  baseOptions: { modelAssetBuffer: Uint8Array; delegate: Delegate };
  runningMode: 'IMAGE';
  maxResults: number;
}

export interface ImageClassifierLike {
  classify(image: TexImageSource): {
    classifications: { categories: { categoryName: string; score: number }[] }[];
  };
  close(): void;
}

export interface VisionLib {
  FilesetResolver: { forVisionTasks(basePath: string): Promise<unknown> };
  ImageClassifier: {
    createFromOptions(fileset: never, options: CreateOptions): Promise<ImageClassifierLike>;
  };
}

export interface ClassifierDeps {
  loadLib: () => Promise<VisionLib>;
  now: () => number;
  /** A tiny blank image for the warm-up classify; null skips the warm-up. */
  blank: () => ClassifyImage | null;
  /** A 2D canvas of this size for the 224×224 resize; null (no DOM) passes the image through. */
  makeCanvas: (w: number, h: number) => CanvasLike | null;
}

/** Same-origin MediaPipe wasm folder (copied by scripts/copy-mediapipe-wasm.mjs). */
export const WASM_URL = `${import.meta.env.BASE_URL}mediapipe/wasm`;
export const MAX_RESULTS = 5;
/** Model input side; photos are stretched to INPUT_SIZE × INPUT_SIZE before MediaPipe. */
export const INPUT_SIZE = 224;
/** A model needs at least this many labels to be useful. */
export const MIN_LABELS = 2;

function makeCanvas(w: number, h: number): CanvasLike | null {
  // A DOM canvas where there is one (MediaPipe's most-tested input), OffscreenCanvas in a worker.
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c as unknown as CanvasLike;
  }
  if (typeof OffscreenCanvas !== 'undefined')
    return new OffscreenCanvas(w, h) as unknown as CanvasLike;
  return null;
}

function blankImage(): ClassifyImage | null {
  const fill = (
    ctx: { fillStyle: unknown; fillRect(x: number, y: number, w: number, h: number): void } | null,
  ) => {
    if (!ctx) return;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 8, 8);
  };
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(8, 8);
    fill(c.getContext('2d'));
    return c;
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    fill(c.getContext('2d'));
    return c;
  }
  return null;
}

export const DEFAULT_DEPS: ClassifierDeps = {
  loadLib: async () => (await import('@mediapipe/tasks-vision')) as unknown as VisionLib,
  now: () => performance.now(),
  blank: blankImage,
  makeCanvas,
};

// --- pure: the resize plan ---------------------------------------------------------------------

/**
 * Canvas sizes to draw through, last one INPUT_SIZE × INPUT_SIZE. A side at least 2× the target
 * is halved each step (so every downscale step is ≥ 2× and antialiased by smoothing); sides
 * already under 2× go straight to the final stretch. Never upscales an intermediate.
 */
export function resizePlan(
  w: number,
  h: number,
  size: number = INPUT_SIZE,
): { w: number; h: number }[] {
  const steps: { w: number; h: number }[] = [];
  let cw = Number.isFinite(w) && w > 0 ? Math.floor(w) : size;
  let ch = Number.isFinite(h) && h > 0 ? Math.floor(h) : size;
  while (cw >= 2 * size || ch >= 2 * size) {
    if (cw >= 2 * size) cw = Math.floor(cw / 2);
    if (ch >= 2 * size) ch = Math.floor(ch / 2);
    if (cw === size && ch === size) break; // this halving is the final draw
    steps.push({ w: cw, h: ch });
  }
  steps.push({ w: size, h: size });
  return steps;
}

/** The pixel size of a drawImage source (natural size for img / video, not CSS size). */
function sourceSize(img: ClassifyImage): { w: number; h: number } {
  const o = img as Partial<{
    videoWidth: number;
    videoHeight: number;
    naturalWidth: number;
    naturalHeight: number;
    width: number;
    height: number;
  }>;
  return {
    w: o.videoWidth || o.naturalWidth || o.width || 0,
    h: o.videoHeight || o.naturalHeight || o.height || 0,
  };
}

/** Stretches any image to one reused INPUT_SIZE canvas, halving big images first. */
function createResizer(make: ClassifierDeps['makeCanvas']): (img: ClassifyImage) => TexImageSource {
  const out = make(INPUT_SIZE, INPUT_SIZE);
  if (!out) return (img) => img;
  const scratch: CanvasLike[] = [];
  const draw = (to: CanvasLike, from: unknown, w: number, h: number) => {
    const ctx = to.getContext('2d');
    if (!ctx) throw new Error('food classifier: no 2D canvas');
    // Set every time: resizing a canvas resets its context state.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(from as never, 0, 0, w, h);
  };
  return (img) => {
    const { w, h } = sourceSize(img);
    const plan = resizePlan(w, h);
    let from: unknown = img;
    plan.slice(0, -1).forEach((step, i) => {
      // Ping-pong between two scratch canvases (a canvas can't draw onto itself).
      let c = scratch[i % 2];
      if (!c) {
        const made = make(step.w, step.h);
        if (!made) throw new Error('food classifier: no canvas');
        c = scratch[i % 2] = made;
      }
      if (c.width !== step.w) c.width = step.w;
      if (c.height !== step.h) c.height = step.h;
      draw(c, from, step.w, step.h);
      from = c;
    });
    draw(out, from, INPUT_SIZE, INPUT_SIZE);
    return out as unknown as TexImageSource;
  };
}

// --- pure: labels from the model metadata ------------------------------------------------------

const TFLITE_IDENT = [0x54, 0x46, 0x4c, 0x33]; // "TFL3" at byte 4 of a TFLite flatbuffer

/**
 * The classifier labels stored in a .tflite's metadata (the `labels.txt` the MediaPipe metadata
 * writer packs into the zip appended to the model), in model order. Null if the bytes aren't a
 * TFLite model or carry no label file.
 */
export function readModelLabels(bytes: Uint8Array): string[] | null {
  if (bytes.length < 8 || TFLITE_IDENT.some((b, i) => bytes[4 + i] !== b)) return null;
  let files;
  try {
    files = readZip(bytes);
  } catch {
    return null;
  }
  const file =
    files.find((f) => f.name === 'labels.txt') ??
    files.find((f) => /label[^/]*\.txt$/i.test(f.name));
  if (!file) return null;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(file.data);
  } catch {
    return null;
  }
  const labels = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  return labels.length > 0 ? labels : null;
}

/**
 * Ok when every model label is a known class (`known`, default CLASS_LABELS), with no repeats
 * and at least 2 labels. A model may cover a subset, so a model trained before the class map grew
 * keeps working. Returns the model's labels in model order (the UI shows "N dishes").
 */
export function checkLabels(
  labels: readonly string[],
  known: readonly string[] = CLASS_LABELS,
): ModelCheck {
  const allowed = new Set(known);
  const ok =
    labels.length >= MIN_LABELS &&
    new Set(labels).size === labels.length &&
    labels.every((l) => allowed.has(l));
  return ok ? { ok: true, labels: [...labels] } : { ok: false, reason: 'mismatch' };
}

// --- e2e fake (dev builds only) ----------------------------------------------------------------

interface FakeFoodClassifier {
  /** Labels validateModel reports (default CLASS_LABELS). */
  labels?: readonly string[];
  /** Results for every photo, or a function of the image. */
  classify?: readonly ScoredLabel[] | ((image: TexImageSource) => readonly ScoredLabel[]);
  /** validateModel → unreadable. */
  unreadable?: boolean;
  /** loadFoodClassifier rejects. */
  failLoad?: boolean;
}

function fakeSeam(): FakeFoodClassifier | undefined {
  return import.meta.env.DEV
    ? (globalThis as { __gymCleanFakeFoodClassifier?: FakeFoodClassifier })
        .__gymCleanFakeFoodClassifier
    : undefined;
}

// --- loading -----------------------------------------------------------------------------------

const sorted = (cats: readonly ScoredLabel[]): ScoredLabel[] =>
  cats
    .map(({ categoryName, score }) => ({ categoryName, score }))
    .sort((a, b) => b.score - a.score);

function wrap(
  delegate: Delegate,
  run: (image: TexImageSource) => readonly ScoredLabel[],
  closeImpl: () => void,
  now: () => number,
  resize: (image: ClassifyImage) => TexImageSource,
): FoodClassifier {
  let closed = false;
  return {
    delegate,
    classify(image) {
      if (closed) throw new Error('food classifier closed');
      const t0 = now();
      const cats = run(resize(image));
      const ms = now() - t0;
      return { categories: sorted(cats), ms };
    },
    close() {
      if (closed) return;
      closed = true;
      closeImpl();
    },
  };
}

async function create(bytes: Uint8Array, deps: ClassifierDeps): Promise<FoodClassifier> {
  const fake = fakeSeam();
  if (fake) {
    if (fake.failLoad) throw new Error('fake food classifier load failed');
    const c = fake.classify ?? [];
    return wrap(
      'CPU',
      (img) => (typeof c === 'function' ? c(img) : c),
      () => {},
      deps.now,
      createResizer(deps.makeCanvas),
    );
  }

  const lib = await deps.loadLib();
  const fileset = (await lib.FilesetResolver.forVisionTasks(WASM_URL)) as never;
  const make = (delegate: Delegate, buffer: Uint8Array) =>
    lib.ImageClassifier.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: buffer, delegate },
      runningMode: 'IMAGE',
      maxResults: MAX_RESULTS,
    });
  const run = (c: ImageClassifierLike) => (image: TexImageSource) =>
    c.classify(image).classifications[0]?.categories ?? [];
  const resize = createResizer(deps.makeCanvas);
  const warmUp = (c: ImageClassifierLike) => {
    const img = deps.blank();
    if (img) c.classify(resize(img)); // first run compiles shaders / JITs; also proves the delegate works
  };

  let gpu: ImageClassifierLike | null = null;
  try {
    // A copy, in case the wasm side takes ownership of the buffer and the CPU retry needs it.
    gpu = await make('GPU', bytes.slice());
    warmUp(gpu);
    const c = gpu;
    return wrap('GPU', run(c), () => c.close(), deps.now, resize);
  } catch (err) {
    gpu?.close();
    console.warn('Food classifier GPU delegate failed, using CPU', err);
  }
  const cpu = await make('CPU', bytes);
  try {
    warmUp(cpu);
  } catch (err) {
    cpu.close();
    throw err;
  }
  return wrap('CPU', run(cpu), () => cpu.close(), deps.now, resize);
}

interface Shared {
  key: number;
  promise: Promise<FoodClassifier>;
  disposed: boolean;
  /** Set once loaded, so dispose can close it right away. */
  value?: FoodClassifier;
}
let shared: Shared | null = null;

/**
 * The shared classifier for this model; loads it on first use (later calls get the same one).
 * A different model (another `importedAt`) closes the old classifier first. A failed load is not
 * cached: the next call tries again.
 */
export function loadFoodClassifier(
  model: FoodModelSource,
  deps: ClassifierDeps = DEFAULT_DEPS,
): Promise<FoodClassifier> {
  if (shared && shared.key === model.importedAt) return shared.promise;
  disposeFoodClassifier();
  const entry: Shared = {
    key: model.importedAt,
    disposed: false,
    promise: Promise.resolve(null as never),
  };
  entry.promise = model.blob
    .arrayBuffer()
    .then((buf) => create(new Uint8Array(buf), deps))
    .then(
      (c) => {
        if (entry.disposed) {
          c.close();
          throw new Error('food classifier disposed while loading');
        }
        entry.value = c;
        return c;
      },
      (err: unknown) => {
        if (shared === entry) shared = null;
        throw err;
      },
    );
  shared = entry;
  return entry.promise;
}

/** Closes the shared classifier (after Remove / Replace model, or when photos aren't needed). */
export function disposeFoodClassifier(): void {
  const entry = shared;
  shared = null;
  if (!entry) return;
  entry.disposed = true; // a pending load closes its classifier when it arrives
  entry.value?.close();
  entry.promise.catch(() => {}); // the caller of loadFoodClassifier sees the rejection
}

/**
 * Settings → import: are this file's labels our dish classes, and can MediaPipe run it?
 * Labels come from the model metadata; each must be a known class, no repeats, ≥ 2 (else
 * 'mismatch', without loading MediaPipe). A subset of CLASS_LABELS is fine. A file that isn't a labelled TFLite model, or that MediaPipe can't
 * load, is 'unreadable'. Uses its own short-lived classifier; the shared one is untouched.
 */
export async function validateModel(
  file: Blob,
  deps: ClassifierDeps = DEFAULT_DEPS,
): Promise<ModelCheck> {
  const fake = fakeSeam();
  if (fake) {
    if (fake.unreadable) return { ok: false, reason: 'unreadable' };
    return checkLabels(fake.labels ?? CLASS_LABELS);
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const labels = readModelLabels(bytes);
  if (!labels) return { ok: false, reason: 'unreadable' };
  const check = checkLabels(labels);
  if (!check.ok) return check;
  try {
    (await create(bytes, deps)).close();
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  return check;
}
