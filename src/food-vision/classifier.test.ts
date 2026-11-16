// M7b task 11: classifier wrapper. Everything MediaPipe is faked through the injected `lib`;
// the label reader runs on a hand-made TFLite-with-metadata buffer and, when it exists locally
// (gitignored), on the real smoke model from ml/.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipStore } from '../core/zip';
import { CLASS_LABELS } from './classMap';
import {
  INPUT_SIZE,
  WASM_URL,
  checkLabels,
  disposeFoodClassifier,
  loadFoodClassifier,
  readModelLabels,
  resizePlan,
  validateModel,
  type CanvasLike,
  type ClassifierDeps,
  type ImageClassifierLike,
  type VisionLib,
} from './classifier';

const enc = new TextEncoder();

/** A minimal "TFLite with metadata": flatbuffer-ish head (TFL3 identifier) + appended zip. */
function fakeTflite(files: Record<string, string>, ident = 'TFL3'): Uint8Array {
  const head = new Uint8Array(64);
  head.set(enc.encode(ident), 4);
  const zip = zipStore(
    Object.entries(files).map(([name, text]) => ({ name, data: enc.encode(text), mtime: 0 })),
  );
  const out = new Uint8Array(head.length + zip.length);
  out.set(head);
  // Offsets in the zip are absolute (as the metadata populator writes them), so shift them.
  out.set(zip, head.length);
  return shiftZipOffsets(out, head.length);
}

// zipStore writes offsets relative to its own start; a metadata zip is appended to the model, so
// its central directory points at absolute offsets. Rewrite them like Python's zipfile 'a' mode.
function shiftZipOffsets(bytes: Uint8Array, by: number): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  const count = dv.getUint16(eocd + 10, true);
  const cd = dv.getUint32(eocd + 16, true) + by;
  dv.setUint32(eocd + 16, cd, true);
  let o = cd;
  for (let n = 0; n < count; n++) {
    dv.setUint32(o + 42, dv.getUint32(o + 42, true) + by, true);
    o += 46 + dv.getUint16(o + 28, true) + dv.getUint16(o + 30, true) + dv.getUint16(o + 32, true);
  }
  return bytes;
}

const allLabels = (labels: readonly string[] = CLASS_LABELS) =>
  fakeTflite({ 'labels.txt': labels.join('\n') + '\n' });
const blob = (bytes: Uint8Array) => new Blob([bytes as BlobPart]);

describe('readModelLabels', () => {
  it('reads labels.txt from the metadata zip, one per line, blank lines dropped', () => {
    const bytes = fakeTflite({ 'labels.txt': 'pad_thai\r\ntom_yum\n\n' });
    expect(readModelLabels(bytes)).toEqual(['pad_thai', 'tom_yum']);
  });

  it('returns null for a file that is not a TFLite model', () => {
    expect(readModelLabels(fakeTflite({ 'labels.txt': 'a' }, 'PK\u0003\u0004'))).toBeNull();
    expect(readModelLabels(enc.encode('hello'))).toBeNull();
    expect(readModelLabels(new Uint8Array(0))).toBeNull();
  });

  it('returns null for a model without a label file', () => {
    expect(readModelLabels(fakeTflite({ 'notes.md': 'x' }))).toBeNull();
    const bare = new Uint8Array(64);
    bare.set(enc.encode('TFL3'), 4);
    expect(readModelLabels(bare)).toBeNull();
  });

  const smoke = fileURLToPath(new URL('../../ml/models/smoke.tflite', import.meta.url));
  it.skipIf(!existsSync(smoke))('reads the real smoke model from ml/ (local only)', () => {
    const labels = readModelLabels(new Uint8Array(readFileSync(smoke)));
    expect(labels).toEqual(['pad_thai', 'tom_yum_goong']);
    // Both smoke labels are known classes: a 2-class subset model is accepted.
    expect(checkLabels(labels ?? [])).toEqual({ ok: true, labels: ['pad_thai', 'tom_yum_goong'] });
  });
});

describe('checkLabels', () => {
  it('ok when every label is a known class (any order), returning the model labels', () => {
    const shuffled = [...CLASS_LABELS].reverse();
    expect(checkLabels(shuffled)).toEqual({ ok: true, labels: shuffled });
  });

  it('ok for a subset: an older model trained before the class map grew', () => {
    const older = CLASS_LABELS.slice(0, CLASS_LABELS.length - 3);
    expect(checkLabels(older)).toEqual({ ok: true, labels: older });
    expect(checkLabels(CLASS_LABELS.slice(5, 7))).toEqual({
      ok: true,
      labels: CLASS_LABELS.slice(5, 7),
    });
  });

  it('mismatch for an unknown label, a repeat, or fewer than 2 labels', () => {
    expect(checkLabels([...CLASS_LABELS, 'pizza'])).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkLabels(['pad_thai', 'Pad_Thai'])).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkLabels(['pad_thai'])).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkLabels([...CLASS_LABELS, CLASS_LABELS[0] ?? ''])).toEqual({
      ok: false,
      reason: 'mismatch',
    });
    expect(checkLabels([])).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('takes a custom known list', () => {
    expect(checkLabels(['b', 'a'], ['a', 'b', 'c'])).toEqual({ ok: true, labels: ['b', 'a'] });
    expect(checkLabels(['b', 'd'], ['a', 'b', 'c'])).toEqual({ ok: false, reason: 'mismatch' });
  });
});

// --- fake MediaPipe ---------------------------------------------------------------------------

type Seen = { width?: number; height?: number };
let seen: Seen[] = [];
let events: string[] = [];

type Created = {
  delegate: string;
  buffer: Uint8Array;
  closed: boolean;
  runningMode: string;
  maxResults: number;
};

function fakeLib(opts: { failGpu?: boolean; failAll?: number; gpuClassifyThrows?: boolean } = {}) {
  const created: Created[] = [];
  const filesets: string[] = [];
  let failures = opts.failAll ?? 0;
  const lib: VisionLib = {
    FilesetResolver: {
      forVisionTasks: vi.fn(async (url: string) => {
        filesets.push(url);
        return { wasmLoaderPath: url, wasmBinaryPath: url };
      }),
    },
    ImageClassifier: {
      createFromOptions: vi.fn(async (_fs, o) => {
        if (failures > 0) {
          failures--;
          throw new Error('load failed');
        }
        const delegate = o.baseOptions?.delegate ?? 'CPU';
        if (opts.failGpu && delegate === 'GPU') throw new Error('no webgl');
        const rec: Created = {
          delegate,
          buffer: o.baseOptions?.modelAssetBuffer as Uint8Array,
          closed: false,
          runningMode: o.runningMode ?? '',
          maxResults: o.maxResults ?? -1,
        };
        created.push(rec);
        const c: ImageClassifierLike = {
          classify: (image) => {
            seen.push(image as Seen);
            events.push('classify');
            if (opts.gpuClassifyThrows && delegate === 'GPU') throw new Error('gpu classify');
            return {
              classifications: [
                {
                  categories: [
                    { categoryName: 'tom_yum_goong', score: 0.2, index: 1, displayName: '' },
                    { categoryName: 'pad_thai', score: 0.7, index: 0, displayName: '' },
                  ],
                },
              ],
            };
          },
          close: () => {
            rec.closed = true;
          },
        };
        return c;
      }),
    },
  };
  return { lib, created, filesets };
}

type Draw = { from: Seen; to: CanvasLike; w: number; h: number; smooth: boolean; quality: string };
let draws: Draw[] = [];
let canvases: CanvasLike[] = [];

/** A 2D canvas stand-in that records each drawImage (smoothing state included). */
function fakeCanvas(width: number, height: number): CanvasLike {
  const canvas: CanvasLike = {
    width,
    height,
    getContext: () => ctx,
  };
  const ctx = {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low' as ImageSmoothingQuality,
    drawImage(from: unknown, _x: number, _y: number, w: number, h: number) {
      events.push('draw');
      draws.push({
        from: from as Seen,
        to: canvas,
        w,
        h,
        smooth: ctx.imageSmoothingEnabled,
        quality: ctx.imageSmoothingQuality,
      });
    },
  };
  canvases.push(canvas);
  return canvas;
}

function deps(lib: VisionLib, extra: Partial<ClassifierDeps> = {}): ClassifierDeps {
  let t = 0;
  return {
    loadLib: vi.fn(async () => lib),
    now: () => (t += 40),
    blank: () => ({ width: 8, height: 8 }) as unknown as HTMLCanvasElement,
    makeCanvas: fakeCanvas,
    ...extra,
  };
}

const model = (importedAt = 1) => ({ blob: blob(allLabels()), importedAt });

afterEach(() => {
  disposeFoodClassifier();
  seen = [];
  events = [];
  draws = [];
  canvases = [];
});

describe('loadFoodClassifier', () => {
  it('uses the same-origin wasm folder (no scheme, no CDN)', () => {
    expect(WASM_URL).toMatch(/mediapipe\/wasm$/);
    expect(WASM_URL).not.toMatch(/^[a-z]+:|^\/\//i);
  });

  it('lazy-loads once: one import, one classifier, IMAGE mode, buffer from the stored blob', async () => {
    const { lib, created, filesets } = fakeLib();
    const d = deps(lib);
    const m = model();
    const [a, b] = await Promise.all([loadFoodClassifier(m, d), loadFoodClassifier(m, d)]);
    expect(a).toBe(b);
    expect(d.loadLib).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    expect(filesets).toEqual([WASM_URL]);
    expect(created[0]?.runningMode).toBe('IMAGE');
    expect(created[0]?.maxResults).toBe(5);
    expect(created[0]?.buffer).toBeInstanceOf(Uint8Array);
    expect(created[0]?.buffer.byteLength).toBe(m.blob.size);
    expect(a.delegate).toBe('GPU');
  });

  it('falls back to CPU when the GPU delegate fails to load', async () => {
    const { lib, created } = fakeLib({ failGpu: true });
    const c = await loadFoodClassifier(model(), deps(lib));
    expect(c.delegate).toBe('CPU');
    expect(created.map((x) => x.delegate)).toEqual(['CPU']);
  });

  it('falls back to CPU when the GPU warm-up classify throws, and closes the GPU one', async () => {
    const { lib, created } = fakeLib({ gpuClassifyThrows: true });
    const c = await loadFoodClassifier(model(), deps(lib));
    expect(c.delegate).toBe('CPU');
    expect(created.map((x) => [x.delegate, x.closed])).toEqual([
      ['GPU', true],
      ['CPU', false],
    ]);
  });

  it('does not cache a failed load: the next call retries', async () => {
    const { lib, created } = fakeLib({ failAll: 2 }); // GPU and CPU both fail once
    const d = deps(lib);
    await expect(loadFoodClassifier(model(), d)).rejects.toThrow('load failed');
    const c = await loadFoodClassifier(model(), d);
    expect(c.delegate).toBe('GPU');
    expect(created).toHaveLength(1);
  });

  it('a different model (new importedAt) closes the old classifier and loads the new one', async () => {
    const { lib, created } = fakeLib();
    const d = deps(lib);
    const a = await loadFoodClassifier(model(1), d);
    const b = await loadFoodClassifier(model(2), d);
    expect(a).not.toBe(b);
    expect(created.map((x) => x.closed)).toEqual([true, false]);
  });

  it('classify returns categories sorted by score and the time it took', async () => {
    const { lib } = fakeLib();
    const c = await loadFoodClassifier(model(), deps(lib));
    const r = c.classify({} as HTMLCanvasElement);
    expect(r.categories).toEqual([
      { categoryName: 'pad_thai', score: 0.7 },
      { categoryName: 'tom_yum_goong', score: 0.2 },
    ]);
    expect(r.ms).toBe(40);
  });

  it('disposeFoodClassifier closes it; classify after dispose throws; next load is fresh', async () => {
    const { lib, created } = fakeLib();
    const d = deps(lib);
    const c = await loadFoodClassifier(model(), d);
    disposeFoodClassifier();
    expect(created[0]?.closed).toBe(true);
    expect(() => c.classify({} as HTMLCanvasElement)).toThrow();
    await loadFoodClassifier(model(), d);
    expect(created).toHaveLength(2);
  });

  it('dispose during a pending load closes the classifier when it arrives', async () => {
    const { lib, created } = fakeLib();
    const p = loadFoodClassifier(model(), deps(lib));
    disposeFoodClassifier();
    await expect(p).rejects.toThrow(/disposed/);
    expect(created[0]?.closed).toBe(true);
  });
});

describe('preprocessing: MediaPipe always gets a 224×224 image', () => {
  it('resizePlan halves big sources (each step ≥ 2× in that side) before the last step to 224×224', () => {
    expect(INPUT_SIZE).toBe(224);
    expect(resizePlan(4032, 3024)).toEqual([
      { w: 2016, h: 1512 },
      { w: 1008, h: 756 },
      { w: 504, h: 378 },
      { w: 252, h: 378 },
      { w: 224, h: 224 },
    ]);
    expect(resizePlan(512, 384)).toEqual([
      { w: 256, h: 384 },
      { w: 224, h: 224 },
    ]);
    // 896 → 448 → 224: the last halving lands on 224×224, so it is the final draw.
    expect(resizePlan(896, 896)).toEqual([
      { w: 448, h: 448 },
      { w: 224, h: 224 },
    ]);
    expect(resizePlan(448, 448)).toEqual([{ w: 224, h: 224 }]);
    expect(resizePlan(300, 200)).toEqual([{ w: 224, h: 224 }]);
    expect(resizePlan(100, 80)).toEqual([{ w: 224, h: 224 }]);
    expect(resizePlan(4000, 300)).toEqual([
      { w: 2000, h: 300 },
      { w: 1000, h: 300 },
      { w: 500, h: 300 },
      { w: 250, h: 300 },
      { w: 224, h: 224 },
    ]);
    expect(resizePlan(0, 0)).toEqual([{ w: 224, h: 224 }]);
  });

  it('every intermediate step shrinks by at least 2× and never upscales', () => {
    for (const [w, h] of [
      [4032, 3024],
      [3024, 4032],
      [1080, 1920],
      [449, 2000],
    ] as const) {
      const plan = resizePlan(w, h);
      let prev: { w: number; h: number } = { w, h };
      for (const step of plan.slice(0, -1)) {
        expect(step.w === prev.w || step.w * 2 <= prev.w).toBe(true);
        expect(step.h === prev.h || step.h * 2 <= prev.h).toBe(true);
        expect(step.w).toBeGreaterThanOrEqual(224);
        prev = step;
      }
    }
  });

  it.each([
    [4032, 3024],
    [512, 384],
    [224, 224],
    [100, 80],
    [300, 1000],
  ])('a %i×%i input reaches MediaPipe as 224×224, smoothed "high"', async (w, h) => {
    const { lib } = fakeLib();
    const c = await loadFoodClassifier(model(), deps(lib));
    seen = [];
    draws = [];
    c.classify({ width: w, height: h } as HTMLCanvasElement);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ width: 224, height: 224 });
    expect(draws.length).toBe(resizePlan(w, h).length);
    expect(draws[0]?.from).toMatchObject({ width: w, height: h });
    expect(draws.at(-1)?.to).toBe(seen[0]);
    for (const d of draws) expect([d.smooth, d.quality]).toEqual([true, 'high']);
  });

  it('reads the natural size of images and videos, not their CSS size', async () => {
    const { lib } = fakeLib();
    const c = await loadFoodClassifier(model(), deps(lib));
    draws = [];
    c.classify({
      naturalWidth: 1000,
      naturalHeight: 1000,
      width: 10,
      height: 10,
    } as unknown as HTMLImageElement);
    expect(draws.map((d) => [d.w, d.h])).toEqual([
      [500, 500],
      [250, 250],
      [224, 224],
    ]);
  });

  it('reuses its canvases across photos', async () => {
    const { lib } = fakeLib();
    const c = await loadFoodClassifier(model(), deps(lib));
    c.classify({ width: 4032, height: 3024 } as HTMLCanvasElement);
    const n = canvases.length;
    c.classify({ width: 4032, height: 3024 } as HTMLCanvasElement);
    c.classify({ width: 640, height: 480 } as HTMLCanvasElement);
    expect(canvases.length).toBe(n);
    expect(seen.at(-1)).toBe(seen.at(-2));
  });

  it('ms covers the resize and the classify', async () => {
    const { lib } = fakeLib();
    let t = 0;
    const c = await loadFoodClassifier(
      model(),
      deps(lib, {
        now: () => {
          events.push('now');
          return (t += 10);
        },
      }),
    );
    events = [];
    const r = c.classify({ width: 1024, height: 768 } as HTMLCanvasElement);
    expect(events[0]).toBe('now');
    expect(events.at(-1)).toBe('now');
    expect(events.filter((e) => e === 'draw').length).toBeGreaterThan(0);
    expect(r.ms).toBe(10);
  });

  it('the warm-up runs through the same 224×224 path', async () => {
    const { lib } = fakeLib();
    await loadFoodClassifier(model(), deps(lib));
    expect(seen[0]).toMatchObject({ width: 224, height: 224 });
  });
});

describe('validateModel', () => {
  const file = (bytes: Uint8Array) => new File([bytes as BlobPart], 'food.tflite');

  it('ok + labels when the labels match and MediaPipe loads it; the trial classifier is closed', async () => {
    const { lib, created } = fakeLib();
    const r = await validateModel(file(allLabels()), deps(lib));
    expect(r).toEqual({ ok: true, labels: [...CLASS_LABELS] });
    expect(created).toHaveLength(1);
    expect(created[0]?.closed).toBe(true);
  });

  it('ok for a subset model, labels in model order', async () => {
    const { lib } = fakeLib();
    expect(await validateModel(file(allLabels(['tom_yum_goong', 'pad_thai'])), deps(lib))).toEqual({
      ok: true,
      labels: ['tom_yum_goong', 'pad_thai'],
    });
  });

  it('mismatch without loading MediaPipe when a label is unknown', async () => {
    const { lib } = fakeLib();
    const d = deps(lib);
    expect(await validateModel(file(allLabels(['pad_thai', 'pizza'])), d)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
    expect(d.loadLib).not.toHaveBeenCalled();
  });

  it('unreadable for a non-model file or one MediaPipe cannot load', async () => {
    const { lib } = fakeLib();
    expect(await validateModel(file(enc.encode('not a model')), deps(lib))).toEqual({
      ok: false,
      reason: 'unreadable',
    });
    const broken = fakeLib({ failAll: 9 });
    expect(await validateModel(file(allLabels()), deps(broken.lib))).toEqual({
      ok: false,
      reason: 'unreadable',
    });
  });

  it('does not touch the shared classifier', async () => {
    const { lib, created } = fakeLib();
    const d = deps(lib);
    const c = await loadFoodClassifier(model(), d);
    await validateModel(file(allLabels()), d);
    expect(created[0]?.closed).toBe(false);
    expect(await loadFoodClassifier(model(), d)).toBe(c);
  });
});

describe('e2e fake seam (dev builds only)', () => {
  const g = globalThis as { __gymCleanFakeFoodClassifier?: unknown };
  afterEach(() => {
    delete g.__gymCleanFakeFoodClassifier;
  });

  it('is used instead of MediaPipe when set (Vitest runs with DEV on)', async () => {
    expect(import.meta.env.DEV).toBe(true);
    g.__gymCleanFakeFoodClassifier = {
      classify: [
        { categoryName: 'tom_yum_goong', score: 0.1 },
        { categoryName: 'pad_thai', score: 0.9 },
      ],
    };
    const { lib } = fakeLib();
    const d = deps(lib);
    const c = await loadFoodClassifier(model(), d);
    expect(d.loadLib).not.toHaveBeenCalled();
    expect(c.delegate).toBe('CPU');
    expect(c.classify({} as HTMLCanvasElement).categories[0]).toEqual({
      categoryName: 'pad_thai',
      score: 0.9,
    });
    expect(await validateModel(new File(['x'], 'm.tflite'), d)).toEqual({
      ok: true,
      labels: [...CLASS_LABELS],
    });
  });

  it('can fake a mismatch, an unreadable model and a failed load', async () => {
    const { lib } = fakeLib();
    const d = deps(lib);
    g.__gymCleanFakeFoodClassifier = { labels: ['pad_thai'] };
    expect(await validateModel(new File(['x'], 'm.tflite'), d)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
    g.__gymCleanFakeFoodClassifier = { unreadable: true, failLoad: true };
    expect(await validateModel(new File(['x'], 'm.tflite'), d)).toEqual({
      ok: false,
      reason: 'unreadable',
    });
    await expect(loadFoodClassifier(model(), d)).rejects.toThrow(/fake/);
  });

  it('takes a function for per-photo results', async () => {
    g.__gymCleanFakeFoodClassifier = { classify: () => [{ categoryName: 'pad_thai', score: 0.4 }] };
    const { lib } = fakeLib();
    const c = await loadFoodClassifier(model(), deps(lib));
    expect(c.classify({} as HTMLCanvasElement).categories).toEqual([
      { categoryName: 'pad_thai', score: 0.4 },
    ]);
  });
});
