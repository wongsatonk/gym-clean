// M7 Recipe editor (task 13, SPEC M7 "My recipes"). Pure render: a draft and callbacks in, no
// DB. Ingredients in grams, picked through the search callback (results arrive via `setSearch`,
// same states as the log sheet), how many servings the pot makes, and a live per-serving preview
// (`perServing` is the core recipe math). Editing a recipe never rewrites past log entries; the
// sheet says so.
//
// e2e hooks: dialog `[data-recipe-editor]`, `#recipe-name`, `[data-ingredient=<foodId>]` rows with
// `#grams-<index>` inputs and `[data-ingredient-remove]`, `[data-stepper=servings]`,
// `#recipe-search`, results `[data-log-item=<key>]`, `[data-per-serving]`, `[data-recipe-save]`.
import type { MacroSet, NutritionMode } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import {
  appendAll,
  clear,
  field,
  fmtNum,
  inputValue,
  macroLine,
  parseNum,
  sheetShell,
  stepper,
} from './common';
import type { LogItem, SearchState } from './logSheet';

export type RecipeIngredient = { foodId: string; name: string; grams: number };

export type RecipeDraft = {
  /** Set when editing an existing recipe. */
  id?: string | undefined;
  name: string;
  nameTh?: string | undefined;
  servings: number;
  ingredients: RecipeIngredient[];
};

export type RecipeEditorProps = {
  draft: RecipeDraft;
  mode: NutritionMode;
  /** Core: macros for one serving of the draft. */
  perServing: (draft: RecipeDraft) => MacroSet;
};

export type RecipeEditorActions = {
  onSearch: (query: string) => void;
  onSave: (draft: RecipeDraft) => void;
  onCancel: () => void;
  /** Existing recipes only. */
  onDelete?: (() => void) | undefined;
};

export type RecipeEditor = HTMLElement & { setSearch: (s: SearchState) => void };

export const MAX_SERVINGS = 20;

export function recipeEditor(p: RecipeEditorProps, a: RecipeEditorActions): RecipeEditor {
  const draft: RecipeDraft = {
    ...p.draft,
    ingredients: p.draft.ingredients.map((i) => ({ ...i })),
  };
  let search: SearchState = { status: 'idle' };

  const shell = sheetShell({
    title: draft.id ? 'Edit recipe' : 'New recipe',
    key: 'recipe-editor',
    closeLabel: 'Cancel',
    onClose: a.onCancel,
  });

  const name = field({
    id: 'recipe-name',
    label: 'Recipe name',
    value: draft.name,
    hint: 'e.g. Pad kra pao, my way',
    onInput: (v) => {
      draft.name = v;
    },
  });
  const nameTh = field({
    id: 'recipe-name-th',
    label: 'Thai name, optional',
    value: draft.nameTh ?? '',
    onInput: (v) => {
      draft.nameTh = v || undefined;
    },
  });
  nameTh.input.setAttribute('lang', 'th');

  const preview = h('p', {
    class: 'rx-preview-num',
    'data-per-serving': true,
    'aria-live': 'polite',
  });
  const paintPreview = () => {
    preview.textContent =
      draft.ingredients.length === 0
        ? 'Add ingredients to see it.'
        : macroLine(p.perServing(draft), p.mode);
  };

  const list = h('ul', { class: 'rx-list', 'aria-label': 'Ingredients' });
  const listError = h('p', { class: 'fuel-error', id: 'rx-list-err', 'aria-live': 'polite' });
  const paintList = () => {
    clear(list);
    if (draft.ingredients.length === 0) {
      list.append(
        h('li', { class: 'muted fuel-empty' }, 'No ingredients yet. Search below to add one.'),
      );
    }
    draft.ingredients.forEach((ing, i) => {
      const g = field({
        id: `grams-${i}`,
        label: `${ing.name}, grams`,
        value: fmtNum(ing.grams).replace(/,/g, ''),
        numeric: true,
        onInput: (v) => {
          const n = parseNum(v);
          g.error.textContent = n === null || n <= 0 ? 'Enter the grams.' : '';
          if (n !== null && n > 0) {
            ing.grams = n;
            paintPreview();
          }
        },
      });
      list.append(
        h(
          'li',
          { class: 'rx-ing', 'data-ingredient': ing.foodId },
          g.wrap,
          h(
            'button',
            {
              type: 'button',
              class: 'fuel-secondary rx-remove',
              'data-ingredient-remove': ing.foodId,
              'aria-label': `Remove ${ing.name}`,
              onclick: () => {
                draft.ingredients.splice(i, 1);
                paintList();
                paintPreview();
              },
            },
            icon('close', 'md'),
            h('span', { 'aria-hidden': 'true' }, 'Remove'),
          ),
        ),
      );
    });
  };

  const servings = stepper({
    label: 'Servings',
    key: 'servings',
    value: draft.servings,
    step: 1,
    min: 1,
    max: MAX_SERVINGS,
    unit: (v) => (v === 1 ? 'serving' : 'servings'),
    onChange: (v) => {
      draft.servings = v;
      paintPreview();
    },
  });

  const results = h('div', {
    class: 'log-results',
    'aria-live': 'polite',
    'data-search-results': true,
  });
  const add = (item: LogItem) => {
    draft.ingredients.push({ foodId: item.ref.foodId ?? item.key, name: item.label, grams: 100 });
    listError.textContent = '';
    paintList();
    paintPreview();
  };
  const paintResults = () => {
    clear(results);
    if (search.status === 'loading') {
      results.append(
        h(
          'p',
          { class: 'muted fuel-empty', 'data-search-state': 'loading' },
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
      if (search.items.length === 0) {
        results.append(
          h(
            'p',
            { class: 'muted fuel-empty', 'data-search-state': 'empty' },
            `No matches for “${search.query}”.`,
          ),
        );
      } else {
        results.append(
          h(
            'ul',
            { class: 'log-list' },
            ...search.items.map((item) =>
              h(
                'li',
                {},
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'log-item',
                    'data-log-item': item.key,
                    onclick: () => add(item),
                  },
                  h(
                    'span',
                    { class: 'log-item-name' },
                    icon('plus', 'sm'),
                    h('span', {}, item.label),
                  ),
                  h(
                    'span',
                    { class: 'log-item-sub' },
                    `per 100 g · ${macroLine(item.macros, p.mode)}`,
                  ),
                ),
              ),
            ),
          ),
        );
      }
    }
  };
  const searchField = field({
    id: 'recipe-search',
    label: 'Add an ingredient',
    type: 'search',
    hint: 'Search the food list or your own foods. Starts at 100 g.',
    onInput: (v) => a.onSearch(v),
  });

  const save = h(
    'button',
    { type: 'button', class: 'primary-btn cta-btn', 'data-recipe-save': true },
    icon('check', 'lg'),
    'Save recipe',
  );
  save.addEventListener('click', () => {
    const nm = inputValue(name.input);
    name.error.textContent = nm === '' ? 'Give the recipe a name.' : '';
    listError.textContent = draft.ingredients.length === 0 ? 'Add at least one ingredient.' : '';
    if (nm === '') {
      name.input.focus();
      return;
    }
    if (draft.ingredients.length === 0) {
      searchField.input.focus();
      return;
    }
    a.onSave({ ...draft, name: nm, ingredients: draft.ingredients.map((i) => ({ ...i })) });
  });

  paintList();
  paintPreview();
  appendAll(
    shell.body,
    name.wrap,
    nameTh.wrap,
    h('h2', { class: 'fuel-h2' }, 'Ingredients'),
    list,
    listError,
    searchField.wrap,
    results,
    h('h2', { class: 'fuel-h2' }, 'The pot makes'),
    servings,
    h(
      'section',
      { class: 'rx-preview', 'aria-label': 'Per serving' },
      h('p', { class: 'fuel-label' }, 'Per serving'),
      preview,
    ),
    h('p', { class: 'fuel-hint' }, 'Changing a recipe doesn’t change food you already logged.'),
    save,
    a.onDelete
      ? h(
          'button',
          {
            type: 'button',
            class: 'fuel-secondary',
            'data-recipe-delete': true,
            onclick: () => a.onDelete?.(),
          },
          icon('close', 'md'),
          h('span', {}, 'Delete recipe'),
        )
      : null,
  );

  return Object.assign(shell.el, {
    setSearch: (s: SearchState) => {
      search = s;
      paintResults();
    },
  }) as RecipeEditor;
}
