import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCopy } from '../core/trainer/replies';
import { SEARCH_LABEL, pageHead, searchButton } from './searchButton';
import { asFake, useFakeDom, type FakeEl } from './screens/testDom';

useFakeDom();

const icons = (el: FakeEl) => el.find((e) => e.hasAttribute('data-icon'));

describe('searchButton', () => {
  it('is a button: decorative magnifier + the word "Search", which is its accessible name', () => {
    const el = asFake(searchButton(() => undefined));
    expect(el.tag).toBe('button');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.hasAttribute('data-search-open')).toBe(true);
    expect(el.classes).toContain('search-btn');
    // M13d task 40a: the round icon button, word beside the circle (secondary look).
    expect(el.classes).toContain('icon-btn');
    expect(el.hasAttribute('data-icon-btn')).toBe(true);
    expect(el.getAttribute('data-variant')).toBe('secondary');
    expect(el.getAttribute('data-label-at')).toBe('beside');
    expect(el.textContent).toBe('Search');
    expect(el.getAttribute('aria-label')).toBeNull();
    const ic = icons(el);
    expect(ic.map((i) => i.getAttribute('data-icon'))).toEqual(['search']);
    expect(ic[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(checkCopy(SEARCH_LABEL).ok).toBe(true);
  });

  it('calls onSearch with itself (the opener) on every tap', () => {
    const got: unknown[] = [];
    const btn = searchButton((opener) => got.push(opener));
    asFake(btn).click();
    asFake(btn).click();
    expect(got).toEqual([btn, btn]);
  });

  it('css: sits right in its row, word on one line, tokens only, never --cta', () => {
    // Size, colours and the press come from iconButton.css (56px circle, 20px+ word).
    const css = readFileSync(join(__dirname, 'searchButton.css'), 'utf8');
    const block = /\.search-btn\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(block).toMatch(/flex:\s*none/);
    expect(block).toMatch(/margin-left:\s*auto/);
    // No box of its own around the circle (the old surface-2 bar).
    expect(block).not.toMatch(/background|border|padding/);
    const word = /\.search-btn \.icon-btn-label\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(word).toMatch(/white-space:\s*nowrap/);
    expect(css).not.toMatch(/--cta/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});

describe('pageHead', () => {
  it('without onSearch is the bare page title (unchanged screens)', () => {
    const el = asFake(pageHead('Calendar', undefined));
    expect(el.tag).toBe('h1');
    expect(el.classes).toContain('page-title');
    expect(el.textContent).toBe('Calendar');
  });

  it('with onSearch: a header row, the title first, then Search', () => {
    let n = 0;
    const el = asFake(pageHead('Settings', () => n++));
    expect(el.tag).toBe('header');
    expect(el.classes).toContain('page-head');
    expect(el.children.map((c) => c.tag)).toEqual(['h1', 'button']);
    expect(el.children[0]?.textContent).toBe('Settings');
    el.children[1]?.click();
    expect(n).toBe(1);
  });
});

// SPEC M13c goal 3: never on Exercise, Rest, the camera or Coach (nothing new during a set; Coach
// has its own text box). The screens that may show it are Today, Fuel, Calendar and Settings.
describe('where Search can appear', () => {
  const UI = join(__dirname);
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return files(p);
      return /\.ts$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
    });
  const users = files(UI)
    .filter((p) => !p.endsWith('searchButton.ts'))
    .filter((p) =>
      /from '\.\.?\/(\.\.\/)?searchButton'|data-search-open/.test(readFileSync(p, 'utf8')),
    )
    .map((p) => p.slice(UI.length + 1))
    .sort();

  it('only Today, Fuel, Calendar, Settings (and app.ts / the Fuel controller, which wire them) use it', () => {
    const allowed = new Set([
      'app.ts',
      'fuel/fuelController.ts',
      'screens/today.ts',
      'screens/fuel.ts',
      'screens/calendar.ts',
      'screens/settings.ts',
    ]);
    expect(users.filter((u) => !allowed.has(u))).toEqual([]);
    expect(users).toEqual(
      expect.arrayContaining([
        'screens/today.ts',
        'screens/fuel.ts',
        'screens/calendar.ts',
        'screens/settings.ts',
      ]),
    );
  });

  it('the in-set and Coach screens never reference it', () => {
    for (const f of [
      'screens/exercise.ts',
      'screens/rest.ts',
      'cameraView.ts',
      'cameraRestPanel.ts',
      'coach/chat.ts',
      'coach/coachSheet.ts',
    ]) {
      const src = readFileSync(join(UI, f), 'utf8');
      expect(src, f).not.toMatch(/searchButton|data-search-open/);
    }
  });
});
