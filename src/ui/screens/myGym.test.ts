import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultGymProfile, equipmentItems } from '../../data/catalog';
import {
  MY_GYM_KEEP_NOTE,
  MY_GYM_PRIVACY,
  groupItems,
  groupTitle,
  myGymScreen,
  type MyGymProps,
} from './myGym';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

function render(over: Partial<MyGymProps> = {}) {
  const calls = { back: 0, change: [] as string[][] };
  const el = asFake(
    myGymScreen(
      { items: equipmentItems(), equipment: defaultGymProfile().equipment, ...over },
      { onBack: () => calls.back++, onChange: (e) => calls.change.push(e) },
    ),
  );
  return { el, calls };
}

const item = (el: FakeEl, id: string) => {
  const hit = el.find((e) => e.getAttribute('data-gym-item') === id)[0];
  if (!hit) throw new Error(`no item ${id}`);
  return hit;
};

describe('My gym screen', () => {
  it('is a Pro screen with Back, the title, and every item grouped in data order', () => {
    const { el } = render();
    expect(el.getAttribute('data-screen')).toBe('my-gym');
    expect(el.classes).toEqual(expect.arrayContaining(['screen', 'my-gym', 'mood-pro']));
    expect(el.byTag('h1')[0]?.textContent).toBe('My gym');
    expect(el.byTag('button').filter((e) => e.textContent === '‹ Back')).toHaveLength(1);
    const groups = el
      .find((e) => e.getAttribute('data-gym-group') !== null)
      .map((g) => g.getAttribute('data-gym-group'));
    expect(groups).toEqual(groupItems(equipmentItems()).map(([g]) => g));
    expect(groups).toEqual(['free weights', 'benches and racks', 'cables', 'machines']);
    const ids = el
      .find((e) => e.getAttribute('data-gym-item') !== null)
      .map((e) => e.getAttribute('data-gym-item'));
    expect(ids).toEqual(equipmentItems().map((i) => i.id));
    // Each group is named by its heading.
    for (const g of el.byClass('gym-group')) {
      const head = g.byTag('h2')[0];
      expect(g.getAttribute('aria-labelledby')).toBe(head?.getAttribute('id'));
      expect(head?.textContent).toBe(groupTitle(g.getAttribute('data-gym-group') ?? ''));
    }
  });

  it('ticks exactly the profile items (aria-checked + a check icon, not colour alone)', () => {
    const { el } = render();
    const def = new Set(defaultGymProfile().equipment);
    for (const it of equipmentItems()) {
      const row = item(el, it.id);
      expect(row.getAttribute('role')).toBe('checkbox');
      expect(row.getAttribute('aria-checked'), it.id).toBe(def.has(it.id) ? 'true' : 'false');
      expect(row.find((e) => e.getAttribute('data-icon') === 'check')).toHaveLength(
        def.has(it.id) ? 1 : 0,
      );
      expect(row.textContent).toBe(it.label);
    }
    expect(item(el, 'leg-press').getAttribute('aria-checked')).toBe('false');
  });

  it('a tap flips the row in place and reports the whole list in item order', () => {
    const { el, calls } = render({ equipment: ['dumbbells', 'smith-machine'] });
    item(el, 'leg-press').click();
    expect(item(el, 'leg-press').getAttribute('aria-checked')).toBe('true');
    expect(item(el, 'leg-press').classes).toContain('on');
    expect(calls.change.at(-1)).toEqual(['dumbbells', 'smith-machine', 'leg-press']);
    item(el, 'smith-machine').click();
    expect(item(el, 'smith-machine').getAttribute('aria-checked')).toBe('false');
    expect(calls.change.at(-1)).toEqual(['dumbbells', 'leg-press']);
    item(el, 'barbell').click();
    expect(calls.change.at(-1)).toEqual(['dumbbells', 'barbell', 'leg-press']);
  });

  it('says plainly that changing the list resets Keep it, and that it stays on the phone', () => {
    const { el, calls } = render();
    expect(el.textContent).toContain(MY_GYM_KEEP_NOTE);
    expect(MY_GYM_KEEP_NOTE).toMatch(/Keep it/);
    expect(el.textContent).toContain(MY_GYM_PRIVACY);
    el.byTag('button')
      .find((e) => e.textContent === '‹ Back')
      ?.click();
    expect(calls.back).toBe(1);
  });

  it('rows are at least the 56px tap target at body size (css)', () => {
    const css = readFileSync(new URL('./myGym.css', import.meta.url), 'utf8');
    const rule = /\.gym-item\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('min-height: var(--tap-min)');
    expect(rule).toContain('font-size: var(--fs-body)');
  });
});
