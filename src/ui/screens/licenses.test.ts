import { describe, expect, it, vi } from 'vitest';
import type { LicenseEntry } from '../../core/types';
import { licenseMeta, licensesScreen, licensesView } from './licenses';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

// Made-up entries; the text holds a URL and markup-looking text on purpose.
const ENTRIES: LicenseEntry[] = [
  {
    name: 'free-exercise-db (exercise names, steps, muscles)',
    license: 'Unlicense',
    source: 'data',
    text: 'Public domain.\n\nFor more information, please refer to <https://unlicense.org>\n<b>not bold</b>',
  },
  { name: 'Example Font', license: 'OFL-1.1', source: 'font' },
  {
    name: 'dexie',
    version: '4.0.0',
    license: 'Apache-2.0',
    source: 'npm',
    text: 'Apache License\n  Version 2.0',
  },
];

const rows = (el: FakeEl) => el.find((e) => e.hasAttribute('data-license'));

describe('licenseMeta', () => {
  it('version and licence, or the licence alone', () => {
    expect(licenseMeta(ENTRIES[2] as LicenseEntry)).toBe('4.0.0 · Apache-2.0');
    expect(licenseMeta(ENTRIES[1] as LicenseEntry)).toBe('OFL-1.1');
  });
});

describe('licensesScreen', () => {
  it('lists name, version and licence for every entry', () => {
    const el = asFake(licensesScreen({ entries: ENTRIES }, { onBack: vi.fn() }));
    expect(el.getAttribute('data-screen')).toBe('licenses');
    const r = rows(el);
    expect(r).toHaveLength(3);
    expect(r[0]?.textContent).toContain('free-exercise-db');
    expect(r[0]?.textContent).toContain('Unlicense');
    expect(r[2]?.textContent).toContain('4.0.0 · Apache-2.0');
  });

  it('entries with a text are buttons; without one they are plain rows', () => {
    const el = asFake(licensesScreen({ entries: ENTRIES }, { onBack: vi.fn() }));
    const r = rows(el);
    expect(r.map((x) => x.tag)).toEqual(['button', 'div', 'button']);
  });

  it('tap → the full text as plain text in a pre block (never markup, never a link)', () => {
    const el = asFake(licensesScreen({ entries: ENTRIES }, { onBack: vi.fn() }));
    rows(el)[0]?.click();
    const pre = el.byTag('pre')[0];
    expect(pre).toBeDefined();
    expect(pre?.textContent).toBe(ENTRIES[0]?.text);
    expect(pre?.innerHTML).toBe('');
    expect(el.find((e) => e.innerHTML !== '' && e.tag !== 'svg')).toHaveLength(0);
    expect(el.byTag('a')).toHaveLength(0);
    expect(el.byTag('h1')[0]?.textContent).toContain('free-exercise-db');
  });

  it('Back from a text returns to the list; Back from the list leaves', () => {
    const onBack = vi.fn();
    const el = asFake(licensesScreen({ entries: ENTRIES }, { onBack }));
    rows(el)[2]?.click();
    el.find((e) => e.hasAttribute('data-back'))[0]?.click();
    expect(onBack).not.toHaveBeenCalled();
    expect(rows(el)).toHaveLength(3);
    el.find((e) => e.hasAttribute('data-back'))[0]?.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('loading and error states', () => {
    const loading = asFake(licensesScreen({ entries: 'loading' }, { onBack: vi.fn() }));
    expect(loading.find((e) => e.hasAttribute('data-licenses-loading'))).toHaveLength(1);
    const err = asFake(licensesScreen({ entries: 'error' }, { onBack: vi.fn() }));
    expect(err.find((e) => e.hasAttribute('data-licenses-error'))).toHaveLength(1);
  });
});

describe('licensesView', () => {
  it('shows loading, then the loaded list', async () => {
    const load = vi.fn(async () => ENTRIES);
    const el = asFake(licensesView({ onBack: vi.fn() }, load));
    expect(el.find((e) => e.hasAttribute('data-licenses-loading'))).toHaveLength(1);
    await load.mock.results[0]?.value;
    await Promise.resolve();
    expect(rows(el)).toHaveLength(3);
  });

  it('shows the error state when loading fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const load = vi.fn(async (): Promise<LicenseEntry[]> => {
      throw new Error('nope');
    });
    const el = asFake(licensesView({ onBack: vi.fn() }, load));
    await Promise.resolve();
    await Promise.resolve();
    expect(el.find((e) => e.hasAttribute('data-licenses-error'))).toHaveLength(1);
    warn.mockRestore();
  });
});
