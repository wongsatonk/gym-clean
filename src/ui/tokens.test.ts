// Guard test for the M4e design tokens (A2). Colours and font sizes live in the token blocks of
// src/styles.css; every other CSS rule and every src/ui/**/*.ts module uses var(--…).
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { ACCENTS, TOKEN_NAMES, cssToken, moodClass } from './tokens';
import { FIGURE_TOKEN_FALLBACK } from './body3d/palette';

// Vitest replaces CSS imports (even `?raw`) with '' unless css.include matches, so the
// stylesheets are listed with a lazy glob and read from disk.
const readRaw = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const stylesCss = readRaw('../styles.css');
const UI_CSS: Record<string, string> = Object.fromEntries(
  Object.keys(import.meta.glob('./**/*.css')).map((p) => [p, readRaw(p)]),
);
const UI_TS = import.meta.glob<string>('./**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const CSS_FILES: Record<string, string> = { '../styles.css': stylesCss, ...UI_CSS };

/**
 * Files that may still hold colour literals, by name, with the task that removes them.
 * Paths are relative to src/ui. A trailing '/' covers a folder.
 */
const COLOUR_ALLOW_LIST: Record<string, string> = {
  './body3d/palette.ts':
    'FIGURE_TOKEN_FALLBACK: the one fallback copy of the figure tokens (checked below)',
};

const TOKEN_SELECTORS = new Set([
  ':root',
  '.mood-energy',
  '.mood-pro',
  '.mood-track',
  "[data-accent='orange']",
  "[data-accent='volt']",
  "[data-accent='yellow']",
]);

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNC = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/;
const NAMED =
  /:\s*[^;]*\b(?:white|black|red|green|blue|yellow|orange|gray|grey|silver|purple|pink|lime|cyan|magenta)\b/;
const COLOUR_PROPS =
  /^(?:color|background(?:-color)?|border(?:-[a-z]+)*|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration(?:-color)?)$/;

type Rule = { selector: string; body: string };

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Innermost `selector { declarations }` blocks; @media wrappers fall away. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: (m[1] ?? '').trim().replace(/\s+/g, ' '), body: m[2] ?? '' });
  }
  return out;
}

function decls(body: string): [string, string][] {
  return body
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.includes(':'))
    .map((d) => {
      const i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
    });
}

function tokenBlock(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rules(stylesCss).filter((x) => x.selector === selector)) {
    for (const [k, v] of decls(r.body)) if (k.startsWith('--')) out[k] = v;
  }
  return out;
}

function stripTsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function allowListed(path: string): boolean {
  return Object.keys(COLOUR_ALLOW_LIST).some((k) =>
    k.endsWith('/') ? path.startsWith(`./${k}`) : path === k,
  );
}

// ---- contrast (WCAG 2.x) ----
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const ROOT = tokenBlock(':root');
/** A token's hex, following var(--x) aliases through :root (and an override block). */
function hexOf(name: string, over: Record<string, string> = {}): string {
  let v = over[name] ?? ROOT[name];
  for (let i = 0; i < 5 && v?.startsWith('var('); i++) {
    const ref = /var\((--[\w-]+)\)/.exec(v)?.[1] ?? '';
    v = over[ref] ?? ROOT[ref];
  }
  if (!v || !HEX.test(v)) throw new Error(`${name} is not a hex colour: ${v}`);
  return v;
}

describe('design tokens: guard', () => {
  it('finds the stylesheets and modules it guards', () => {
    expect(Object.keys(CSS_FILES).length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(UI_TS)).toContain('./tokens.ts');
  });

  it('defines every named token on :root', () => {
    for (const name of TOKEN_NAMES) expect(ROOT, name).toHaveProperty(name);
  });

  it.each(Object.keys(CSS_FILES))('%s: no colour literal outside the token blocks', (file) => {
    const bad: string[] = [];
    for (const r of rules(CSS_FILES[file] ?? '')) {
      if (TOKEN_SELECTORS.has(r.selector)) continue;
      for (const [prop, value] of decls(r.body)) {
        const named =
          COLOUR_PROPS.test(prop) && NAMED.test(`:${value.replace(/var\([^)]*\)/g, '')}`);
        if (HEX.test(value) || FUNC.test(value) || named)
          bad.push(`${r.selector} { ${prop}: ${value} }`);
      }
    }
    expect(bad).toEqual([]);
  });

  it.each(Object.keys(CSS_FILES))('%s: every font-size is a token', (file) => {
    const bad: string[] = [];
    for (const r of rules(CSS_FILES[file] ?? '')) {
      if (TOKEN_SELECTORS.has(r.selector)) continue;
      for (const [prop, value] of decls(r.body)) {
        if (prop === 'font-size' && !value.includes('var(')) bad.push(`${r.selector}: ${value}`);
        if (prop === 'font' && /\d(px|rem|em)\b/.test(value))
          bad.push(`${r.selector}: font: ${value}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every var(--x) used in CSS is defined somewhere', () => {
    const defined = new Set<string>();
    const used = new Map<string, string>();
    for (const [file, css] of Object.entries(CSS_FILES)) {
      const clean = stripComments(css);
      for (const m of clean.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1] ?? '');
      // Only uses without a fallback must resolve.
      for (const m of clean.matchAll(/var\((--[\w-]+)\s*\)/g)) used.set(m[1] ?? '', file);
    }
    const missing = [...used].filter(([name]) => !defined.has(name));
    expect(missing).toEqual([]);
  });

  it('no colour literal in src/ui/**/*.ts (outside the allow-list)', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(UI_TS)) {
      if (path.endsWith('.test.ts') || allowListed(path)) continue;
      stripTsComments(src)
        .split('\n')
        .forEach((line, i) => {
          if (HEX.test(line) || FUNC.test(line) || /\b0x[0-9a-fA-F]{6}\b/.test(line)) {
            bad.push(`${path}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(bad).toEqual([]);
  });

  it('every allow-list entry names a file or folder that exists', () => {
    for (const key of Object.keys(COLOUR_ALLOW_LIST)) {
      const hit = Object.keys(UI_TS).some((p) =>
        key.endsWith('/') ? p.startsWith(`./${key}`) : p === key,
      );
      expect(hit, key).toBe(true);
    }
  });

  it('the 3D figure fallback matches the :root tokens', () => {
    for (const [name, hex] of Object.entries(FIGURE_TOKEN_FALLBACK)) {
      expect(hex.toLowerCase(), name).toBe(hexOf(name).toLowerCase());
    }
  });

  it('index.html theme-color is the page background', () => {
    const m = /name="theme-color" content="(#[0-9a-fA-F]{6})"/.exec(indexHtml);
    expect(m?.[1]?.toLowerCase()).toBe(hexOf('--bg').toLowerCase());
  });
});

describe('design tokens: themes and moods', () => {
  it('defines the three accents, Volt also swapping success to gold', () => {
    expect(ACCENTS).toEqual(['orange', 'volt', 'yellow']);
    expect(tokenBlock("[data-accent='orange']")).toEqual({
      '--cta': ROOT['--cta'],
      '--on-cta': ROOT['--on-cta'],
    });
    const volt = tokenBlock("[data-accent='volt']");
    expect(volt['--cta']?.toLowerCase()).toBe('#c8f31d');
    expect(volt['--on-cta']?.toLowerCase()).toBe('#12160a');
    expect(volt['--success']?.toLowerCase()).toBe('#ffc94d');
    expect(volt['--on-success']?.toLowerCase()).toBe('#221800');
    const yellow = tokenBlock("[data-accent='yellow']");
    expect(yellow['--cta']?.toLowerCase()).toBe('#ffd60a');
    expect(yellow['--on-cta']?.toLowerCase()).toBe('#000000');
    expect(ROOT['--cta']?.toLowerCase()).toBe('#ff7a1a');
    expect(ROOT['--on-cta']?.toLowerCase()).toBe('#1a0b00');
  });

  it('defines the three moods', () => {
    expect(tokenBlock('.mood-energy')).toMatchObject({
      '--ember': '#3d1c0a',
      '--ember-hi': '#5a2a0e',
    });
    expect(tokenBlock('.mood-pro')).toHaveProperty('--r-card');
    expect(tokenBlock('.mood-track')).toMatchObject({ '--bg': '#000000', '--line': '#3a3a3a' });
    expect(moodClass('track')).toBe('mood-track');
  });

  const backgrounds: [string, Record<string, string>][] = [
    ['bg', {}],
    ['track bg', tokenBlock('.mood-track')],
  ];

  it.each(ACCENTS)('accent %s: on-cta on cta >= 7:1, cta on bg >= 3:1', (accent) => {
    const over = tokenBlock(`[data-accent='${accent}']`);
    expect(contrast(hexOf('--on-cta', over), hexOf('--cta', over))).toBeGreaterThanOrEqual(7);
    for (const [, mood] of backgrounds) {
      const all = { ...mood, ...over };
      expect(contrast(hexOf('--cta', all), hexOf('--bg', all))).toBeGreaterThanOrEqual(3);
      expect(contrast(hexOf('--cta', all), hexOf('--surface', all))).toBeGreaterThanOrEqual(3);
    }
    // Success stays readable under every accent (Volt swaps it to gold).
    expect(contrast(hexOf('--on-success', over), hexOf('--success', over))).toBeGreaterThanOrEqual(
      7,
    );
    expect(contrast(hexOf('--success', over), hexOf('--surface', over))).toBeGreaterThanOrEqual(3);
  });

  // Text pairs >= 4.5:1, graphics >= 3:1 (README contrast table).
  it.each([
    ['--text', '--bg', 4.5],
    ['--text', '--surface-2', 4.5],
    ['--text-2', '--bg', 4.5],
    ['--text-2', '--surface', 4.5],
    ['--text-2', '--surface-2', 4.5],
    ['--cue', '--surface', 4.5],
    ['--cue', '--surface-2', 4.5],
    ['--danger', '--bg', 4.5],
    ['--on-danger', '--danger', 4.5],
    ['--warn', '--surface', 4.5],
    ['--on-selected', '--selected', 4.5],
    ['--muscle', '--body', 3],
    ['--edge', '--stage-2', 3],
  ] as const)('%s on %s >= %s:1', (fg, bg, min) => {
    expect(contrast(hexOf(fg), hexOf(bg))).toBeGreaterThanOrEqual(min);
  });

  it('Energy text stays readable on ember', () => {
    const energy = tokenBlock('.mood-energy');
    expect(contrast(hexOf('--text'), hexOf('--ember', energy))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hexOf('--text-2'), hexOf('--ember-hi', energy))).toBeGreaterThanOrEqual(4.5);
  });

  it('cssToken is empty without a DOM', () => {
    expect(cssToken('--cta')).toBe('');
  });
});
