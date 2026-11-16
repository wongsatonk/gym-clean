// M7b task 14: Settings → Food photos. Props in, callbacks out, no DB: app.ts reads the model
// record, the setting and the photo count, saves each change and shows the Undo toast
// (`showActionToast`) for Remove model / Delete saved photos. The component keeps only what's
// on screen right now: the explainer before "Save photos" turns on, the armed Delete tap, the
// import status and the export status. app.ts calls `update()` after each change it saved.
//
// Privacy: photos never leave the phone unless he exports them himself (share sheet / download).
// Nothing here makes a network call.
//
// Import: the file picker takes a .tflite. Over 25 MB or not .tflite → a message, nothing else
// runs. Otherwise `validateModel(file)` (food-vision, through app.ts) says whether its labels
// match the dish list; only then `onImportModel(file, labels)` stores it.
//
// Export: `loadPhotos()` → `exportFoodPhotos` (src/core/nutrition/photoExport) → a File, shared
// with `navigator.share({ files })` when the browser can share files (iPhone: Save to Files),
// else downloaded. Safari may refuse the share after the async zip build (no user activation
// left); then a "Share the zip" button shares it on the next tap.
//
// e2e hooks: `[data-food-photos]`, `[data-food-model]` (`data-state` none | ready),
// `[data-food-model-import]`, `input[data-food-model-file]`, `[data-food-model-remove]`,
// `[data-food-model-status]` (`data-kind` busy | ok | error), the switch
// `[data-setting="save-food-photos"]`, `[data-food-save-explainer]`, `[data-food-save-on]`,
// `[data-food-save-cancel]`, `[data-food-photo-count]`, `[data-food-photos-export]`,
// `[data-food-photos-share]`, `[data-food-photos-delete]` (`data-armed`),
// `[data-food-photos-status]`.
import type { FoodModelRecord, FoodPhoto, FoodVisionSettings } from '../../core/types';
import { exportFoodPhotos } from '../../core/nutrition/photoExport';
import { h } from '../dom';
import { icon } from '../icons';
import { switchRow } from './settings';
import './foodPhotos.css';

export const MAX_MODEL_BYTES = 25 * 1024 * 1024;
export const DELETE_CONFIRM_MS = 3000;

export const SAVE_PHOTOS_LABEL = 'Save photos to improve recognition';
export const SAVE_EXPLAINER = 'Photos stay on this phone. Only you can export them.';
export const SAVE_EXPLAINER_MORE =
  'Each photo is saved small, labelled with the dish you confirm, to train a better model.';
export const SAVE_OFF_NOTE = 'Saved photos stay until you delete them.';
export const NO_MODEL_TEXT = 'No food model yet.';
export const NO_MODEL_NOTE =
  'Import a model you trained (.tflite). It stays on this phone and works offline.';

/** What app.ts's validator says about a picked model file. */
export type ModelCheck =
  | { ok: true; labels: string[] }
  | { ok: false; reason: 'mismatch' | 'unreadable' };

export type ImportError = 'type' | 'tooBig' | 'mismatch' | 'unreadable' | 'save';

export type FoodModelSummary = Pick<FoodModelRecord, 'name' | 'sizeBytes' | 'labels'>;

export type FoodPhotosProps = {
  /** The imported model, or null. Only name, size and labels are shown. */
  model: FoodModelSummary | null;
  settings: FoodVisionSettings;
  photoCount: number;
  /** Checks a picked .tflite against the dish list (food-vision). */
  validateModel: (file: File) => Promise<ModelCheck>;
  /** All saved photos, read only when he taps Export. */
  loadPhotos: () => Promise<readonly FoodPhoto[]>;
  /** Default Date.now (the zip name uses the local date). */
  now?: (() => number) | undefined;
  /** Test seam: share / download. Default: the real browser. */
  saver?: ZipSaver | undefined;
  confirmMs?: number | undefined;
};

export type FoodPhotosActions = {
  /** A validated model: store it, then `update({ model })`. A throw shows "Couldn't save". */
  onImportModel: (file: File, labels: string[]) => Promise<void> | void;
  /** Remove the model now; app.ts keeps it for its Undo toast. */
  onRemoveModel: () => void;
  /** The switch: true only after the explainer's "Turn on". */
  onSavePhotos: (on: boolean) => void;
  /** Second tap on Delete: delete every saved photo; app.ts keeps them for its Undo toast. */
  onDeletePhotos: () => void;
};

export type FoodPhotosSettings = {
  el: HTMLElement;
  /** New values after app.ts saved a change (or an Undo put something back). */
  update: (next: Partial<Pick<FoodPhotosProps, 'model' | 'settings' | 'photoCount'>>) => void;
};

/** How the zip leaves the phone. */
export type ZipSaver = {
  /** True when `share({ files })` is supported for this file. */
  canShare: (file: File) => boolean;
  share: (file: File) => Promise<void>;
  download: (file: File) => void;
};

export type SaveResult = 'shared' | 'downloaded' | 'cancelled' | 'needsTap';

/** "4.2 MB" (MiB, one decimal; tiny files read "0.1 MB"). */
export function formatModelSize(bytes: number): string {
  const mb = Math.max(0.1, bytes / (1024 * 1024));
  return `${mb.toFixed(1)} MB`;
}

/** "1 dish" / "38 dishes" for the model's label count. */
export function dishCount(n: number): string {
  return n === 1 ? '1 dish' : `${n} dishes`;
}

/** "No saved photos" / "1 saved photo" / "120 saved photos". */
export function photoCountText(n: number): string {
  if (n <= 0) return 'No saved photos';
  return n === 1 ? '1 saved photo' : `${n} saved photos`;
}

export function importErrorText(e: ImportError): string {
  switch (e) {
    case 'type':
      return 'Pick a .tflite model file.';
    case 'tooBig':
      return 'This model is over 25 MB. Pick a smaller one.';
    case 'mismatch':
      return "This model doesn't match the dish list.";
    case 'unreadable':
      return "Couldn't read this model. Nothing changed.";
    case 'save':
      return "Couldn't save the model. Nothing changed.";
  }
}

/** Pre-checks that need no model loading: the file type and the 25 MB cap. */
export function precheckModelFile(file: Pick<File, 'name' | 'size'>): ImportError | null {
  if (!/\.tflite$/i.test(file.name)) return 'type';
  if (file.size > MAX_MODEL_BYTES) return 'tooBig';
  return null;
}

const errName = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';

/** Shares the zip when files can be shared, else downloads it. */
export async function saveZip(file: File, saver: ZipSaver): Promise<SaveResult> {
  if (!saver.canShare(file)) {
    saver.download(file);
    return 'downloaded';
  }
  try {
    await saver.share(file);
    return 'shared';
  } catch (e) {
    const name = errName(e);
    if (name === 'AbortError') return 'cancelled';
    if (name === 'NotAllowedError') return 'needsTap';
    throw e;
  }
}

/** The real browser: Web Share with files, else an object-URL download. */
export function browserZipSaver(): ZipSaver {
  return {
    canShare: (file) =>
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] }),
    share: (file) => navigator.share({ files: [file], title: file.name }),
    download: (file) => {
      const url = URL.createObjectURL(file);
      const a = h('a', { href: url, download: file.name, class: 'food-photos-dl' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };
}

type ImportState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; name: string }
  | { kind: 'error'; error: ImportError };

type ExportState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ready'; file: File }
  | { kind: 'done'; text: string }
  | { kind: 'error' };

export function createFoodPhotosSettings(
  props: FoodPhotosProps,
  actions: FoodPhotosActions,
): FoodPhotosSettings {
  let model = props.model;
  let settings = props.settings;
  let photoCount = props.photoCount;
  let explainer = false;
  let armed = false;
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  let imp: ImportState = { kind: 'idle' };
  let exp: ExportState = { kind: 'idle' };
  const now = props.now ?? Date.now;
  const confirmMs = props.confirmMs ?? DELETE_CONFIRM_MS;
  const saver = () => props.saver ?? browserZipSaver();

  const root = h('div', { class: 'food-photos', 'data-food-photos': true });

  const input = h('input', {
    type: 'file',
    accept: '.tflite',
    class: 'food-model-file',
    'data-food-model-file': true,
    'aria-hidden': 'true',
    tabindex: '-1',
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) void importFile(file);
  });

  async function importFile(file: File): Promise<void> {
    const pre = precheckModelFile(file);
    if (pre) {
      imp = { kind: 'error', error: pre };
      render();
      return;
    }
    imp = { kind: 'busy' };
    render();
    let check: ModelCheck;
    try {
      check = await props.validateModel(file);
    } catch {
      check = { ok: false, reason: 'unreadable' };
    }
    if (!check.ok) {
      imp = { kind: 'error', error: check.reason };
      render();
      return;
    }
    try {
      await actions.onImportModel(file, check.labels);
      imp = { kind: 'ok', name: file.name };
    } catch {
      imp = { kind: 'error', error: 'save' };
    }
    render();
  }

  function disarm(): void {
    if (armTimer !== undefined) clearTimeout(armTimer);
    armTimer = undefined;
    armed = false;
  }

  async function runExport(): Promise<void> {
    exp = { kind: 'busy' };
    render();
    try {
      const photos = await props.loadPhotos();
      const zip = await exportFoodPhotos(photos, now());
      if (!zip) {
        exp = { kind: 'done', text: 'No saved photos to export.' };
      } else {
        const file = new File([zip.bytes as BlobPart], zip.filename, { type: 'application/zip' });
        await finishExport(file, photos.length);
        return;
      }
    } catch {
      exp = { kind: 'error' };
    }
    render();
  }

  async function finishExport(file: File, count: number): Promise<void> {
    try {
      const res = await saveZip(file, saver());
      exp =
        res === 'needsTap'
          ? { kind: 'ready', file }
          : res === 'cancelled'
            ? { kind: 'idle' }
            : { kind: 'done', text: count === 1 ? 'Exported 1 photo.' : `Exported ${count} photos.` };
    } catch {
      exp = { kind: 'error' };
    }
    render();
  }

  function modelBlock(): HTMLElement {
    const status =
      imp.kind === 'idle'
        ? null
        : h(
            'p',
            {
              class: imp.kind === 'error' ? 'set-note food-status error' : 'set-note food-status',
              role: 'status',
              'data-food-model-status': true,
              'data-kind': imp.kind,
            },
            imp.kind === 'busy'
              ? 'Checking the model…'
              : imp.kind === 'ok'
                ? `Model added: ${imp.name}.`
                : importErrorText(imp.error),
          );
    const importBtn = h(
      'button',
      {
        type: 'button',
        class: 'set-action',
        'data-food-model-import': true,
        disabled: imp.kind === 'busy',
        onclick: () => input.click(),
      },
      model ? 'Replace model (.tflite)' : 'Import model (.tflite)',
    );
    return h(
      'div',
      { class: 'food-model', 'data-food-model': true, 'data-state': model ? 'ready' : 'none' },
      model
        ? h(
            'div',
            { class: 'food-model-card' },
            h('p', { class: 'food-model-name' }, model.name),
            h(
              'p',
              { class: 'set-note muted' },
              `${formatModelSize(model.sizeBytes)} · ${dishCount(model.labels.length)}`,
            ),
          )
        : h(
            'div',
            { class: 'food-model-card' },
            h('p', { class: 'food-model-name' }, NO_MODEL_TEXT),
            h('p', { class: 'set-note muted' }, NO_MODEL_NOTE),
          ),
      importBtn,
      model
        ? h(
            'button',
            {
              type: 'button',
              class: 'set-action',
              'data-food-model-remove': true,
              disabled: imp.kind === 'busy',
              onclick: () => {
                imp = { kind: 'idle' };
                actions.onRemoveModel();
              },
            },
            'Remove model',
          )
        : null,
      input,
      status,
    );
  }

  function saveBlock(): HTMLElement {
    const sw = switchRow('save-food-photos', SAVE_PHOTOS_LABEL, settings.savePhotos, (next) => {
      if (next) {
        explainer = true;
        render();
      } else {
        explainer = false;
        actions.onSavePhotos(false);
      }
    });
    if (explainer) sw.setAttribute('aria-expanded', 'true');
    const box = explainer
      ? h(
          'div',
          {
            class: 'food-explainer',
            role: 'group',
            'aria-labelledby': 'food-explainer-q',
            'data-food-save-explainer': true,
          },
          h(
            'p',
            { class: 'food-explainer-q', id: 'food-explainer-q' },
            icon('lock', 'md'),
            h('span', {}, SAVE_EXPLAINER),
          ),
          h('p', { class: 'set-note muted' }, SAVE_EXPLAINER_MORE),
          h(
            'button',
            {
              type: 'button',
              class: 'set-action food-save-on',
              'data-food-save-on': true,
              onclick: () => {
                explainer = false;
                actions.onSavePhotos(true);
              },
            },
            'Turn on',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'set-action',
              'data-food-save-cancel': true,
              onclick: () => {
                explainer = false;
                render();
              },
            },
            'Not now',
          ),
        )
      : null;
    const offNote =
      !settings.savePhotos && !explainer && photoCount > 0
        ? h('p', { class: 'set-note muted' }, SAVE_OFF_NOTE)
        : null;
    return h('div', { class: 'food-save' }, sw, box, offNote);
  }

  function photosBlock(): HTMLElement {
    const count = h(
      'p',
      { class: 'food-photo-count', 'data-food-photo-count': String(photoCount) },
      photoCountText(photoCount),
    );
    if (photoCount <= 0) {
      const done =
        exp.kind === 'done'
          ? h('p', { class: 'set-note food-status', role: 'status' }, exp.text)
          : null;
      return h('div', { class: 'food-photos-list' }, count, done);
    }
    const busy = exp.kind === 'busy';
    const exportBtn =
      exp.kind === 'ready'
        ? h(
            'button',
            {
              type: 'button',
              class: 'set-action',
              'data-food-photos-share': true,
              onclick: () => {
                const file = exp.kind === 'ready' ? exp.file : null;
                if (file) void finishExport(file, photoCount);
              },
            },
            icon('check', 'md'),
            h('span', {}, 'Share the zip'),
          )
        : h(
            'button',
            {
              type: 'button',
              class: 'set-action',
              'data-food-photos-export': true,
              disabled: busy,
              onclick: () => void runExport(),
            },
            busy ? 'Making the zip…' : 'Export photos (.zip)',
          );
    const delLabel = armed ? 'Tap again to delete' : 'Delete saved photos';
    const del = h(
      'button',
      {
        type: 'button',
        class: 'plan-reset food-delete',
        'data-food-photos-delete': true,
        'data-armed': armed,
        disabled: busy,
        onclick: () => {
          if (armed) {
            disarm();
            exp = { kind: 'idle' };
            actions.onDeletePhotos();
            render();
            return;
          }
          armed = true;
          armTimer = setTimeout(() => {
            disarm();
            render();
          }, confirmMs);
          render();
        },
      },
      icon('close', 'md'),
      h('span', {}, delLabel),
    );
    const status =
      exp.kind === 'done' || exp.kind === 'error' || exp.kind === 'ready'
        ? h(
            'p',
            {
              class: exp.kind === 'error' ? 'set-note food-status error' : 'set-note food-status',
              role: 'status',
              'data-food-photos-status': exp.kind,
            },
            exp.kind === 'done'
              ? exp.text
              : exp.kind === 'ready'
                ? 'The zip is ready. Tap to share it.'
                : "Couldn't export. Try again.",
          )
        : null;
    return h('div', { class: 'food-photos-list' }, count, exportBtn, status, del);
  }

  function render(): void {
    root.replaceChildren(
      modelBlock(),
      h('h3', { class: 'food-sub' }, 'Your photos'),
      saveBlock(),
      photosBlock(),
    );
  }

  render();

  return {
    el: root,
    update(next) {
      if (next.model !== undefined) model = next.model;
      if (next.settings !== undefined) settings = next.settings;
      if (next.photoCount !== undefined) {
        if (next.photoCount <= 0) disarm();
        photoCount = next.photoCount;
      }
      render();
    },
  };
}
