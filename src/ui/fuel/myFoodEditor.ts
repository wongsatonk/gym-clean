// M7 My food editor (task 13, SPEC M7 "My foods"). Pure render: a draft and callbacks in, no DB.
// Numbers per 100 g or per serving (a label like "1 bottle" with an optional weight), as printed
// on the package. Quick mode asks kcal + protein; Full adds carbs + fat. Values already stored
// for a hidden macro are kept (switching modes never loses data). Also used for the seed Protein
// shake's label numbers (M7-q4): `labelPrompt` adds the "from your product's label" line.
//
// e2e hooks: dialog `[data-my-food-editor]`, `#food-name`, `[data-basis=per100g|serving]`
// (aria-pressed), `#food-serving-label`, `#food-serving-g`, `#food-kcal`, `#food-protein`,
// `#food-carbs`, `#food-fat`, `[data-food-save]`, `[data-food-barcode]` (a scanned code, shown).
import type { MacroSet, NutritionMode } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { appendAll, field, inputValue, parseNum, sheetShell } from './common';

export type MyFoodDraft = MacroSet & {
  id?: string | undefined;
  name: string;
  nameTh?: string | undefined;
  basis: { per100g: true } | { servingLabel: string; servingG?: number | undefined };
  /** A scanned barcode (M7-q5): kept with the food so the next scan finds it on the phone. */
  barcode?: string | undefined;
};

export type MyFoodEditorProps = {
  draft: MyFoodDraft;
  mode: NutritionMode;
  /** M7-q4: the Protein shake's first log asks for the label numbers. */
  labelPrompt?: boolean | undefined;
};

export type MyFoodEditorActions = {
  onSave: (draft: MyFoodDraft) => void;
  onCancel: () => void;
  onDelete?: (() => void) | undefined;
};

const numText = (n: number | undefined) => (n === undefined ? '' : String(n));

export function myFoodEditor(p: MyFoodEditorProps, a: MyFoodEditorActions): HTMLElement {
  let perServing = !('per100g' in p.draft.basis);
  const basis0 = p.draft.basis;
  const shell = sheetShell({
    title: p.draft.id ? 'Edit food' : 'New food',
    key: 'my-food-editor',
    closeLabel: 'Cancel',
    onClose: a.onCancel,
  });

  const name = field({
    id: 'food-name',
    label: 'Name',
    value: p.draft.name,
    hint: 'e.g. Soy milk, unsweetened',
  });
  const nameTh = field({
    id: 'food-name-th',
    label: 'Thai name, optional',
    value: p.draft.nameTh ?? '',
  });
  nameTh.input.setAttribute('lang', 'th');
  const servingLabel = field({
    id: 'food-serving-label',
    label: 'Serving',
    value: 'servingLabel' in basis0 ? basis0.servingLabel : '',
    hint: 'As on the label, e.g. 1 bottle, 1 scoop',
  });
  const servingG = field({
    id: 'food-serving-g',
    label: 'Serving weight (g), optional',
    value: 'servingLabel' in basis0 ? numText(basis0.servingG) : '',
    numeric: true,
  });
  const servingBox = h(
    'div',
    { class: 'mf-serving', 'data-serving-fields': true },
    servingLabel.wrap,
    servingG.wrap,
  );

  // A new food, or the shake's placeholder numbers (M7-q4), starts with empty number fields.
  const blank = p.labelPrompt === true || (!p.draft.id && p.draft.name === '');
  const start = (n: number | undefined) => (blank ? '' : numText(n));
  const kcal = field({
    id: 'food-kcal',
    label: 'Calories (kcal)',
    value: start(p.draft.kcal),
    numeric: true,
  });
  const protein = field({
    id: 'food-protein',
    label: 'Protein (g)',
    value: start(p.draft.proteinG),
    numeric: true,
  });
  const full = p.mode === 'full';
  const carbs = full
    ? field({
        id: 'food-carbs',
        label: 'Carbs (g), optional',
        value: start(p.draft.carbsG),
        numeric: true,
      })
    : null;
  const fat = full
    ? field({
        id: 'food-fat',
        label: 'Fat (g), optional',
        value: start(p.draft.fatG),
        numeric: true,
      })
    : null;

  const per = h('p', { class: 'fuel-label', 'data-per-label': true });
  const segBtn = (key: 'per100g' | 'serving', text: string) =>
    h('button', { type: 'button', class: 'fuel-chip', 'data-basis': key }, text);
  const b100 = segBtn('per100g', 'Per 100 g');
  const bServ = segBtn('serving', 'Per serving');
  const paintBasis = () => {
    for (const [b, on] of [
      [b100, !perServing],
      [bServ, perServing],
    ] as const) {
      b.setAttribute('class', on ? 'fuel-chip on' : 'fuel-chip');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (perServing) servingBox.removeAttribute('hidden');
    else servingBox.setAttribute('hidden', '');
    per.textContent = perServing ? 'Numbers for one serving' : 'Numbers for 100 g';
  };
  b100.addEventListener('click', () => {
    perServing = false;
    paintBasis();
  });
  bServ.addEventListener('click', () => {
    perServing = true;
    paintBasis();
  });
  paintBasis();

  const save = h(
    'button',
    { type: 'button', class: 'primary-btn cta-btn', 'data-food-save': true },
    icon('check', 'lg'),
    'Save food',
  );
  save.addEventListener('click', () => {
    const nm = inputValue(name.input);
    const k = parseNum(inputValue(kcal.input));
    const pr = parseNum(inputValue(protein.input));
    const sl = inputValue(servingLabel.input);
    const sgText = inputValue(servingG.input);
    const sg = parseNum(sgText);
    name.error.textContent = nm === '' ? 'Give the food a name.' : '';
    kcal.error.textContent = k === null ? 'Enter the calories from the label.' : '';
    protein.error.textContent = pr === null ? 'Enter the protein from the label.' : '';
    servingLabel.error.textContent = perServing && sl === '' ? 'Say what one serving is.' : '';
    servingG.error.textContent =
      perServing && sgText !== '' && sg === null ? 'Enter grams as a number.' : '';
    const firstBad = [
      [nm === '', name.input],
      [perServing && sl === '', servingLabel.input],
      [perServing && sgText !== '' && sg === null, servingG.input],
      [k === null, kcal.input],
      [pr === null, protein.input],
    ].find(([bad]) => bad) as [boolean, HTMLInputElement] | undefined;
    if (firstBad || k === null || pr === null) {
      firstBad?.[1].focus();
      return;
    }
    const out: MyFoodDraft = {
      id: p.draft.id,
      name: nm,
      nameTh: inputValue(nameTh.input) || undefined,
      basis: perServing ? { servingLabel: sl, servingG: sg ?? undefined } : { per100g: true },
      kcal: k,
      proteinG: pr,
      barcode: p.draft.barcode,
    };
    // Full mode edits carbs/fat; Quick keeps whatever was stored.
    const c = carbs ? parseNum(inputValue(carbs.input)) : blank ? null : (p.draft.carbsG ?? null);
    const f = fat ? parseNum(inputValue(fat.input)) : blank ? null : (p.draft.fatG ?? null);
    if (c !== null) out.carbsG = c;
    if (f !== null) out.fatG = f;
    a.onSave(out);
  });

  appendAll(
    shell.body,
    p.labelPrompt
      ? h(
          'p',
          { class: 'fuel-note', 'data-label-prompt': true },
          'Enter the numbers from your product’s label. They stay on this phone.',
        )
      : null,
    p.draft.barcode
      ? h(
          'p',
          { class: 'fuel-note', 'data-food-barcode': p.draft.barcode },
          `Barcode ${p.draft.barcode}. Enter the numbers from the package label.`,
        )
      : null,
    name.wrap,
    nameTh.wrap,
    h('p', { class: 'fuel-label' }, 'The label gives numbers'),
    h(
      'div',
      { class: 'fuel-chips mf-basis', role: 'group', 'aria-label': 'Numbers are' },
      b100,
      bServ,
    ),
    servingBox,
    per,
    kcal.wrap,
    protein.wrap,
    carbs?.wrap ?? null,
    fat?.wrap ?? null,
    save,
    a.onDelete
      ? h(
          'button',
          {
            type: 'button',
            class: 'fuel-secondary',
            'data-food-delete': true,
            onclick: () => a.onDelete?.(),
          },
          icon('close', 'md'),
          h('span', {}, 'Delete food'),
        )
      : null,
  );
  return shell.el;
}
