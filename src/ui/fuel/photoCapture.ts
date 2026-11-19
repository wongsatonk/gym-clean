// M7b task 12: take or pick a meal photo and shrink it for the food classifier.
// M13c task 15: two ≥ 56px buttons, each over its own hidden file input (the Progress-photos
// pattern): **Take photo** (`capture="environment"`, the iPhone camera opens) and **Choose from
// library** (no `capture`: the iOS photo picker, no Photos permission prompt). Both hand the file
// to the same `onFile`, so a library photo takes exactly the camera path. The photo is decoded the right way up
// (EXIF orientation), drawn to a canvas with a ≤ 512 px long edge, and handed back in memory.
// Nothing is stored or sent from here: a JPEG blob is made only when the caller asks for one
// (save-photos on), and the caller drops the canvas after logging or cancelling.
//
// e2e hooks: `[data-photo-open]` / `[data-photo-input]` (Take photo: button / camera input),
// `[data-photo-library]` / `[data-photo-library-input]` (Choose from library: button / input).
import { h } from '../dom';
import { iconButton } from '../iconButton';
import './photo.css';

/** The classifier's input size: the long edge of the resized photo. */
export const PHOTO_MAX_EDGE = 512;
/** JPEG quality for a saved photo (save-photos on only). */
export const PHOTO_JPEG_QUALITY = 0.85;

/**
 * The size that fits inside `max` × `max`, keeping the aspect ratio. Never upscales; each side is
 * a whole number ≥ 1. Bad input (0, negative, NaN) gives 0 × 0.
 */
export function fitWithin(w: number, h: number, max = PHOTO_MAX_EDGE): { w: number; h: number } {
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return { w: 0, h: 0 };
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  };
}

/** A decoded image with its upright size. `close()` frees it (bitmap) — call once drawn. */
type Decoded = { source: CanvasImageSource; w: number; h: number; close: () => void };

/** What decoding and drawing need from the browser (injected in tests). */
export type PhotoDeps = {
  createImageBitmap?:
    ((file: Blob, opts: { imageOrientation: 'from-image' }) => Promise<ImageBitmap>) | undefined;
  createObjectURL: (file: Blob) => string;
  revokeObjectURL: (url: string) => void;
  /** Loads an `<img>` from a URL (fallback decoder). */
  loadImage: (url: string) => Promise<HTMLImageElement>;
  createCanvas: () => HTMLCanvasElement;
};

function browserDeps(): PhotoDeps {
  const g = globalThis as { createImageBitmap?: PhotoDeps['createImageBitmap'] };
  return {
    createImageBitmap: typeof g.createImageBitmap === 'function' ? g.createImageBitmap : undefined,
    createObjectURL: (f) => URL.createObjectURL(f),
    revokeObjectURL: (u) => URL.revokeObjectURL(u),
    loadImage: (url) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = url;
      }),
    createCanvas: () => document.createElement('canvas'),
  };
}

/**
 * Decodes upright: `createImageBitmap(file, { imageOrientation: 'from-image' })` first, else an
 * `<img>` from an object URL (browsers apply EXIF orientation to images by default). The object
 * URL is revoked once the image has loaded or failed.
 */
async function decode(file: Blob, d: PhotoDeps): Promise<Decoded> {
  if (d.createImageBitmap) {
    try {
      const bmp = await d.createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch {
      // Older Safari: no options bag / format not supported here. Fall back to <img>.
    }
  }
  const url = d.createObjectURL(file);
  try {
    const img = await d.loadImage(url);
    return {
      source: img,
      w: img.naturalWidth || img.width,
      h: img.naturalHeight || img.height,
      close: () => undefined,
    };
  } finally {
    d.revokeObjectURL(url);
  }
}

export type CapturedPhoto = {
  /** The resized photo (long edge ≤ 512 px), ready for the classifier and the sheet preview. */
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** A JPEG (q 0.85) of the resized photo, only when `keepBlob` was asked for. */
  blob?: Blob | undefined;
};

/**
 * File → upright, resized canvas (and a JPEG blob when `keepBlob`). The decoded bitmap is freed
 * before returning; the File itself is never kept. Throws when the photo can't be read (the sheet
 * then shows its error state).
 */
export async function preparePhoto(
  file: Blob,
  opts: { keepBlob: boolean; maxEdge?: number | undefined; deps?: PhotoDeps | undefined },
): Promise<CapturedPhoto> {
  const d = opts.deps ?? browserDeps();
  const img = await decode(file, d);
  try {
    const size = fitWithin(img.w, img.h, opts.maxEdge ?? PHOTO_MAX_EDGE);
    if (size.w === 0) throw new Error('empty image');
    const canvas = d.createCanvas();
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.source, 0, 0, size.w, size.h);
    const out: CapturedPhoto = { canvas, w: size.w, h: size.h };
    if (opts.keepBlob) out.blob = await toJpeg(canvas);
    return out;
  } finally {
    img.close();
  }
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('jpeg encode failed'))),
      'image/jpeg',
      PHOTO_JPEG_QUALITY,
    ),
  );
}

export const PHOTO_TAKE_LABEL = 'Take photo';
export const PHOTO_LIBRARY_LABEL = 'Choose from library';

/**
 * One hidden file input + the visible button that opens it. `onFile` gets the picked file; the
 * input is cleared right after, so the same photo can be picked again and the input doesn't hold
 * on to it.
 */
function picker(o: {
  capture: 'environment' | undefined;
  inputHook: string;
  buttonHook: string;
  iconName: 'camera' | 'plus';
  label: string;
  onFile: (file: File) => void;
}): { btn: HTMLElement; input: HTMLInputElement } {
  const input = h('input', {
    type: 'file',
    accept: 'image/*',
    capture: o.capture,
    class: 'photo-input',
    tabindex: '-1',
    'aria-hidden': 'true',
    [o.inputHook]: true,
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    (input as { value: string }).value = '';
    if (file) o.onFile(file);
  });
  // M13d task 40e: a round button with the word under it (both side by side, photo.css).
  const btn = iconButton({
    icon: o.iconName,
    label: o.label,
    class: 'photo-open',
    hooks: { [o.buttonHook]: true },
    onClick: () => input.click(),
  });
  return { btn, input };
}

/**
 * The Log food photo row: **Take photo** and **Choose from library**, side by side. Both inputs
 * reach the same `onFile` (EXIF-upright decode, ≤ 512 px, recognition, top 3 + confirm happen in
 * the caller, the same for either source).
 */
export function photoButtons(o: { onFile: (file: File) => void }): HTMLElement {
  const take = picker({
    capture: 'environment',
    inputHook: 'data-photo-input',
    buttonHook: 'data-photo-open',
    iconName: 'camera',
    label: PHOTO_TAKE_LABEL,
    onFile: o.onFile,
  });
  const library = picker({
    capture: undefined,
    inputHook: 'data-photo-library-input',
    buttonHook: 'data-photo-library',
    iconName: 'plus',
    label: PHOTO_LIBRARY_LABEL,
    onFile: o.onFile,
  });
  return h('div', { class: 'photo-pick' }, take.btn, library.btn, take.input, library.input);
}
