// M10e task 11: Settings → My gym (Pro mood, like Plan changes). Pure render: the equipment
// items (src/data `equipmentItems()`), what his gym has, and callbacks in; element out. No DB
// access: app.ts saves each change with `saveGymProfile` (which also clears the Keep it choices).
//
// Each item is a big checkbox row (role="checkbox", ≥ 56px), grouped by the item's `group`.
// A tap flips the row in place (no re-render, so focus stays put) and reports the whole list.
//
// e2e hooks: `main[data-screen="my-gym"]`, `[data-gym-group="<group>"]`,
// `[data-gym-item="<id>"]` with aria-checked.
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
};

export type MyGymActions = {
  onBack: () => void;
  /** The new list (in item order) after each tap. */
  onChange: (equipment: string[]) => void;
};

export const MY_GYM_INTRO = 'Tick what your gym has. The coach only suggests what you can do here.';
export const MY_GYM_KEEP_NOTE =
  'Changing this list clears your "Keep it" choices, so the coach asks again.';
export const MY_GYM_PRIVACY = 'Stays on this phone.';

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
    h(
      'header',
      { class: 'top-bar' },
      h('button', { class: 'ghost-btn', type: 'button', onclick: actions.onBack }, '‹ Back'),
    ),
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
  );
}
