// M7b task 13: the photo confirm sheet. Pure render: the classifier's decision and the Thai dish
// list come in as props, the choice goes out through callbacks. No DB, no classifier call.
// States: "Looking…" → confident (top guess preselected) / unsure (top 3, nothing preselected) /
// no match (search) / error (log by hand). Each guess is a ≥ 56px row with the English and Thai
// name and a small "82%". A class that covers look-alike dishes (pork / chicken / shrimp) shows
// variant chips. Then S / R / L (Regular), the meal, a live kcal / protein preview with the
// "estimate" tag, "None of these: search", and Log. Cancel sits top right; Escape cancels;
// Tab stays inside. A confident guess at Regular logs in 1 tap (Log), at Large in 2.
//
// e2e hooks: dialog `[data-photo-sheet]`, `[data-photo-state=looking|confident|unsure|noMatch|error]`,
// `[data-photo-option=<label>]` (aria-pressed), `[data-photo-pct]`, `[data-photo-variant=<dishId>]`,
// `[data-portion=<Small|Regular|Large>]`, `[data-slot-chip=<slot>]`, `[data-preview]`,
// `[data-photo-search]`, `[data-photo-log]`. M13d task 40e: Log (and Search for it / Log by hand
// when they are the way on) is the main round pill, "None of these: search" a second pill.
import { THAI_PORTIONS } from '../../core/nutrition/portions';
import type { MacroSet, MealSlot, NutritionMode } from '../../core/types';
import { h } from '../dom';
import { appendAll, clear, estimateTag, macroLine, sheetShell } from './common';
import { slotChips } from './entrySheet';
import { fuelMain, saveRow, secondPill } from './fuelButtons';
import { scaleItem, type LogItem } from './logSheet';
import './photo.css';

/**
 * One guess from the classifier, as `decide()` gives it (src/food-vision/decide.ts, ml-engineer):
 * the classifier label, the dish ids it covers (the first is the default) and its score (0–1).
 */
export type PhotoOption = { label: string; dishIds: readonly string[]; score: number };

/**
 * `decide()`'s result (src/food-vision/decide.ts `Decision`, task 7), restated here so src/ui
 * doesn't depend on food-vision; photoSheet.test.ts checks `Decision` is assignable to it.
 * `preselect` is the default dish id (a class label also works). `offerClaude` is read by
 * nothing here (no Claude control in the local part).
 */
export type PhotoDecision = {
  kind: 'confident' | 'unsure' | 'noMatch';
  options: readonly PhotoOption[];
  preselect?: string | undefined;
  offerClaude?: boolean | undefined;
};

export type PhotoSheetState =
  { status: 'looking' } | { status: 'result'; decision: PhotoDecision } | { status: 'error' };

export type PhotoSheetProps = {
  mode: NutritionMode;
  /** The slot the entry gets (core `slotFor`); changeable here. */
  slot: MealSlot;
  /** The Thai dishes (the log sheet's Thai items). Matched by `ref.foodId`, else `key`. */
  dishes: readonly LogItem[];
  state: PhotoSheetState;
  /** A small preview of the photo (the classifier's canvas). Shown only; never stored. */
  photo?: HTMLElement | undefined;
  /** Macros for a portion. Default: `scaleItem` (core portion scaling). */
  preview?: ((item: LogItem, factor: number) => MacroSet) | undefined;
};

export type PhotoChoice = {
  dishId: string;
  item: LogItem;
  portion: { label: string; factor: number };
  slot: MealSlot;
  macros: MacroSet;
  /** The picked guess's score; the controller passes it to `entryFromPhoto`. */
  confidence: number;
  /** The classifier label of the picked guess. */
  label: string;
};

export type PhotoSheetActions = {
  onLog: (choice: PhotoChoice) => void;
  /** "None of these: search" (and "Log by hand" on error / no match): open the log-sheet search. */
  onSearch: () => void;
  onCancel: () => void;
};

export type PhotoSheet = HTMLElement & {
  setState: (s: PhotoSheetState) => void;
  /** The picked dish id, or null (tests). */
  selected: () => string | null;
};

/** "82%" (whole percent, 0–100). */
export function pctText(score: number): string {
  const n = Number.isFinite(score) ? Math.round(Math.min(1, Math.max(0, score)) * 100) : 0;
  return `${n}%`;
}

type Shown = { opt: PhotoOption; items: LogItem[] };

const dishId = (i: LogItem): string => i.ref.foodId ?? i.key;

export function photoSheet(p: PhotoSheetProps, a: PhotoSheetActions): PhotoSheet {
  const byId = new Map(p.dishes.map((d) => [dishId(d), d] as const));
  const preview = p.preview ?? ((item: LogItem, f: number) => scaleItem(item, { servings: 1 }, f));
  let state = p.state;
  let shown: Shown[] = [];
  let optAt = -1;
  let variantAt = 0;
  let portion = THAI_PORTIONS.find((x) => x.factor === 1) ?? THAI_PORTIONS[0];
  let slot = p.slot;

  const shell = sheetShell({
    title: 'Log from a photo',
    key: 'photo-sheet',
    closeLabel: 'Cancel',
    onClose: a.onCancel,
  });
  const panel = h('div', { class: 'photo-panel', 'aria-live': 'polite' });
  shell.body.append(panel);

  const current = (): LogItem | null => shown[optAt]?.items[variantAt] ?? null;

  /** Options with the dishes we know; unknown dish ids and empty classes are left out. */
  function resolve(d: PhotoDecision): Shown[] {
    const out: Shown[] = [];
    for (const opt of d.options.slice(0, 3)) {
      const items = opt.dishIds.map((id) => byId.get(id)).filter((x): x is LogItem => !!x);
      if (items.length > 0) out.push({ opt, items });
    }
    return out;
  }

  function preselected(d: PhotoDecision): { opt: number; variant: number } {
    if (d.kind !== 'confident' || d.preselect === undefined) return { opt: -1, variant: 0 };
    const pre = d.preselect;
    for (let i = 0; i < shown.length; i++) {
      const s = shown[i];
      if (!s) continue;
      if (s.opt.label === pre) return { opt: i, variant: 0 };
      const v = s.items.findIndex((it) => dishId(it) === pre);
      if (v >= 0) return { opt: i, variant: v };
    }
    return { opt: -1, variant: 0 };
  }

  // M13d task 40e: the main pill when searching is the way on, else a second pill.
  const searchBtn = (text: string, primary = false, iconName: 'search' | 'pencil' = 'search') => {
    const p = {
      icon: iconName,
      label: text,
      hooks: { 'data-photo-search': true },
      onClick: () => a.onSearch(),
    };
    return primary ? saveRow(fuelMain(p)) : secondPill(p);
  };

  const thumb = (): HTMLElement | null =>
    p.photo ? h('div', { class: 'photo-thumb', 'aria-hidden': 'true' }, p.photo) : null;

  function optionRow(s: Shown, i: number): HTMLElement {
    const on = i === optAt;
    const first = s.items[0];
    return h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: on ? 'photo-opt on' : 'photo-opt',
          'aria-pressed': on ? 'true' : 'false',
          'data-photo-option': s.opt.label,
          onclick: () => {
            if (optAt !== i) variantAt = 0;
            optAt = i;
            render();
            refocus('data-photo-option', s.opt.label);
          },
        },
        h(
          'span',
          { class: 'photo-opt-top' },
          h('span', { class: 'photo-opt-name' }, first?.label ?? s.opt.label),
          h('span', { class: 'photo-pct', 'data-photo-pct': true }, pctText(s.opt.score)),
        ),
        first?.nameTh ? h('span', { class: 'log-item-th', lang: 'th' }, first.nameTh) : null,
      ),
    );
  }

  function chips<T>(
    list: readonly T[],
    text: (t: T) => string,
    attr: string,
    val: (t: T) => string,
    isOn: (i: number) => boolean,
    onPick: (i: number) => void,
    aria: string,
    wide = false,
  ): HTMLElement {
    const base = wide ? 'fuel-chip photo-variant' : 'fuel-chip';
    return h(
      'div',
      {
        class: wide ? 'fuel-chips photo-variants' : 'fuel-chips',
        role: 'group',
        'aria-label': aria,
      },
      ...list.map((t, i) =>
        h(
          'button',
          {
            type: 'button',
            class: isOn(i) ? `${base} on` : base,
            'aria-pressed': isOn(i) ? 'true' : 'false',
            [attr]: val(t),
            onclick: () => {
              onPick(i);
              render();
              refocus(attr, val(t));
            },
          },
          text(t),
        ),
      ),
    );
  }

  function resultPanel(d: PhotoDecision): HTMLElement {
    const kind = shown.length === 0 ? 'noMatch' : d.kind === 'noMatch' ? 'noMatch' : d.kind;
    const wrap = h('section', { class: 'photo-result', 'data-photo-state': kind });
    if (kind === 'noMatch') {
      appendAll(
        wrap,
        thumb(),
        h('p', { class: 'photo-msg' }, 'No dish matched this photo.'),
        searchBtn('Search for it', true),
      );
      return wrap;
    }
    appendAll(
      wrap,
      thumb(),
      h(
        'p',
        { class: 'photo-msg' },
        kind === 'confident' ? 'Looks like this. Check it.' : 'Not sure. Pick one or search.',
      ),
      h('ul', { class: 'photo-opts', 'aria-label': 'Best guesses' }, ...shown.map(optionRow)),
    );
    const sel = shown[optAt];
    const item = current();
    if (sel && sel.items.length > 1) {
      wrap.append(
        h('p', { class: 'fuel-label' }, 'Which one'),
        chips(
          sel.items,
          (it) => it.label,
          'data-photo-variant',
          dishId,
          (i) => i === variantAt,
          (i) => {
            variantAt = i;
          },
          'Which one',
          true,
        ),
      );
    }
    if (item) {
      wrap.append(
        h('p', { class: 'fuel-label' }, 'Plate size'),
        chips(
          item.portions ?? THAI_PORTIONS,
          (x) => x.label,
          'data-portion',
          (x) => x.label,
          (i) => (item.portions ?? THAI_PORTIONS)[i]?.label === portion?.label,
          (i) => {
            portion = (item.portions ?? THAI_PORTIONS)[i] ?? portion;
          },
          'Plate size',
        ),
        h(
          'p',
          { class: 'fuel-preview photo-preview', 'data-preview': true },
          h('span', {}, macroLine(preview(item, portion?.factor ?? 1), p.mode)),
          ' ',
          estimateTag(),
        ),
      );
    }
    const log = fuelMain({
      icon: 'check',
      label: 'Log',
      class: 'photo-log',
      hooks: { 'data-photo-log': true },
      disabled: !item,
      onClick: () => {
        const it = current();
        const s = shown[optAt];
        if (!it || !s || !portion) return;
        a.onLog({
          dishId: dishId(it),
          item: it,
          portion,
          slot,
          macros: preview(it, portion.factor),
          confidence: s.opt.score,
          label: s.opt.label,
        });
      },
    });
    appendAll(
      wrap,
      h('p', { class: 'fuel-label' }, 'Meal'),
      slotChips(slot, (s) => {
        slot = s;
      }),
      item
        ? null
        : h('p', { class: 'fuel-hint', 'data-photo-pick-hint': true }, 'Pick a dish first.'),
      saveRow(log),
      searchBtn('None of these: search'),
    );
    return wrap;
  }

  /** A tap re-renders the panel: put focus back on the control that was tapped. */
  function refocus(attr: string, value: string): void {
    if (typeof panel.querySelectorAll !== 'function') return;
    for (const b of panel.querySelectorAll<HTMLElement>(`[${attr}]`)) {
      if (b.getAttribute(attr) === value) {
        b.focus();
        return;
      }
    }
  }

  function render(): void {
    clear(panel);
    if (state.status === 'looking') {
      panel.setAttribute('aria-busy', 'true');
      appendAll(
        panel,
        h(
          'section',
          { class: 'photo-result', 'data-photo-state': 'looking' },
          thumb(),
          h('p', { class: 'photo-msg' }, 'Looking…'),
        ),
      );
      return;
    }
    panel.removeAttribute('aria-busy');
    if (state.status === 'error') {
      panel.append(
        h(
          'section',
          { class: 'photo-result', 'data-photo-state': 'error' },
          h('p', { class: 'fuel-note photo-msg' }, 'Couldn’t read the photo. Log it by hand.'),
          searchBtn('Log by hand', true, 'pencil'),
        ),
      );
      return;
    }
    panel.append(resultPanel(state.decision));
  }

  function setState(s: PhotoSheetState): void {
    state = s;
    if (s.status === 'result') {
      shown = resolve(s.decision);
      const pre = preselected(s.decision);
      optAt = pre.opt;
      variantAt = pre.variant;
    } else {
      shown = [];
      optAt = -1;
      variantAt = 0;
    }
    render();
  }

  setState(state);
  const el = Object.assign(shell.el, {
    setState,
    selected: () => {
      const it = current();
      return it ? dishId(it) : null;
    },
  });
  return el as PhotoSheet;
}
