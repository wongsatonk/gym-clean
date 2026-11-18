// M10e task 11: Settings → My gym (Pro mood, like Plan changes). Pure render: the equipment
// items (src/data `equipmentItems()`), what his gym has, and callbacks in; element out. No DB
// access: app.ts saves each change with `saveGymProfile` (which also clears the Keep it choices).
//
// Each item is a big checkbox row (role="checkbox", ≥ 56px), grouped by the item's `group`.
// A tap flips the row in place (no re-render, so focus stays put) and reports the whole list.
//
// M12 slice 1b task 26 ("Share my gym", Decision "Second user"): a Share section at the end.
// "Share my gym" hands the caller the tap (it builds the GymFile: equipment ids only, and sends
// it through the share sheet / a download). "Import a gym file" reads the picked file as text
// on this device and hands the text over; the caller parses it (core) and renders again with
// `importPreview`, shown as "Adds 12 items, 1 unknown" + the names, with Apply / Cancel. Nothing
// is added before Apply. Shown only when the matching callbacks are set.
//
// e2e hooks: `main[data-screen="my-gym"]`, `[data-gym-group="<group>"]`,
// `[data-gym-item="<id>"]` with aria-checked, `[data-gym-share]`, `[data-gym-shared]`,
// `[data-gym-import]` (the file input), `[data-gym-import-preview]`, `[data-gym-import-apply]`,
// `[data-gym-import-cancel]`, `[data-gym-import-error]`.
import { backButton } from '../backButton';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import './myGym.css';

export type MyGymItem = { id: string; label: string; group: string };

export type MyGymProps = {
  /** Every item, in display order (`equipmentItems()`). */
  items: readonly MyGymItem[];
  /** The ids his gym has (GymProfile.equipment). */
  equipment: readonly string[];
  /** M12 1b: a parsed gym file waiting for Apply (core), or null / omitted. */
  importPreview?: GymImportPreview | null | undefined;
  /** M12 1b: why the picked file could not be read, in plain words (GYM_IMPORT_BAD_FILE). */
  importError?: string | null | undefined;
  /** M12 1b: a line confirming the last share, e.g. GYM_SHARED_NOTE. */
  shareNote?: string | null | undefined;
};

/** What an imported gym file would do. Import only adds; it never unticks anything. */
export type GymImportPreview = {
  /** Labels of the known items the file would add (not yet ticked here), in item order. */
  adds: readonly string[];
  /** Ids in the file this app does not know (skipped). */
  unknown: number;
  /** Known items in the file that are already ticked here. */
  already?: number | undefined;
};

export type MyGymActions = {
  onBack: () => void;
  /** The new list (in item order) after each tap. */
  onChange: (equipment: string[]) => void;
  /** M12 1b: Share my gym (the caller builds and shares the file). Omitted → no Share button. */
  onShare?: (() => void) | undefined;
  /** M12 1b: the text of a picked gym file. Omitted → no Import button. */
  onImportText?: ((text: string) => void) | undefined;
  /** M12 1b: Apply on the import preview. */
  onImportApply?: (() => void) | undefined;
  /** M12 1b: Cancel on the import preview (or dismissing an error). */
  onImportCancel?: (() => void) | undefined;
};

export const MY_GYM_INTRO = 'Tick what your gym has. The coach only suggests what you can do here.';
export const MY_GYM_KEEP_NOTE =
  'Changing this list clears your "Keep it" choices, so the coach asks again.';
export const MY_GYM_PRIVACY = 'Stays on this phone.';
export const GYM_SHARE_LABEL = 'Share my gym';
export const GYM_IMPORT_LABEL = 'Import a gym file';
export const GYM_SHARE_NOTE =
  'The file lists the kit only. Nothing about you, your plan or your training is in it.';
export const GYM_SHARED_NOTE = 'Gym file ready to send.';
export const GYM_IMPORT_BAD_FILE = "That isn't a gym file. Nothing changed.";
export const GYM_IMPORT_NOTHING = 'Your list already has everything in this file.';

/** "12 items" / "1 item". */
const items = (n: number): string => (n === 1 ? '1 item' : `${n} items`);

/** "Adds 12 items, 1 unknown" (+ ", 3 already ticked" when given and not zero). */
export function importPreviewText(p: GymImportPreview): string {
  return [
    `Adds ${items(p.adds.length)}`,
    p.unknown > 0 ? `${p.unknown} unknown` : null,
    p.already ? `${p.already} already ticked` : null,
  ]
    .filter((t): t is string => t !== null)
    .join(', ');
}

/** The Share section: Share my gym, Import a gym file, and the import preview / error. */
function shareSection(props: MyGymProps, actions: MyGymActions): HTMLElement | null {
  const { onShare, onImportText } = actions;
  if (!onShare && !onImportText) return null;
  const preview = props.importPreview ?? null;

  const input = onImportText
    ? h('input', {
        type: 'file',
        accept: 'application/json,.json',
        class: 'gym-file',
        'data-gym-import': true,
        tabindex: -1,
        'aria-hidden': 'true',
      })
    : null;
  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void file
      .text()
      .then(
        (text) => onImportText?.(text),
        () => onImportText?.(''),
      )
      .then(() => {
        input.value = '';
      });
  });

  const previewBox = preview
    ? h(
        'div',
        { class: 'gym-import', 'data-gym-import-preview': true, role: 'status' },
        h('p', { class: 'gym-import-sum' }, importPreviewText(preview)),
        preview.adds.length
          ? h('ul', { class: 'gym-import-list' }, ...preview.adds.map((l) => h('li', {}, l)))
          : h('p', { class: 'set-note' }, GYM_IMPORT_NOTHING),
        preview.unknown > 0
          ? h('p', { class: 'muted set-note' }, 'Unknown items are skipped.')
          : null,
        h(
          'div',
          { class: 'gym-import-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'gym-share-btn',
              'data-gym-import-cancel': true,
              onclick: () => actions.onImportCancel?.(),
            },
            preview.adds.length ? 'Cancel' : 'Close',
          ),
          preview.adds.length
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'gym-share-btn primary',
                  'data-gym-import-apply': true,
                  onclick: () => actions.onImportApply?.(),
                },
                icon('check', 'sm'),
                h('span', {}, 'Apply'),
              )
            : null,
        ),
      )
    : null;

  return h(
    'section',
    {
      class: 'gym-group gym-share',
      'data-gym-share-section': true,
      'aria-labelledby': 'gym-share-h',
    },
    h('h2', { class: 'set-head', id: 'gym-share-h' }, 'Share'),
    onShare
      ? h(
          'button',
          {
            type: 'button',
            class: 'gym-share-btn',
            'data-gym-share': true,
            onclick: () => onShare(),
          },
          GYM_SHARE_LABEL,
        )
      : null,
    props.shareNote
      ? h(
          'p',
          { class: 'set-note', 'data-gym-shared': true, role: 'status' },
          icon('check', 'sm'),
          ` ${props.shareNote}`,
        )
      : null,
    onShare ? h('p', { class: 'muted set-note' }, GYM_SHARE_NOTE) : null,
    input && !preview
      ? h(
          'button',
          {
            type: 'button',
            class: 'gym-share-btn',
            'data-gym-import-open': true,
            onclick: () => input.click(),
          },
          GYM_IMPORT_LABEL,
        )
      : null,
    input,
    props.importError
      ? h(
          'p',
          { class: 'gym-import-error', 'data-gym-import-error': true, role: 'alert' },
          icon('help', 'sm'),
          h('span', {}, props.importError),
        )
      : null,
    previewBox,
  );
}

/** "free weights" → "Free weights". */
export function groupTitle(group: string): string {
  return group.charAt(0).toUpperCase() + group.slice(1);
}

/** Groups in first-seen order, items in their given order. */
export function groupItems(items: readonly MyGymItem[]): [string, MyGymItem[]][] {
  const out = new Map<string, MyGymItem[]>();
  for (const it of items) out.set(it.group, [...(out.get(it.group) ?? []), it]);
  return [...out];
}

export function myGymScreen(props: MyGymProps, actions: MyGymActions): HTMLElement {
  const have = new Set(props.equipment);
  const ordered = () => props.items.map((i) => i.id).filter((id) => have.has(id));

  const row = (it: MyGymItem) => {
    const box = h('span', { class: 'gym-item-box', 'aria-hidden': 'true' });
    const btn = h(
      'button',
      {
        type: 'button',
        role: 'checkbox',
        class: 'gym-item',
        'data-gym-item': it.id,
      },
      box,
      h('span', { class: 'gym-item-label' }, it.label),
    );
    const show = () => {
      const on = have.has(it.id);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.setAttribute('class', on ? 'gym-item on' : 'gym-item');
      box.replaceChildren(...(on ? [icon('check', 'sm')] : []));
    };
    show();
    btn.addEventListener('click', () => {
      if (have.has(it.id)) have.delete(it.id);
      else have.add(it.id);
      show();
      actions.onChange(ordered());
    });
    return h('li', {}, btn);
  };

  return h(
    'main',
    { class: `screen my-gym ${moodClass('pro')}`, 'data-screen': 'my-gym' },
    h('header', { class: 'top-bar' }, backButton(actions.onBack)),
    h('h1', { class: 'page-title' }, 'My gym'),
    h('p', { class: 'set-note' }, MY_GYM_INTRO),
    ...groupItems(props.items).map(([group, items]) => {
      const id = `gym-group-${group.replace(/\W+/g, '-')}`;
      return h(
        'section',
        { class: 'gym-group', 'data-gym-group': group, 'aria-labelledby': id },
        h('h2', { class: 'set-head', id }, groupTitle(group)),
        h('ul', { class: 'gym-item-list' }, ...items.map(row)),
      );
    }),
    h('p', { class: 'set-note muted', 'data-gym-keep-note': true }, MY_GYM_KEEP_NOTE),
    h('p', { class: 'set-note muted' }, icon('lock', 'sm'), ` ${MY_GYM_PRIVACY}`),
    shareSection(props, actions),
  );
}
