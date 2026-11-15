// M7 Log sheet (task 12, SPEC M7 "Food sources"). Pure render: lists and callbacks in, no DB.
// A row of section buttons in SPEC order (Favorites & recent, My recipes, Thai dishes, Quick
// estimate, Search, My foods) switches the one visible section, so a favorite is open → item →
// Log (3 taps). Tapping an item opens its detail: S/R/L chips (Thai dishes), household measures
// (database foods), a portion stepper (0.5 servings or 10 g), the meal slot, a live preview, Log.
// The seed Protein shake (`needsLabel`, M7-q4) asks for the label numbers before it can be logged.
// Search results come back through `setSearch` (loading / offline / results). Escape goes back
// from a detail, else closes; Tab stays inside (focus trap).
//
// e2e hooks: dialog `[data-log-sheet]`, `[data-log-section=<id>]` buttons (aria-pressed),
// `[data-section-panel=<id>]`, `[data-log-item=<key>]`, `[data-portion=<label>]`,
// `[data-stepper=portion]`, `[data-slot-chip=<slot>]`, `[data-log-confirm]`, `[data-quick-*]`.
import { scaleFood } from '../../core/nutrition/portions';
import type { Food, FoodAmount, MacroSet, MealSlot, NutritionMode } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import {
  appendAll,
  clear,
  estimateTag,
  field,
  fmtNum,
  inputValue,
  macroLine,
  parseNum,
  sheetShell,
  stepper,
} from './common';
import { GRAM_STEP, SERVING_STEP, slotChips } from './entrySheet';

export type LogSection = 'favorites' | 'recipes' | 'thai' | 'quick' | 'search' | 'myFoods';

/** SPEC order. Short labels on the buttons; the full name heads the section. */
export const LOG_SECTIONS: readonly { id: LogSection; label: string; title: string }[] = [
  { id: 'favorites', label: 'Favorites', title: 'Favorites & recent' },
  { id: 'recipes', label: 'Recipes', title: 'My recipes' },
  { id: 'thai', label: 'Thai', title: 'Thai dishes' },
  { id: 'quick', label: 'Quick', title: 'Quick estimate' },
  { id: 'search', label: 'Search', title: 'Search foods' },
  { id: 'myFoods', label: 'My foods', title: 'My foods' },
];

/** Something that can be logged. Macros are per 1 serving, or per 100 g when `per` is '100g'. */
export type LogItem = {
  /** Unique within the sheet. */
  key: string;
  label: string;
  nameTh?: string | undefined;
  macros: MacroSet;
  per: 'serving' | '100g';
  /** e.g. Small 0.75 / Regular 1 / Large 1.4 (Thai dishes). */
  portions?: readonly { label: string; factor: number }[] | undefined;
  /** Household measures for gram foods ("1 cup", 240 g). */
  measures?: readonly { label: string; g: number }[] | undefined;
  /** Starting amount: servings (default 1) or grams (default 100). */
  defaultAmount?: number | undefined;
  /** Rough numbers (quick estimates, Thai dish estimates). */
  estimate?: boolean | undefined;
  /** M7-q4: placeholder values; ask for the label numbers before logging. */
  needsLabel?: boolean | undefined;
  /** "Recent" or "Favorite" on the Favorites list. */
  badge?: 'favorite' | 'recent' | undefined;
  /** Recipes and my foods can be edited from their detail. */
  editable?: boolean | undefined;
  ref: { foodId?: string; recipeId?: string };
};

export type QuickPreset = {
  label: string;
  kcal: number;
  proteinG: number;
  carbsG?: number;
  fatG?: number;
};

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'offline' }
  | { status: 'results'; query: string; items: readonly LogItem[] };

export type LogSheetProps = {
  mode: NutritionMode;
  /** The slot new entries get (core `slotFor(now, lastSessionEnd)`); changeable per log. */
  slot: MealSlot;
  favorites: readonly LogItem[];
  recipes: readonly LogItem[];
  thai: readonly LogItem[];
  myFoods: readonly LogItem[];
  /** M7-q3 Light / Regular / Big plate starters. */
  presets: readonly QuickPreset[];
  initialSection?: LogSection | undefined;
  /** Macros for an amount (core portion scaling). Default: `scaleItem`. */
  preview?: ((item: LogItem, amount: FoodAmount, factor: number) => MacroSet) | undefined;
};

export type LogChoice = {
  item: LogItem;
  amount: FoodAmount;
  /** The S/R/L portion picked, if any. */
  portion?: { label: string; factor: number } | undefined;
  slot: MealSlot;
  macros: MacroSet;
};

export type QuickLog = { name: string; macros: MacroSet; slot: MealSlot; saveFavorite: boolean };

export type LogSheetActions = {
  onLog: (choice: LogChoice) => void;
  onQuickLog: (q: QuickLog) => void;
  /** Typing in Search (the app debounces and calls `setSearch`). */
  onSearch: (query: string) => void;
  onNewRecipe: () => void;
  onNewFood: () => void;
  /** Edit a recipe / my food, or enter the Protein shake's label numbers. */
  onEditItem: (item: LogItem) => void;
  onClose: () => void;
};

export type LogSheet = HTMLElement & {
  setSearch: (s: SearchState) => void;
  /** The section on show (tests). */
  section: () => LogSection;
};

/** The item as a core `Food` (only what `scaleFood` reads: macros and the basis). */
function asFood(item: LogItem): Food {
  return {
    ...item.macros,
    id: item.key,
    name: item.label,
    source: 'custom',
    basis: item.per === '100g' ? { per100g: true } : { servingLabel: 'serving' },
  };
}

/**
 * Default preview: core `scaleFood` (src/core/nutrition/portions.ts) on the item's base macros.
 * An amount core can't convert (grams on a serving-only item) previews as 0, never NaN.
 */
export function scaleItem(item: LogItem, amount: FoodAmount, factor = 1): MacroSet {
  return scaleFood(asFood(item), amount, factor) ?? { kcal: 0, proteinG: 0 };
}

/** "1 serving · 320 kcal · 25 g protein" / "per 100 g · …" */
function baseLine(item: LogItem, mode: NutritionMode): string {
  return `${item.per === '100g' ? 'per 100 g' : '1 serving'} · ${macroLine(item.macros, mode)}`;
}

function itemButton(item: LogItem, mode: NutritionMode, onPick: (i: LogItem) => void): HTMLElement {
  return h(
    'li',
    {},
    h(
      'button',
      { type: 'button', class: 'log-item', 'data-log-item': item.key, onclick: () => onPick(item) },
      h(
        'span',
        { class: 'log-item-name' },
        h('span', {}, item.label),
        item.badge
          ? h('span', { class: 'fuel-tag' }, item.badge === 'recent' ? 'recent' : 'favorite')
          : null,
        item.estimate ? estimateTag() : null,
      ),
      item.nameTh ? h('span', { class: 'log-item-th', lang: 'th' }, item.nameTh) : null,
      h('span', { class: 'log-item-sub' }, baseLine(item, mode)),
    ),
  );
}

function itemList(
  items: readonly LogItem[],
  mode: NutritionMode,
  onPick: (i: LogItem) => void,
  empty: string,
): HTMLElement {
  if (items.length === 0) return h('p', { class: 'muted fuel-empty' }, empty);
  return h('ul', { class: 'log-list' }, ...items.map((i) => itemButton(i, mode, onPick)));
}

export function logSheet(p: LogSheetProps, a: LogSheetActions): LogSheet {
  let section: LogSection = p.initialSection ?? 'favorites';
  let detail: LogItem | null = null;
  let search: SearchState = { status: 'idle' };
  let query = '';
  const preview = p.preview ?? scaleItem;

  const shell = sheetShell({
    title: 'Log food',
    key: 'log-sheet',
    closeLabel: 'Close',
    onClose: a.onClose,
    onEscape: () => {
      if (detail) back();
      else a.onClose();
    },
  });

  const tabs = LOG_SECTIONS.map((s) =>
    h(
      'button',
      {
        type: 'button',
        class: 'log-sec-btn',
        'data-log-section': s.id,
        onclick: () => {
          section = s.id;
          detail = null;
          render();
        },
      },
      s.label,
    ),
  );
  const nav = h('div', { class: 'log-secs', role: 'group', 'aria-label': 'Food sources' }, ...tabs);
  const panel = h('div', { class: 'log-panel' });
  shell.body.append(nav, panel);

  /** Detail → list. The detail (and the focused control) is gone: focus stays in the sheet. */
  function back(): void {
    detail = null;
    render();
    shell.el.focus?.();
  }

  const pick = (item: LogItem) => {
    detail = item;
    render();
  };

  // ---- search results area (kept across setSearch calls) ----
  const results = h('div', {
    class: 'log-results',
    'aria-live': 'polite',
    'data-search-results': true,
  });
  const paintResults = () => {
    clear(results);
    if (search.status === 'loading') {
      results.append(
        h(
          'p',
          { class: 'muted fuel-empty', 'data-search-state': 'loading', 'aria-busy': 'true' },
          'Loading the food list…',
        ),
      );
    } else if (search.status === 'offline') {
      results.append(
        h(
          'p',
          { class: 'fuel-note', 'data-search-state': 'offline' },
          'The food list isn’t on this phone yet. Connect once and it stays for offline use.',
        ),
      );
    } else if (search.status === 'results') {
      results.append(
        search.items.length === 0
          ? h(
              'p',
              { class: 'muted fuel-empty', 'data-search-state': 'empty' },
              `No matches for “${search.query}”.`,
            )
          : itemList(search.items, p.mode, pick, ''),
      );
    }
  };

  function sectionPanel(): HTMLElement {
    const meta = LOG_SECTIONS.find((s) => s.id === section) ?? LOG_SECTIONS[0];
    const head = h('h2', { class: 'fuel-h2' }, meta?.title ?? '');
    const wrap = h('section', { class: 'log-section', 'data-section-panel': section }, head);
    switch (section) {
      case 'favorites':
        wrap.append(itemList(p.favorites, p.mode, pick, 'Foods you log show up here.'));
        break;
      case 'recipes':
        wrap.append(
          h(
            'button',
            {
              type: 'button',
              class: 'fuel-secondary',
              'data-new-recipe': true,
              onclick: () => a.onNewRecipe(),
            },
            icon('plus', 'md'),
            h('span', {}, 'New recipe'),
          ),
          itemList(p.recipes, p.mode, pick, 'No recipes yet.'),
        );
        break;
      case 'thai':
        wrap.append(itemList(p.thai, p.mode, pick, 'No dishes.'));
        break;
      case 'quick':
        wrap.append(quickForm());
        break;
      case 'search': {
        const f = field({
          id: 'log-search',
          label: 'Search foods',
          type: 'search',
          value: query,
          onInput: (v) => {
            query = v;
            a.onSearch(v);
          },
        });
        wrap.append(f.wrap, results);
        paintResults();
        break;
      }
      case 'myFoods':
        wrap.append(
          h(
            'button',
            {
              type: 'button',
              class: 'fuel-secondary',
              'data-new-food': true,
              onclick: () => a.onNewFood(),
            },
            icon('plus', 'md'),
            h('span', {}, 'New food'),
          ),
          itemList(p.myFoods, p.mode, pick, 'No foods of your own yet.'),
        );
        break;
    }
    return wrap;
  }

  function quickForm(): HTMLElement {
    let slot = p.slot;
    let saveFavorite = false;
    const name = field({
      id: 'quick-name',
      label: 'Name',
      hint: 'e.g. Thai place near work, pad see ew',
    });
    const kcal = field({ id: 'quick-kcal', label: 'Calories (kcal)', numeric: true });
    const protein = field({ id: 'quick-protein', label: 'Protein (g)', numeric: true });
    const carbs =
      p.mode === 'full'
        ? field({ id: 'quick-carbs', label: 'Carbs (g), optional', numeric: true })
        : null;
    const fat =
      p.mode === 'full'
        ? field({ id: 'quick-fat', label: 'Fat (g), optional', numeric: true })
        : null;
    const setVal = (input: HTMLInputElement, v: number | undefined) => {
      (input as { value: string }).value = v === undefined ? '' : String(v);
    };
    const presets = h(
      'div',
      { class: 'fuel-chips', role: 'group', 'aria-label': 'Plate size starters' },
      ...p.presets.map((pr) =>
        h(
          'button',
          {
            type: 'button',
            class: 'fuel-chip',
            'data-quick-preset': pr.label,
            onclick: () => {
              setVal(kcal.input, pr.kcal);
              setVal(protein.input, pr.proteinG);
              if (carbs) setVal(carbs.input, pr.carbsG);
              if (fat) setVal(fat.input, pr.fatG);
            },
          },
          pr.label,
        ),
      ),
    );
    const favState = h('span', { class: 'switch-state', 'aria-hidden': 'true' }, 'Off');
    const fav = h(
      'button',
      {
        type: 'button',
        class: 'switch-btn',
        role: 'switch',
        'aria-checked': 'false',
        'data-quick-favorite': true,
      },
      h('span', { class: 'switch-label' }, 'Save as favorite'),
      favState,
    );
    fav.addEventListener('click', () => {
      saveFavorite = !saveFavorite;
      fav.setAttribute('aria-checked', saveFavorite ? 'true' : 'false');
      fav.setAttribute('class', saveFavorite ? 'switch-btn on' : 'switch-btn');
      favState.textContent = saveFavorite ? 'On' : 'Off';
    });
    const submit = h(
      'button',
      { type: 'button', class: 'primary-btn cta-btn', 'data-quick-log': true },
      icon('check', 'lg'),
      'Log',
    );
    submit.addEventListener('click', () => {
      const k = parseNum(inputValue(kcal.input));
      const pr = parseNum(inputValue(protein.input));
      kcal.error.textContent = k === null ? 'Enter the calories. A guess is fine.' : '';
      protein.error.textContent = pr === null ? 'Enter the protein. A guess is fine.' : '';
      if (k === null || pr === null) {
        (k === null ? kcal.input : protein.input).focus();
        return;
      }
      const macros: MacroSet = { kcal: Math.round(k), proteinG: pr };
      const c = carbs ? parseNum(inputValue(carbs.input)) : null;
      const f = fat ? parseNum(inputValue(fat.input)) : null;
      if (c !== null) macros.carbsG = c;
      if (f !== null) macros.fatG = f;
      a.onQuickLog({
        name: inputValue(name.input) || 'Quick estimate',
        macros,
        slot,
        saveFavorite,
      });
    });
    return h(
      'div',
      { class: 'log-quick', 'data-quick-form': true },
      name.wrap,
      h('p', { class: 'fuel-label' }, 'Plate size'),
      h('p', { class: 'fuel-hint' }, 'Fills in typical numbers. Change them to fit your plate.'),
      presets,
      kcal.wrap,
      protein.wrap,
      carbs?.wrap ?? null,
      fat?.wrap ?? null,
      h('p', { class: 'fuel-label' }, 'Meal'),
      slotChips(slot, (s) => {
        slot = s;
      }),
      fav,
      submit,
    );
  }

  function detailPanel(item: LogItem): HTMLElement {
    const grams = item.per === '100g';
    let portion = item.portions?.find((x) => x.factor === 1) ?? item.portions?.[0];
    let amount = item.defaultAmount ?? (grams ? (item.measures?.[0]?.g ?? 100) : 1);
    let slot = p.slot;
    const toAmount = (): FoodAmount => (grams ? { grams: amount } : { servings: amount });
    const out = h('p', { class: 'fuel-preview', 'aria-live': 'polite', 'data-preview': true });
    const paint = () => {
      out.textContent = macroLine(preview(item, toAmount(), portion?.factor ?? 1), p.mode);
    };
    const step = stepper({
      label: 'Portion',
      key: 'portion',
      value: amount,
      step: grams ? GRAM_STEP : SERVING_STEP,
      min: grams ? GRAM_STEP : SERVING_STEP,
      unit: (v) => (grams ? 'g' : v === 1 ? 'serving' : 'servings'),
      onChange: (v) => {
        amount = v;
        paint();
      },
    });
    const chipRow = (
      labels: readonly string[],
      isOn: (i: number) => boolean,
      onPick: (i: number) => void,
      aria: string,
    ) => {
      const btns = labels.map((l, i) =>
        h(
          'button',
          {
            type: 'button',
            class: isOn(i) ? 'fuel-chip on' : 'fuel-chip',
            'aria-pressed': isOn(i) ? 'true' : 'false',
            'data-portion': l,
          },
          l,
        ),
      );
      btns.forEach((b, i) =>
        b.addEventListener('click', () => {
          onPick(i);
          btns.forEach((o, j) => {
            o.setAttribute('class', j === i ? 'fuel-chip on' : 'fuel-chip');
            o.setAttribute('aria-pressed', j === i ? 'true' : 'false');
          });
          paint();
        }),
      );
      return h('div', { class: 'fuel-chips', role: 'group', 'aria-label': aria }, ...btns);
    };
    paint();
    const wrap = h(
      'section',
      { class: 'log-detail', 'data-log-detail': item.key, 'aria-labelledby': 'log-detail-name' },
      h(
        'button',
        {
          type: 'button',
          class: 'fuel-back',
          'data-log-back': true,
          onclick: () => back(),
        },
        icon('back', 'md'),
        h('span', {}, 'Back'),
      ),
      h('h2', { class: 'log-detail-name', id: 'log-detail-name', tabindex: '-1' }, item.label),
      item.nameTh ? h('p', { class: 'log-item-th', lang: 'th' }, item.nameTh) : null,
      item.estimate ? h('p', { class: 'log-detail-tag' }, estimateTag()) : null,
    );
    if (item.needsLabel) {
      wrap.append(
        h(
          'p',
          { class: 'fuel-note', 'data-needs-label': true },
          'Enter the numbers from your product’s label first. They stay on this phone.',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'primary-btn cta-btn',
            'data-edit-item': true,
            onclick: () => a.onEditItem(item),
          },
          icon('pencil', 'lg'),
          'Enter label numbers',
        ),
      );
      return wrap;
    }
    if (item.portions?.length) {
      const ps = item.portions;
      wrap.append(
        h('p', { class: 'fuel-label' }, 'Plate size'),
        chipRow(
          ps.map((x) => x.label),
          (i) => ps[i] === portion,
          (i) => {
            portion = ps[i];
          },
          'Plate size',
        ),
      );
    }
    if (grams && item.measures?.length) {
      const ms = item.measures;
      wrap.append(
        h('p', { class: 'fuel-label' }, 'Measures'),
        chipRow(
          ms.map((m) => `${m.label} (${fmtNum(m.g)} g)`),
          () => false,
          (i) => {
            amount = ms[i]?.g ?? amount;
            step.set(amount);
          },
          'Measures',
        ),
      );
    }
    appendAll(
      wrap,
      h('p', { class: 'fuel-label' }, grams ? 'Amount' : 'Servings'),
      step,
      out,
      h('p', { class: 'fuel-label' }, 'Meal'),
      slotChips(slot, (s) => {
        slot = s;
      }),
      h(
        'button',
        {
          type: 'button',
          class: 'primary-btn cta-btn',
          'data-log-confirm': true,
          onclick: () =>
            a.onLog({
              item,
              amount: toAmount(),
              portion,
              slot,
              macros: preview(item, toAmount(), portion?.factor ?? 1),
            }),
        },
        icon('check', 'lg'),
        'Log',
      ),
      item.editable
        ? h(
            'button',
            {
              type: 'button',
              class: 'fuel-secondary',
              'data-edit-item': true,
              onclick: () => a.onEditItem(item),
            },
            icon('pencil', 'md'),
            h('span', {}, item.ref.recipeId ? 'Edit recipe' : 'Edit food'),
          )
        : null,
    );
    return wrap;
  }

  function render(): void {
    tabs.forEach((b, i) => {
      const on = LOG_SECTIONS[i]?.id === section;
      b.setAttribute('class', on ? 'log-sec-btn on' : 'log-sec-btn');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    clear(panel);
    if (detail) {
      nav.setAttribute('hidden', '');
      const d = detailPanel(detail);
      panel.append(d);
      focusFirst(d);
    } else {
      nav.removeAttribute('hidden');
      panel.append(sectionPanel());
    }
  }

  render();
  const el = Object.assign(shell.el, {
    setSearch: (s: SearchState) => {
      search = s;
      if (section === 'search' && !detail) paintResults();
    },
    section: () => section,
  });
  return el as LogSheet;
}

/** Moves focus to a detail's heading so screen readers announce it. */
function focusFirst(panel: HTMLElement): void {
  const heading = [...(panel.children as unknown as Iterable<HTMLElement>)].find(
    (c) => c.getAttribute?.('id') === 'log-detail-name',
  );
  heading?.focus?.();
}
