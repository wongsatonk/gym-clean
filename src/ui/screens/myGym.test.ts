import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultGymProfile, equipmentItems } from '../../data/catalog';
import { checkCopy } from '../../core/trainer/replies';
import {
  GYM_IMPORT_BAD_FILE,
  GYM_IMPORT_LABEL,
  GYM_IMPORT_NOTHING,
  GYM_SHARED_NOTE,
  GYM_SHARE_LABEL,
  GYM_SHARE_NOTE,
  importPreviewText,
  type MyGymActions,
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

describe('My gym: Share my gym / Import a gym file (M12 slice 1b)', () => {
  function render1b(over: Partial<MyGymProps> = {}, act: Partial<MyGymActions> = {}) {
    const calls = { share: 0, text: [] as string[], apply: 0, cancel: 0 };
    const el = asFake(
      myGymScreen(
        { items: equipmentItems(), equipment: ['dumbbells'], ...over },
        {
          onBack: () => {},
          onChange: () => {},
          onShare: () => calls.share++,
          onImportText: (t) => calls.text.push(t),
          onImportApply: () => calls.apply++,
          onImportCancel: () => calls.cancel++,
          ...act,
        },
      ),
    );
    const at = (attr: string) => el.find((e) => e.hasAttribute(attr))[0];
    return { el, calls, at };
  }

  it('no share callbacks → no Share section (unchanged)', () => {
    const { el } = render();
    expect(el.find((e) => e.hasAttribute('data-gym-share-section'))).toHaveLength(0);
  });

  it('Share my gym calls back and says what the file holds', () => {
    const { el, calls, at } = render1b();
    const sec = at('data-gym-share-section');
    expect(sec?.byTag('h2')[0]?.textContent).toBe('Share');
    expect(at('data-gym-share')?.textContent).toBe(GYM_SHARE_LABEL);
    at('data-gym-share')?.click();
    expect(calls.share).toBe(1);
    expect(el.textContent).toContain(GYM_SHARE_NOTE);
    expect(at('data-gym-shared')).toBeUndefined();
    const { at: at2 } = render1b({ shareNote: GYM_SHARED_NOTE });
    expect(at2('data-gym-shared')?.textContent).toContain(GYM_SHARED_NOTE);
    expect(at2('data-gym-shared')?.getAttribute('role')).toBe('status');
  });

  it('Import opens a JSON file picker and hands the file text to the caller', async () => {
    const { calls, at } = render1b();
    const input = at('data-gym-import') as FakeEl & { files?: unknown[]; value?: string };
    expect(input.getAttribute('type')).toBe('file');
    expect(input.getAttribute('accept')).toBe('application/json,.json');
    let opened = 0;
    input.addEventListener('click', () => opened++);
    expect(at('data-gym-import-open')?.textContent).toBe(GYM_IMPORT_LABEL);
    at('data-gym-import-open')?.click();
    expect(opened).toBe(1);

    const text = JSON.stringify({ format: 'gym-clean-gym', version: 1, equipment: ['barbell'] });
    input.files = [{ text: () => Promise.resolve(text) }];
    input.value = 'C:/fakepath/gym.json';
    input.dispatch('change', {});
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.text).toEqual([text]);
    expect(input.value).toBe(''); // the same file can be picked again

    // An unreadable file is reported as empty text (the caller shows the bad-file line).
    input.files = [{ text: () => Promise.reject(new Error('x')) }];
    input.dispatch('change', {});
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.text).toEqual([text, '']);
    // No file picked → nothing.
    input.files = [];
    input.dispatch('change', {});
    expect(calls.text).toHaveLength(2);
  });

  it('preview: "Adds 12 items, 1 unknown", the names, then Apply or Cancel; nothing before Apply', () => {
    const adds = equipmentItems()
      .slice(0, 12)
      .map((i) => i.label);
    const { calls, at } = render1b({ importPreview: { adds, unknown: 1 } });
    const box = at('data-gym-import-preview');
    expect(box?.oneByClass('gym-import-sum').textContent).toBe('Adds 12 items, 1 unknown');
    expect(box?.byTag('li').map((l) => l.textContent)).toEqual(adds);
    expect(box?.textContent).toContain('Unknown items are skipped.');
    // The Import button gives way to the preview.
    expect(at('data-gym-import-open')).toBeUndefined();
    expect(calls).toEqual({ share: 0, text: [], apply: 0, cancel: 0 });
    at('data-gym-import-apply')?.click();
    at('data-gym-import-cancel')?.click();
    expect(calls.apply).toBe(1);
    expect(calls.cancel).toBe(1);
  });

  it('a file that adds nothing has no Apply, only Close', () => {
    const { at } = render1b({ importPreview: { adds: [], unknown: 0, already: 5 } });
    expect(at('data-gym-import-preview')?.textContent).toContain(GYM_IMPORT_NOTHING);
    expect(at('data-gym-import-apply')).toBeUndefined();
    expect(at('data-gym-import-cancel')?.textContent).toBe('Close');
  });

  it('a bad file shows the reason as an alert and keeps Import available', () => {
    const { at } = render1b({ importError: GYM_IMPORT_BAD_FILE });
    expect(at('data-gym-import-error')?.textContent).toBe(GYM_IMPORT_BAD_FILE);
    expect(at('data-gym-import-error')?.getAttribute('role')).toBe('alert');
    expect(at('data-gym-import-open')).toBeDefined();
  });

  it('importPreviewText', () => {
    expect(importPreviewText({ adds: ['a'], unknown: 0 })).toBe('Adds 1 item');
    expect(importPreviewText({ adds: [], unknown: 2 })).toBe('Adds 0 items, 2 unknown');
    expect(importPreviewText({ adds: ['a', 'b'], unknown: 1, already: 3 })).toBe(
      'Adds 2 items, 1 unknown, 3 already ticked',
    );
  });

  it('share buttons are ≥ 56px at body size (css) and the copy is plain', () => {
    const css = readFileSync(new URL('./myGym.css', import.meta.url), 'utf8');
    const rule = /\.gym-share-btn\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('min-height: var(--tap-bar)');
    expect(rule).toContain('font-size: var(--fs-body)');
    for (const s of [
      GYM_SHARE_LABEL,
      GYM_IMPORT_LABEL,
      GYM_SHARE_NOTE,
      GYM_SHARED_NOTE,
      GYM_IMPORT_BAD_FILE,
      GYM_IMPORT_NOTHING,
    ])
      expect(checkCopy(s), s).toEqual({ ok: true, hits: [] });
  });
});
