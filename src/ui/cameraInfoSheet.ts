// M13c goal 4: the Camera sheet. Opened from a "Camera" badge outside a workout (day preview, the
// Library, exercise detail), never during a set. Shown, never spoken: it only explains how the
// camera counts this exercise and where to put the phone, and offers Practice.
//
// Props in, callbacks out: the caller passes `cameraInfo(id)` (src/core/exercises) and the name;
// Practice → `onPractice()` (main opens the camera in practice mode: nothing saved). Close, the
// veil or Escape → `onClose()`. Same bottom-sheet shape as the learn card (src/ui/coach/
// learnCard.ts): veil, role="dialog" + aria-modal, focus on Practice (or Close) when it opens,
// Tab cycles inside, focus goes back to the opener on close. Motion: the panel rises with
// `enterScreen(…, 'up')` (nothing under reduced motion), the veil fade is CSS.
//
// e2e hooks: `[data-camera-sheet]` (= exercise id when given), `[data-camera-title]`,
// `[data-camera-counts]`, `[data-camera-lines]`, `[data-camera-distance]`, `[data-camera-height]`,
// `[data-camera-onesided]`, `[data-camera-learning]`, `[data-camera-practice]`,
// `[data-camera-close]`, `[data-camera-veil]`.
import { ONE_SIDED_COPY, type CameraInfo } from '../core/exercises';
import type { OneSidedLimb } from '../core/types';
import { h } from './dom';
import { installSheetSwipe } from './gestures/sheetSwipe';
import { iconButton } from './iconButton';
import { icon } from './icons';
import { enterScreen, type Stop } from './motion';
import { placementPictogram } from './placementPictogram';
import { moodClass } from './tokens';
import './chromeButtons.css';
import './cameraInfoSheet.css';

export const CAMERA_COUNTS_HEADING = 'What the camera counts';
export const CAMERA_PLACE_HEADING = 'Where to put your phone';
export const PRACTICE_LABEL = 'Practice';
export const PRACTICE_NOTE = 'Nothing is saved.';
export const CLOSE_LABEL = 'Close';
export const LEARNING_NOTE =
  'Still learning: counting is new for this exercise, so it may miss or add a rep. Fix the count on Rest.';

/** "Camera: Goblet Squat". Pure. */
export function cameraSheetTitle(name: string): string {
  return `Camera: ${name}`;
}

/** "2–3 m", "1.5–2.5 m" (one number when both ends match). Pure. */
export function distanceText([min, max]: readonly [number, number]): string {
  return min === max ? `${min} m` : `${min}–${max} m`;
}

/** "Right arm first, then tap Next arm." from the M13b one-sided copy. Pure. */
export function oneSidedLine(limb: OneSidedLimb): string {
  const c = ONE_SIDED_COPY[limb];
  return `${c.sideLabel.right} first, then tap ${c.nextButton}.`;
}

/** Every string the sheet can show for `info` (for copy checks). Pure. */
export function cameraSheetCopy(info: CameraInfo, name: string): string[] {
  return [
    cameraSheetTitle(name),
    CAMERA_COUNTS_HEADING,
    info.counts,
    CAMERA_PLACE_HEADING,
    ...info.lines,
    distanceText(info.distanceM),
    info.heightHint,
    ...(info.oneSided ? [oneSidedLine(info.oneSided)] : []),
    ...(info.learning ? [LEARNING_NOTE] : []),
    PRACTICE_LABEL,
    PRACTICE_NOTE,
    CLOSE_LABEL,
  ];
}

export type CameraInfoActions = {
  /** Display name (`exerciseName(id)`). */
  name: string;
  /** Hook value for `[data-camera-sheet]`; optional. */
  exerciseId?: string | undefined;
  /** Practice: the sheet closes first, then this runs. Omit to hide the button. */
  onPractice?: (() => void) | undefined;
  /** Close, the veil or Escape (not Practice). */
  onClose?: (() => void) | undefined;
};

let sheets = 0;

type Built = { root: HTMLElement; panel: HTMLElement; first: HTMLElement };

type Handlers = { practice: (() => void) | null; close: () => void };

function fact(label: string, value: string, hook: string): HTMLElement {
  return h('div', { class: 'camsheet-fact', [hook]: true }, h('dt', {}, label), h('dd', {}, value));
}

function buildSheet(info: CameraInfo, a: CameraInfoActions, on: Handlers): Built {
  const titleId = `camsheet-title-${++sheets}`;
  // M13d task 40a: Practice = the main round button, Close = a secondary one; both keep the
  // whole row as their tap area (Practice ≥ 72px, Close ≥ 60px, as before).
  const onPractice = on.practice;
  const practice = onPractice
    ? iconButton({
        icon: 'camera',
        label: PRACTICE_LABEL,
        variant: 'main',
        wideHit: true,
        class: 'camsheet-practice chrome-pill',
        hooks: {
          'data-camera-practice': true,
          'aria-describedby': `camsheet-practice-note-${sheets}`,
        },
        onClick: () => onPractice(),
      })
    : null;
  const close = iconButton({
    icon: 'close',
    label: CLOSE_LABEL,
    labelAt: 'beside',
    wideHit: true,
    class: 'camsheet-close chrome-pill',
    hooks: { 'data-camera-close': true },
    onClick: () => on.close(),
  });
  // The body scrolls; Practice and Close stay in view at the bottom of the panel.
  const body = h(
    'div',
    { class: 'camsheet-body' },
    h('p', { class: 'camsheet-eyebrow caps' }, icon('camera', 'sm'), h('span', {}, 'Phone set-up')),
    h(
      'h2',
      { class: 'camsheet-title', id: titleId, 'data-camera-title': true },
      cameraSheetTitle(a.name),
    ),
    h(
      'section',
      { class: 'camsheet-block', 'aria-labelledby': `${titleId}-counts` },
      h('h3', { class: 'camsheet-h', id: `${titleId}-counts` }, CAMERA_COUNTS_HEADING),
      h('p', { class: 'camsheet-counts', 'data-camera-counts': true }, info.counts),
    ),
    h(
      'section',
      { class: 'camsheet-block', 'aria-labelledby': `${titleId}-place` },
      h('h3', { class: 'camsheet-h', id: `${titleId}-place` }, CAMERA_PLACE_HEADING),
      h(
        'div',
        { class: 'camsheet-place' },
        placementPictogram(info.view, 'camsheet-pic'),
        h(
          'dl',
          { class: 'camsheet-facts' },
          fact('Distance', distanceText(info.distanceM), 'data-camera-distance'),
          fact('Height', info.heightHint, 'data-camera-height'),
        ),
      ),
      h(
        'ul',
        { class: 'camsheet-lines', 'data-camera-lines': true },
        ...info.lines.map((l) => h('li', {}, l)),
      ),
    ),
    info.oneSided
      ? h(
          'p',
          { class: 'camsheet-note', 'data-camera-onesided': info.oneSided },
          icon('flip', 'sm'),
          h('span', {}, oneSidedLine(info.oneSided)),
        )
      : null,
    info.learning
      ? h(
          'p',
          { class: 'camsheet-note camsheet-learning', 'data-camera-learning': true },
          icon('trend', 'sm'),
          h('span', {}, LEARNING_NOTE),
        )
      : null,
  );
  const panel = h(
    'div',
    { class: 'camsheet-panel' },
    body,
    h(
      'div',
      { class: 'camsheet-actions' },
      practice,
      practice
        ? h(
            'p',
            { class: 'camsheet-practice-note', id: `camsheet-practice-note-${sheets}` },
            PRACTICE_NOTE,
          )
        : null,
      close,
    ),
  );
  const veil = h('div', {
    class: 'camsheet-veil',
    'data-camera-veil': true,
    'aria-hidden': 'true',
    onclick: on.close,
  });
  const root = h(
    'div',
    {
      class: `camsheet ${moodClass('pro')}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'data-camera-sheet': a.exerciseId ?? true,
    },
    veil,
    panel,
  );
  // M13d task 25: swipe down = Close (the panel follows; a scrolled body scrolls first).
  installSheetSwipe(root, { close: () => close.click(), mover: panel });
  const controls = [practice, close].filter((c): c is HTMLButtonElement => c !== null);
  // Escape closes; Tab / Shift+Tab cycle between the sheet's buttons.
  root.addEventListener('keydown', (ev) => {
    const kev = ev as KeyboardEvent;
    if (kev.key === 'Escape') {
      kev.preventDefault();
      on.close();
    } else if (kev.key === 'Tab') {
      kev.preventDefault();
      const at = controls.indexOf(document.activeElement as HTMLButtonElement);
      const step = kev.shiftKey ? -1 : 1;
      const next = controls[(at + step + controls.length) % controls.length] ?? close;
      next.focus({ preventScroll: true });
    }
  });
  return { root, panel, first: practice ?? close };
}

/** The sheet element (pure render, for tests; `openCameraInfo` mounts it and handles focus). */
export function cameraInfoSheet(info: CameraInfo, a: CameraInfoActions): HTMLElement {
  return buildSheet(info, a, {
    practice: a.onPractice ? () => a.onPractice?.() : null,
    close: () => a.onClose?.(),
  }).root;
}

export type CameraInfoHandle = {
  el: HTMLElement;
  /** Removes the sheet and returns focus to the opener. Safe to call more than once. */
  close: () => void;
};

let current: CameraInfoHandle | null = null;

/**
 * Opens the Camera sheet over the current screen (on document.body, or `parent`) and focuses
 * Practice (Close when there is no Practice). Opening another replaces the open one.
 */
export function openCameraInfo(
  info: CameraInfo,
  actions: CameraInfoActions,
  opener?: HTMLElement | null,
  parent?: HTMLElement,
): CameraInfoHandle {
  current?.close();
  let closed = false;
  let stopMotion: Stop = () => {};
  const finish = (returnFocus: boolean) => {
    if (closed) return false;
    closed = true;
    stopMotion();
    const el = handle.el as Partial<HTMLElement>;
    if (typeof el.remove === 'function') el.remove();
    if (current === handle) current = null;
    if (
      returnFocus &&
      opener &&
      opener.isConnected !== false &&
      typeof opener.focus === 'function'
    ) {
      opener.focus();
    }
    return true;
  };
  const handle: CameraInfoHandle = {
    el: null as unknown as HTMLElement,
    close: () => {
      if (finish(true)) actions.onClose?.();
    },
  };
  const onPractice = actions.onPractice;
  const built = buildSheet(info, actions, {
    // Practice: close quietly (the camera takes over the screen), then hand over.
    practice: onPractice
      ? () => {
          if (finish(false)) onPractice();
        }
      : null,
    close: handle.close,
  });
  handle.el = built.root;
  (parent ?? document.body).append(built.root);
  current = handle;
  stopMotion = enterScreen(built.panel, 'up');
  // preventScroll: the sheet opens at its top (title first), not scrolled to Practice.
  built.first.focus({ preventScroll: true });
  return handle;
}

/** Closes the open Camera sheet, if any (main calls it when a set starts). */
export function closeCameraInfo(): void {
  current?.close();
}

/** True while a Camera sheet is open. */
export function cameraInfoOpen(): boolean {
  return current !== null;
}
