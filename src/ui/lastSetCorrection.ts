// M4c "Last set" correction for the Rest screen (task 8). Collapsed it is one line,
// "Last set: 9 reps · 1 partial  Fix"; Fix opens two big steppers (reps, partials) + Save.
// It only reports the new numbers through `onCorrect`; app.ts dispatches CORRECT_LAST_SET,
// updates the set row and the developer log.
// M13b: a one-sided set (`sides`) reads "R 12 · L 11" and Fix gets a Right arm / Left arm picker
// above the same two steppers; Save reports each changed side (right first) with its side.

import { FIRST_SIDE, ONE_SIDED_COPY, otherSide } from '../core/exercises/oneSided';
import { lowerSide } from '../core/session';
import type { OneSidedLimb, SideCount, WorkSide } from '../core/types';
import { h } from './dom';
import { sidesAria, sidesLineText, sidesRepsText, type SetSides } from './sidesText';
import './devlog.css';

export const CORRECTION_MAX = 99;

export type LastSetCorrectionOptions = {
  reps: number;
  partials: number;
  /**
   * Called on Save, only when a number changed. One-sided: once per changed side, right first,
   * with that side's numbers (CORRECT_LAST_SET `side`); without `sides`, the set's total.
   */
  onCorrect: (reps: number, partials: number, side?: WorkSide) => void;
  /** M13b: the set's per-side counts (one-sided exercise); omitted for two-sided sets. */
  sides?: SetSides | null | undefined;
  /** M13b: labels the picker "Right arm" / "Right leg"; default 'arm'. */
  limb?: OneSidedLimb | undefined;
  /** Upper bound for both steppers; default 99. */
  max?: number;
  /** M4f: the set was counted by a learning camera rule → one note under the line. */
  learning?: boolean;
};

/** M4f copy (SPEC): shown, never spoken. */
export const LEARNING_FIX_LINE = "Camera still learning. Fix it if it's off.";

export type LastSetCorrectionHandle = {
  el: HTMLElement;
  /** New values from outside (e.g. state re-render); closes the editor. */
  update: (reps: number, partials: number, sides?: SetSides | null) => void;
};

// ---------- pure formatting ----------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "9 reps · 1 partial"; partials are left out when 0 ("9 reps"). */
export function lastSetText(reps: number, partials: number): string {
  return partials > 0
    ? `${plural(reps, 'rep')} · ${plural(partials, 'partial')}`
    : plural(reps, 'rep');
}

export function clampCount(n: number, max = CORRECTION_MAX): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

// ---------- component ----------

let instances = 0;

const SIDES: readonly WorkSide[] = [FIRST_SIDE, otherSide(FIRST_SIDE)];
type Key = WorkSide | 'total';
type Counts = Partial<Record<Key, SideCount>>;

const hasAnySide = (sides: SetSides | null | undefined): sides is SetSides =>
  !!sides && SIDES.some((k) => sides[k] !== undefined);

export function createLastSetCorrection(opts: LastSetCorrectionOptions): LastSetCorrectionHandle {
  const max = opts.max ?? CORRECTION_MAX;
  const copy = ONE_SIDED_COPY[opts.limb ?? 'arm'];
  const clamp = (c: SideCount): SideCount => ({
    reps: clampCount(c.reps, max),
    partials: clampCount(c.partials, max),
  });
  const countsOf = (reps: number, partials: number, sides?: SetSides | null): Counts => {
    if (!hasAnySide(sides)) return { total: clamp({ reps, partials }) };
    const out: Counts = {};
    for (const k of SIDES) {
      const c = sides[k];
      if (c) out[k] = clamp(c);
    }
    return out;
  };
  let saved = countsOf(opts.reps, opts.partials, opts.sides);
  const sided = () => saved.total === undefined;
  const keys = (): Key[] => (sided() ? [...SIDES] : ['total']);
  const zero = (): SideCount => ({ reps: 0, partials: 0 });
  const fill = (c: Counts): Record<string, SideCount> =>
    Object.fromEntries(keys().map((k) => [k, { ...(c[k] ?? zero()) }]));
  let draft = fill(saved);
  let active: Key = sided() ? FIRST_SIDE : 'total';
  let open = false;
  const editorId = `lsc-editor-${++instances}`;

  const summary = h('span', { class: 'lsc-summary', 'data-lsc': 'summary' });
  const fixBtn = h(
    'button',
    {
      class: 'lsc-fix',
      'aria-expanded': 'false',
      'aria-controls': editorId,
      'data-lsc': 'fix',
      onclick: () => setOpen(!open),
    },
    'Fix',
  );

  function stepper(field: 'reps' | 'partials', label: string) {
    const value = h('output', {
      class: 'lsc-value',
      'aria-live': 'polite',
      'data-lsc': `${field}-value`,
    });
    const minus = h(
      'button',
      {
        class: 'lsc-step',
        'aria-label': `${label} minus`,
        'data-lsc': `${field}-minus`,
        onclick: () => bump(field, -1),
      },
      '−',
    );
    const plus = h(
      'button',
      {
        class: 'lsc-step',
        'aria-label': `${label} plus`,
        'data-lsc': `${field}-plus`,
        onclick: () => bump(field, 1),
      },
      '+',
    );
    const row = h(
      'div',
      { class: 'lsc-stepper', role: 'group', 'aria-label': label, 'data-lsc': field },
      h('span', { class: 'lsc-label' }, label),
      h('div', { class: 'lsc-row' }, minus, value, plus),
    );
    return { row, value, minus, plus };
  }

  // M13b: which side the steppers edit (shown only for a one-sided set).
  const sideBtns = SIDES.map((side) =>
    h(
      'button',
      {
        type: 'button',
        class: 'lsc-side',
        'aria-pressed': 'false',
        'data-lsc': `side-${side}`,
        onclick: () => pick(side),
      },
      copy.sideLabel[side],
    ),
  );
  const sidePicker = h(
    'div',
    { class: 'lsc-sides', role: 'group', 'aria-label': 'Side to fix', 'data-lsc': 'sides' },
    ...sideBtns,
  );

  const reps = stepper('reps', 'Reps');
  const partials = stepper('partials', 'Partials');
  const saveBtn = h(
    'button',
    { class: 'lsc-save', 'data-lsc': 'save', onclick: () => onSave() },
    'Save',
  );
  const cancelBtn = h(
    'button',
    { class: 'lsc-cancel', 'data-lsc': 'cancel', onclick: () => close() },
    'Cancel',
  );
  const editor = h(
    'div',
    { class: 'lsc-editor', id: editorId, hidden: true, 'data-lsc': 'editor' },
    sidePicker,
    h('div', { class: 'lsc-steppers' }, reps.row, partials.row),
    h('div', { class: 'lsc-buttons' }, cancelBtn, saveBtn),
  );
  const status = h('p', {
    class: 'lsc-status',
    role: 'status',
    'aria-atomic': 'true',
    'data-lsc': 'status',
  });

  const el = h(
    'section',
    { class: 'lsc', 'aria-label': 'Correct the last set', 'data-lsc': 'panel' },
    h(
      'div',
      { class: 'lsc-line' },
      h('span', { class: 'lsc-prefix' }, 'Last set:'),
      summary,
      fixBtn,
    ),
    opts.learning === true &&
      h('p', { class: 'lsc-learning', 'data-lsc': 'learning' }, LEARNING_FIX_LINE),
    editor,
    status,
  );

  /** The saved numbers as one line: "9 reps · 1 partial" or "R 12 · L 11 · 1 partial". */
  function savedText(): string {
    if (saved.total) return lastSetText(saved.total.reps, saved.total.partials);
    return sidesLineText(saved as SetSides);
  }

  function render(): void {
    const text = savedText();
    if (sided()) {
      // Keep "R 12 · L 11" and "· 1 partial" each whole when the line wraps at 390px.
      const head = sidesRepsText(saved as SetSides);
      const tail = text.slice(head.length);
      summary.replaceChildren(
        h('span', { class: 'lsc-nowrap' }, head),
        ...(tail ? [' ', h('span', { class: 'lsc-nowrap' }, tail.trimStart())] : []),
      );
    } else summary.textContent = text;
    if (sided()) summary.setAttribute('aria-label', sidesAria(saved as SetSides));
    else summary.removeAttribute('aria-label');
    // The set's stored numbers (one-sided: the lower side, what CORRECT_LAST_SET keeps).
    const shown = saved.total ?? lowerSide(saved as SetSides) ?? zero();
    el.dataset.reps = String(shown.reps);
    el.dataset.partials = String(shown.partials);
    const d = draft[active] ?? zero();
    reps.value.textContent = String(d.reps);
    partials.value.textContent = String(d.partials);
    reps.minus.disabled = d.reps <= 0;
    partials.minus.disabled = d.partials <= 0;
    reps.plus.disabled = d.reps >= max;
    partials.plus.disabled = d.partials >= max;
    SIDES.forEach((side, i) => sideBtns[i]?.setAttribute('aria-pressed', String(side === active)));
    sidePicker.hidden = !sided();
    if (sided()) el.dataset.side = active;
    else delete el.dataset.side;
    editor.hidden = !open;
    el.classList.toggle('open', open);
    fixBtn.textContent = open ? 'Close' : 'Fix';
    fixBtn.setAttribute('aria-expanded', String(open));
  }

  function setOpen(next: boolean): void {
    open = next;
    draft = fill(saved);
    active = sided() ? FIRST_SIDE : 'total';
    if (next) status.textContent = '';
    render();
  }

  /** Closes from inside the editor and returns focus to Fix (the focused button is hidden). */
  function close(): void {
    setOpen(false);
    fixBtn.focus();
  }

  function pick(side: WorkSide): void {
    active = side;
    render();
  }

  function bump(field: 'reps' | 'partials', delta: number): void {
    const d = draft[active] ?? zero();
    draft[active] = { ...d, [field]: clampCount(d[field] + delta, max) };
    render();
  }

  function onSave(): void {
    const changed = keys().filter((k) => {
      const was = saved[k] ?? zero();
      const now = draft[k] ?? zero();
      // A side that was never logged is only sent once it has a number.
      if (!saved[k] && now.reps === 0 && now.partials === 0) return false;
      return now.reps !== was.reps || now.partials !== was.partials;
    });
    if (changed.length > 0) {
      const next: Counts = { ...saved };
      for (const k of changed) {
        const now = draft[k] ?? zero();
        next[k] = { ...now };
        if (k === 'total') opts.onCorrect(now.reps, now.partials);
        else opts.onCorrect(now.reps, now.partials, k);
      }
      saved = next;
      status.textContent = `Saved: ${savedText()}`;
    }
    close();
  }

  render();

  return {
    el,
    update: (r, p, sides) => {
      saved = countsOf(r, p, sides);
      setOpen(false);
    },
  };
}
