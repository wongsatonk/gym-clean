// M12 slice 1b task 30: Settings → Progress photos (SPEC M12 trainer kit item 8, opt-in).
//
// PRIVACY (hard rule): photos stay on this phone. This file has no network call, no share
// button and no export; the picked file is redrawn on a canvas (≤ 1080 px long edge, which also
// drops EXIF such as the place and time) and handed to the caller as a Blob for the local-only
// store. Off by default: while off, nothing can be added or seen.
//
// - List by date (newest first), add via take / pick (`input type=file accept=image/*`).
// - Compare: tap two photos → side by side, older on the left, each with its date in words.
// - Delete one (two taps) / Delete all (two taps).
//
// Props in, callbacks out; no DB and no speech (never shown in a workout). `createProgressPhotos`
// returns `dispose()` because the default image URLs are object URLs that must be revoked.
//
// e2e hooks: `main[data-screen="progress-photos"]` + `data-state` = off / on,
// `[data-photos-privacy]`, `[data-photos-enable]`, `[data-photo-input=take|pick]`,
// `[data-pose=<pose>]` with aria-checked, `[data-photos-status]`, `[data-photos-empty]`,
// `[data-photo-date=<date>]`, `[data-photo=<id>]` with aria-pressed, `[data-compare]`,
// `[data-compare-side=<id>]`, `[data-compare-clear]`, `[data-photo-delete=<id>]` and
// `[data-photos-delete-all]` (`data-armed` while armed).
import type { ProgressPhoto } from '../../core/types';
import { backButton } from '../backButton';
import { h } from '../dom';
import { icon } from '../icons';
import { iconButton } from '../iconButton';
import { reducedMotion } from '../motion';
import { dueDate } from '../screens/goalCard';
import { mainPill } from '../screens/mainPill';
import { moodClass } from '../tokens';
import './photos.css';

export type PhotoPose = NonNullable<ProgressPhoto['pose']>;

export const PHOTO_POSES: readonly PhotoPose[] = ['front', 'side', 'back'];
export const POSE_LABEL: Record<PhotoPose, string> = { front: 'Front', side: 'Side', back: 'Back' };

/** Long edge of a stored photo, in pixels. */
export const PHOTO_MAX_EDGE = 1080;
export const PHOTO_JPEG_QUALITY = 0.85;
export const DELETE_CONFIRM_MS = 3000;

export const PHOTOS_PRIVACY = 'Stays on this phone. Not in backups.';
export const PHOTOS_COPY = {
  title: 'Progress photos',
  off: 'Off. Turn it on to keep photos here and compare two dates side by side.',
  enable: 'Turn on progress photos',
  take: 'Take photo',
  pick: 'Choose photo',
  pose: 'View for the next photo',
  saving: 'Saving…',
  failed: "Couldn't read that photo. Nothing was saved.",
  empty: 'No photos yet. Same spot, same light and same view make dates easy to compare.',
  compareHint: 'Tap two photos to compare them side by side.',
  compareOne: 'Pick one more photo.',
  compareTitle: 'Side by side',
  clear: 'Clear',
  del: 'Delete',
  delArmed: 'Tap again to delete',
  delAll: 'Delete all photos',
  delAllArmed: 'Tap again to delete all',
} as const;

export type NewProgressPhoto = { blob: Blob; date: string; pose: PhotoPose };

export type ProgressPhotosProps = {
  /** The Settings switch. Off → nothing can be added or seen. */
  enabled: boolean;
  /** Any order; shown newest first. */
  photos: readonly ProgressPhoto[];
  /** Local date YYYY-MM-DD, stamped on a new photo. */
  today: string;
  /** Image URL for a photo. Default: an object URL of its blob (revoked by `dispose`). */
  urlFor?: ((photo: ProgressPhoto) => string) | undefined;
  /** Shrinks a picked file. Default `downscalePhoto` (canvas, ≤ 1080 px, no EXIF). */
  downscale?: ((file: Blob) => Promise<Blob>) | undefined;
  /** How long a Delete stays armed. Default DELETE_CONFIRM_MS. */
  confirmMs?: number | undefined;
};

export type ProgressPhotosActions = {
  onBack: () => void;
  /** "Turn on progress photos" in the off state. Omitted → the off state has no button. */
  onEnable?: (() => void) | undefined;
  /** A new photo, already downscaled: store it (local-only) and render again. */
  onAdd: (photo: NewProgressPhoto) => void | Promise<void>;
  /** Second tap on a photo's Delete. */
  onDelete: (id: string) => void;
  /** Second tap on Delete all photos. */
  onDeleteAll: () => void;
};

export type ProgressPhotosView = { el: HTMLElement; dispose: () => void };

/** Size after fitting the long edge into `max` (never upscales, never below 1 px). */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (!(long > 0)) return { w: 1, h: 1 };
  const k = Math.min(1, max / long);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Newest first: by date, then by when it was added. */
export function sortPhotos(photos: readonly ProgressPhoto[]): ProgressPhoto[] {
  return [...photos].sort(
    (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || b.createdAt - a.createdAt,
  );
}

/** Date groups, newest first. */
export function groupByDate(photos: readonly ProgressPhoto[]): [string, ProgressPhoto[]][] {
  const out = new Map<string, ProgressPhoto[]>();
  for (const p of sortPhotos(photos)) out.set(p.date, [...(out.get(p.date) ?? []), p]);
  return [...out];
}

/** "Progress photo, 3 Nov 2026, front". */
export function photoAlt(p: Pick<ProgressPhoto, 'date' | 'pose'>): string {
  return `Progress photo, ${dueDate(p.date)}${p.pose ? `, ${p.pose}` : ''}`;
}

/** "3 photos" / "1 photo". */
export function photoCount(n: number): string {
  return n === 1 ? '1 photo' : `${n} photos`;
}

type Drawable = { width: number; height: number; source: CanvasImageSource; close?: () => void };

async function decode(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' turns the pixels upright before the EXIF is dropped.
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { width: bmp.width, height: bmp.height, source: bmp, close: () => bmp.close() };
    } catch {
      // Older Safari: no options, or no Blob source. Fall through to <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('image decode failed'));
      img.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, source: img };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Redraws a picked image on a canvas with its long edge ≤ `maxEdge` and returns a JPEG. The
 * redraw keeps only pixels, so EXIF (place, time, device) is gone. Runs on this device only.
 */
export async function downscalePhoto(file: Blob, maxEdge: number = PHOTO_MAX_EDGE): Promise<Blob> {
  const src = await decode(file);
  const { w, h: hh } = fitSize(src.width, src.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(src.source, 0, 0, w, hh);
  src.close?.();
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error('no image data'))),
      'image/jpeg',
      PHOTO_JPEG_QUALITY,
    ),
  );
}

/** A button that needs two taps: the first arms it (words change), it disarms after `ms`. */
function twoTap(o: {
  idle: string;
  armed: string;
  ms: number;
  attrs: Record<string, string | boolean>;
  cls: string;
  aria?: string;
  /** Word beside the circle on a full-width row (Delete all); default under it (one photo). */
  wide?: boolean;
  onConfirm: () => void;
}): { el: HTMLElement; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // M13d task 40c: a round danger iconButton; armed, its circle fills red and the word changes.
  const btn = iconButton({
    icon: 'trash',
    label: o.idle,
    variant: 'danger',
    labelAt: o.wide === true ? 'beside' : 'below',
    wideHit: o.wide === true,
    class: o.cls,
    ...(o.aria !== undefined ? { ariaLabel: o.aria } : {}),
    hooks: o.attrs,
    onClick: () => {},
  });
  // The word is the button's last child (iconButton: circle, then word).
  const label = btn.children[btn.children.length - 1] as HTMLElement;
  const disarm = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    btn.removeAttribute('data-armed');
    label.textContent = o.idle;
    if (o.aria) btn.setAttribute('aria-label', o.aria);
  };
  btn.addEventListener('click', () => {
    if (btn.getAttribute('data-armed') !== null) {
      disarm();
      o.onConfirm();
      return;
    }
    btn.setAttribute('data-armed', 'true');
    label.textContent = o.armed;
    if (o.aria) btn.setAttribute('aria-label', `${o.aria}. ${o.armed}`);
    timer = setTimeout(disarm, o.ms);
  });
  return { el: btn, stop: disarm };
}

export function createProgressPhotos(
  props: ProgressPhotosProps,
  actions: ProgressPhotosActions,
): ProgressPhotosView {
  const ms = props.confirmMs ?? DELETE_CONFIRM_MS;
  const stops: (() => void)[] = [];
  const made: string[] = [];
  const urls = new Map<string, string>();
  const urlFor = (p: ProgressPhoto): string => {
    const hit = urls.get(p.id);
    if (hit !== undefined) return hit;
    let url: string;
    if (props.urlFor) url = props.urlFor(p);
    else {
      url = URL.createObjectURL(p.blob);
      made.push(url);
    }
    urls.set(p.id, url);
    return url;
  };
  const dispose = () => {
    stops.forEach((s) => s());
    made.forEach((u) => URL.revokeObjectURL(u));
    made.length = 0;
    urls.clear();
  };

  const privacy = h(
    'p',
    { class: 'photos-privacy', 'data-photos-privacy': true },
    icon('lock', 'sm'),
    h('span', {}, PHOTOS_PRIVACY),
  );
  const top = h('header', { class: 'top-bar' }, backButton(actions.onBack));
  const deleteAll = () => {
    const t = twoTap({
      idle: PHOTOS_COPY.delAll,
      armed: PHOTOS_COPY.delAllArmed,
      ms,
      cls: 'photos-delete-all',
      attrs: { 'data-photos-delete-all': true },
      wide: true,
      onConfirm: actions.onDeleteAll,
    });
    stops.push(t.stop);
    return t.el;
  };
  const shell = (state: 'off' | 'on', ...children: (HTMLElement | null)[]) =>
    h(
      'main',
      {
        class: `screen progress-photos ${moodClass('pro')}`,
        'data-screen': 'progress-photos',
        'data-state': state,
      },
      top,
      h('h1', { class: 'page-title' }, PHOTOS_COPY.title),
      privacy,
      ...children,
    );

  if (!props.enabled) {
    const kept = props.photos.length;
    return {
      el: shell(
        'off',
        h('p', { class: 'photos-note', 'data-photos-off': true }, PHOTOS_COPY.off),
        actions.onEnable
          ? mainPill({
              icon: 'camera',
              label: PHOTOS_COPY.enable,
              class: 'photos-enable',
              hooks: { 'data-photos-enable': true },
              onClick: () => actions.onEnable?.(),
            })
          : null,
        kept
          ? h(
              'p',
              { class: 'muted photos-note', 'data-photos-kept': true },
              `${photoCount(kept)} kept on this phone while this is off.`,
            )
          : null,
        kept ? deleteAll() : null,
      ),
      dispose,
    };
  }

  // ---------- add ----------
  let pose: PhotoPose = 'front';
  const poseBtns = PHOTO_POSES.map((p) =>
    h(
      'button',
      { type: 'button', class: 'photos-pose', role: 'radio', 'data-pose': p },
      h('span', {}, POSE_LABEL[p]),
    ),
  );
  const paintPose = () =>
    PHOTO_POSES.forEach((p, i) => {
      const b = poseBtns[i];
      if (!b) return;
      const on = p === pose;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('class', on ? 'photos-pose on' : 'photos-pose');
      const label = b.children[b.children.length - 1];
      b.replaceChildren(...(on ? [icon('check', 'sm')] : []), ...(label ? [label] : []));
    });
  PHOTO_POSES.forEach((p, i) =>
    poseBtns[i]?.addEventListener('click', () => {
      pose = p;
      paintPose();
    }),
  );
  paintPose();

  const status = h('p', {
    class: 'photos-status',
    'data-photos-status': true,
    role: 'status',
    'aria-live': 'polite',
  });
  const downscale = props.downscale ?? ((f: Blob) => downscalePhoto(f));
  let busy = false;
  const addFile = async (file: Blob | undefined) => {
    if (!file || busy) return;
    busy = true;
    status.replaceChildren(h('span', {}, PHOTOS_COPY.saving));
    try {
      const blob = await downscale(file);
      await actions.onAdd({ blob, date: props.today, pose });
      status.replaceChildren();
    } catch {
      status.replaceChildren(icon('help', 'sm'), h('span', {}, PHOTOS_COPY.failed));
    } finally {
      busy = false;
    }
  };
  const picker = (kind: 'take' | 'pick') => {
    const input = h('input', {
      type: 'file',
      accept: 'image/*',
      class: 'photos-file',
      'data-photo-input': kind,
      capture: kind === 'take' ? 'environment' : undefined,
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      void addFile(file).then(() => {
        input.value = '';
      });
    });
    return h(
      'label',
      { class: kind === 'take' ? 'photos-add primary' : 'photos-add' },
      icon(kind === 'take' ? 'camera' : 'plus', 'md'),
      h('span', {}, kind === 'take' ? PHOTOS_COPY.take : PHOTOS_COPY.pick),
      input,
    );
  };

  // ---------- compare ----------
  const photos = sortPhotos(props.photos);
  const byId = new Map(photos.map((p) => [p.id, p]));
  /** Picked for compare, oldest pick first (a third pick drops the first). */
  const picked: string[] = [];
  const tiles = new Map<string, { btn: HTMLElement; mark: HTMLElement }>();
  const compare = h('section', {
    class: 'photos-compare',
    'data-compare': true,
    'aria-live': 'polite',
    'aria-label': PHOTOS_COPY.compareTitle,
  });
  const paintCompare = (scroll: boolean) => {
    for (const [id, t] of tiles) {
      const on = picked.includes(id);
      t.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      t.btn.setAttribute('class', on ? 'photo-tile on' : 'photo-tile');
      t.mark.replaceChildren(...(on ? [icon('check', 'sm')] : []));
    }
    const pair = picked
      .map((id) => byId.get(id))
      .filter((p): p is ProgressPhoto => p !== undefined);
    if (pair.length < 2) {
      compare.setAttribute('data-compare', 'hint');
      compare.replaceChildren(
        h(
          'p',
          { class: 'muted photos-note' },
          pair.length === 1 ? PHOTOS_COPY.compareOne : PHOTOS_COPY.compareHint,
        ),
      );
      return;
    }
    // Older on the left, so the eye reads then → now.
    const [a, b] = [...pair].sort(
      (x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0) || x.createdAt - y.createdAt,
    ) as [ProgressPhoto, ProgressPhoto];
    const side = (p: ProgressPhoto) =>
      h(
        'figure',
        { class: 'photos-side', 'data-compare-side': p.id },
        h('img', { src: urlFor(p), alt: photoAlt(p), draggable: 'false' }),
        h(
          'figcaption',
          {},
          h('strong', {}, dueDate(p.date)),
          p.pose ? h('span', { class: 'muted' }, POSE_LABEL[p.pose]) : null,
        ),
      );
    compare.setAttribute('data-compare', 'pair');
    compare.replaceChildren(
      h('h2', { class: 'photos-head' }, PHOTOS_COPY.compareTitle),
      h('div', { class: 'photos-pair' }, side(a), side(b)),
      iconButton({
        icon: 'close',
        label: PHOTOS_COPY.clear,
        class: 'photos-clear',
        hooks: { 'data-compare-clear': true },
        onClick: () => {
          picked.length = 0;
          paintCompare(false);
        },
      }),
    );
    if (scroll)
      (compare as Partial<HTMLElement>).scrollIntoView?.({
        block: 'nearest',
        behavior: reducedMotion() ? 'auto' : 'smooth',
      });
  };

  const tile = (p: ProgressPhoto) => {
    const mark = h('span', { class: 'photo-tile-mark', 'aria-hidden': 'true' });
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'photo-tile',
        'data-photo': p.id,
        'aria-label': `${photoAlt(p)}. Compare`,
        onclick: () => {
          const at = picked.indexOf(p.id);
          if (at >= 0) picked.splice(at, 1);
          else {
            picked.push(p.id);
            if (picked.length > 2) picked.shift();
          }
          paintCompare(at < 0);
        },
      },
      h('img', { src: urlFor(p), alt: '', loading: 'lazy', draggable: 'false' }),
      mark,
    );
    tiles.set(p.id, { btn, mark });
    const del = twoTap({
      idle: PHOTOS_COPY.del,
      armed: PHOTOS_COPY.delArmed,
      ms,
      cls: 'photo-delete',
      attrs: { 'data-photo-delete': p.id },
      aria: `Delete the photo from ${dueDate(p.date)}`,
      onConfirm: () => actions.onDelete(p.id),
    });
    stops.push(del.stop);
    return h(
      'li',
      { class: 'photo-item' },
      btn,
      p.pose ? h('p', { class: 'photo-pose' }, POSE_LABEL[p.pose]) : null,
      del.el,
    );
  };

  const groups = groupByDate(photos).map(([date, list]) => {
    const id = `photos-${date}`;
    return h(
      'section',
      { class: 'photos-group', 'data-photo-date': date, 'aria-labelledby': id },
      h('h2', { class: 'photos-head', id }, dueDate(date)),
      h('ul', { class: 'photo-grid' }, ...list.map(tile)),
    );
  });
  paintCompare(false);

  return {
    el: shell(
      'on',
      h('div', { class: 'photos-add-row' }, picker('take'), picker('pick')),
      h(
        'div',
        { class: 'photos-pose-wrap' },
        h('p', { class: 'photos-pose-label', id: 'photos-pose-h' }, PHOTOS_COPY.pose),
        h(
          'div',
          { class: 'photos-poses', role: 'radiogroup', 'aria-labelledby': 'photos-pose-h' },
          ...poseBtns,
        ),
      ),
      status,
      photos.length >= 2 ? compare : null,
      photos.length
        ? null
        : h('p', { class: 'muted photos-note', 'data-photos-empty': true }, PHOTOS_COPY.empty),
      ...groups,
      photos.length ? deleteAll() : null,
    ),
    dispose,
  };
}
