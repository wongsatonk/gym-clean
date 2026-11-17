import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { backButton, doneMark, forwardContent } from './backButton';
import { asFake, useFakeDom, type FakeEl } from './screens/testDom';

useFakeDom();

const icons = (el: FakeEl) => el.find((e) => e.hasAttribute('data-icon'));

describe('backButton', () => {
  it('is a button: chevron-left icon (decorative) + the word, which is its accessible name', () => {
    let n = 0;
    const el = asFake(backButton(() => n++));
    expect(el.tag).toBe('button');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.classes).toEqual(expect.arrayContaining(['ghost-btn', 'back-btn']));
    expect(el.hasAttribute('data-back')).toBe(true);
    expect(el.textContent).toBe('Back');
    expect(el.getAttribute('aria-label')).toBeNull();
    const ic = icons(el);
    expect(ic.map((i) => i.getAttribute('data-icon'))).toEqual(['back']);
    expect(ic[0]?.getAttribute('aria-hidden')).toBe('true');
    el.click();
    el.click();
    expect(n).toBe(2);
  });

  it('takes a destination word and extra hooks', () => {
    const el = asFake(backButton(() => {}, 'To-dos', { 'data-intake-close': true }));
    expect(el.textContent).toBe('To-dos');
    expect(el.hasAttribute('data-intake-close')).toBe(true);
  });

  it('is at least 56px tall and wide (its own css, on top of the button rule)', () => {
    const css = readFileSync(join(__dirname, 'backButton.css'), 'utf8');
    const block = /\.back-btn\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(block).toMatch(/min-height:\s*var\(--tap-min\)/);
    expect(block).toMatch(/min-width:\s*var\(--tap-min\)/);
  });
});

describe('forwardContent / doneMark', () => {
  it('forward: the word, then the arrow-right icon', () => {
    const [word, arrow] = forwardContent('Next').map((n) => n as unknown as FakeEl);
    expect(word?.textContent).toBe('Next');
    expect(arrow?.getAttribute('data-icon')).toBe('arrow-right');
    expect(arrow?.getAttribute('aria-hidden')).toBe('true');
  });

  it('done: a check icon and the word, not a typed tick', () => {
    const el = asFake(doneMark());
    expect(el.textContent).toBe('done');
    expect(icons(el).map((i) => i.getAttribute('data-icon'))).toEqual(['check']);
  });
});

// ---------- scan: no typed "‹", "›", "✓" or "→" as a control in src/ui ----------

const UI = __dirname;
/** app.ts is left to M13 task 30 (main): it still has "✓ done" on the exercise list sheet. */
const EXCLUDED = new Set(['app.ts']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

/** String literals in code (comment lines skipped) that use a glyph as a control. */
function glyphHits(file: string, text: string): string[] {
  const hits: string[] = [];
  text.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const m of line.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) {
      const s = (m[2] ?? '').trim();
      // A chevron or tick anywhere in a shown string; an arrow at either end ("Next →").
      if (/[‹›✓✔]/.test(s) || /^→|→$/.test(s)) hits.push(`${file}:${i + 1}: ${s}`);
    }
  });
  return hits;
}

describe('no typed back / done / forward glyphs as controls', () => {
  it('the scanner catches the old forms and lets a "→" inside a sentence through', () => {
    expect(glyphHits('x.ts', "h('button', {}, '‹ Back')")).toHaveLength(1);
    expect(glyphHits('x.ts', "const l = '✓ done';")).toHaveLength(1);
    expect(glyphHits('x.ts', "h('span', {}, '→')")).toHaveLength(1);
    expect(glyphHits('x.ts', "h('span', { 'aria-hidden': 'true' }, '›')")).toHaveLength(1);
    expect(glyphHits('x.ts', 'const l = `Next →`;')).toHaveLength(1);
    expect(glyphHits('x.ts', "const t = 'Settings → Accessibility → Voices';")).toEqual([]);
    expect(glyphHits('x.ts', "// '‹ Back' in a comment")).toEqual([]);
  });

  it('src/ui has none (app.ts excluded until task 30)', () => {
    const hits = sources(UI)
      .filter((p) => !EXCLUDED.has(relative(UI, p)))
      .flatMap((p) => glyphHits(relative(UI, p), readFileSync(p, 'utf8')));
    expect(hits).toEqual([]);
  });
});
