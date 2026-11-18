// Guard test for the M4e design tokens (A2). Colours and font sizes live in the token blocks of
// src/styles.css; every other CSS rule and every src/ui/**/*.ts module uses var(--…).
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { ACCENTS, TOKEN_NAMES, cssToken, moodClass } from './tokens';
import { MOTION_OFF } from './motion';
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
const NAMED_LIST =
  'white|black|red|green|blue|yellow|orange|gray|grey|silver|purple|pink|lime|cyan|magenta|navy|teal|maroon|olive|aqua|fuchsia|gold';
const NAMED = new RegExp(`:\\s*[^;]*\\b(?:${NAMED_LIST})\\b`);
/**
 * Named colours in TS: a CSS declaration inside a string (`color:white`), a DOM / canvas
 * property assignment (`.fillStyle = 'red'`), or a colour constructor / attribute
 * (`new Color('white')`, `setAttribute('fill', 'black')`). The accent ids 'orange' / 'yellow' are
 * plain strings and don't match.
 */
const TS_NAMED = [
  new RegExp(
    `\\b(?:color|background(?:-color)?|fill|stroke|border(?:-[a-z]+)*|outline(?:-color)?|box-shadow|text-shadow)\\s*:\\s*(?:${NAMED_LIST})\\b`,
  ),
  new RegExp(
    `\\.(?:color|background(?:Color)?|fill|stroke|fillStyle|strokeStyle|shadowColor|borderColor)\\s*=\\s*['"\`](?:${NAMED_LIST})\\b`,
  ),
  new RegExp(
    `(?:Color\\(|setAttribute\\(\\s*['"\`](?:fill|stroke|color|stop-color)['"\`]\\s*,)\\s*['"\`](?:${NAMED_LIST})['"\`]`,
  ),
];
/** A literal font size in TS: inline CSS (`font-size:20px`), `.fontSize = '20px'`, canvas `ctx.font = 'bold 20px …'`. */
const TS_FONT_SIZE = [
  /font-size\s*:\s*\d/,
  /\.fontSize\s*=\s*['"`]?\d/,
  /\.font\s*=\s*['"`][^'"`]*\d+(?:px|rem|em|pt)\b/,
  /\bfont\s*:\s*[^;'"`]*\d+(?:px|rem|em|pt)\b/,
];
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
          if (
            HEX.test(line) ||
            FUNC.test(line) ||
            /\b0x[0-9a-fA-F]{6}\b/.test(line) ||
            TS_NAMED.some((re) => re.test(line))
          ) {
            bad.push(`${path}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(bad).toEqual([]);
  });

  it('no literal font size in src/ui/**/*.ts (inline styles and canvas use tokens)', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(UI_TS)) {
      if (path.endsWith('.test.ts')) continue;
      stripTsComments(src)
        .split('\n')
        .forEach((line, i) => {
          if (TS_FONT_SIZE.some((re) => re.test(line)))
            bad.push(`${path}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(bad).toEqual([]);
  });

  it('the TS guards catch what they are for (and spare accent ids)', () => {
    const named = (l: string) => TS_NAMED.some((re) => re.test(l));
    const size = (l: string) => TS_FONT_SIZE.some((re) => re.test(l));
    expect(named("el.style.cssText = 'color:white;'")).toBe(true);
    expect(named("ctx.fillStyle = 'red';")).toBe(true);
    expect(named("new THREE.Color('white')")).toBe(true);
    expect(named("p.setAttribute('fill', 'black')")).toBe(true);
    expect(named("export const ACCENTS = ['orange', 'volt', 'yellow'];")).toBe(false);
    expect(named("{ accent: 'orange', label: 'Orange' }")).toBe(false);
    expect(size("'flex:1;font-size:20px;'")).toBe(true);
    expect(size("el.style.fontSize = '28px'")).toBe(true);
    expect(size("ctx.font = 'bold 20px Barlow'")).toBe(true);
    expect(size("'font-size:var(--fs-body);'")).toBe(false);
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

  it("the accent picker swatches are each accent's --cta", () => {
    for (const accent of ACCENTS) {
      expect(hexOf(`--accent-${accent}`).toLowerCase(), accent).toBe(
        hexOf('--cta', tokenBlock(`[data-accent='${accent}']`)).toLowerCase(),
      );
      // The check drawn on the chosen swatch is --on-selected.
      expect(contrast(hexOf('--on-selected'), hexOf(`--accent-${accent}`))).toBeGreaterThanOrEqual(
        7,
      );
    }
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

  it('the sticky-bottom veil is the page colour, translucent', () => {
    const veil = (v: string | undefined) => /^rgb\((\d+) (\d+) (\d+) \/ (0?\.\d+)\)$/.exec(v ?? '');
    const page = (hex: string) => hexToRgb(hex).join(' ');
    const root = veil(ROOT['--bg-veil']);
    expect(root?.slice(1, 4).join(' ')).toBe(page(hexOf('--bg')));
    const track = tokenBlock('.mood-track');
    expect(veil(track['--bg-veil'])?.slice(1, 4).join(' ')).toBe(page(hexOf('--bg', track)));
    expect(Number(root?.[4])).toBeGreaterThanOrEqual(0.85);
  });

  it('cssToken is empty without a DOM', () => {
    expect(cssToken('--cta')).toBe('');
  });
});

// M13c task 9: the moving glow (his q1 answer). One fixed ::before layer on the non-workout
// screen roots, two soft radial glows (accent + muscle cyan at low alpha), moved by one
// transform/opacity keyframe set. These tests pin what makes it readable and cheap.
describe('moving glow background', () => {
  const css = stripComments(stylesCss);
  /** `color-mix(in srgb, var(--x) N%, transparent)` → the token it tints and its alpha. */
  function glowToken(name: string): { of: string; alpha: number } {
    const m = /^color-mix\(in srgb, var\((--[\w-]+)\) (\d+(?:\.\d+)?)%, transparent\)$/.exec(
      ROOT[name] ?? '',
    );
    if (!m) throw new Error(`${name} is not a color-mix glow: ${ROOT[name]}`);
    return { of: m[1] ?? '', alpha: Number(m[2]) / 100 };
  }
  function over(top: string, alpha: number, base: [number, number, number]) {
    const t = hexToRgb(top);
    return base.map((c, i) => c * (1 - alpha) + (t[i] ?? 0) * alpha) as [number, number, number];
  }
  const toHex = (rgb: number[]) =>
    `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

  const layerRules = rules(css).filter((r) => /animation\s*:[^;]*ambient-drift/.test(r.body));
  const keyframes = (() => {
    const start = css.indexOf('@keyframes ambient-drift');
    if (start < 0) return '';
    let depth = 0;
    let i = css.indexOf('{', start);
    const open = i;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) break;
    }
    return css.slice(open + 1, i);
  })();
  /** Highest opacity any keyframe (or the layer itself) reaches; 1 when none is set. */
  const peakOpacity = (() => {
    const all = [...keyframes.matchAll(/opacity\s*:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    const own = layerRules.flatMap((r) => decls(r.body)).find(([k]) => k === 'opacity');
    if (own) all.push(Number(own[1]));
    return all.length ? Math.max(...all) : 1;
  })();

  it('tints one glow with the accent and one with the muscle cyan, both faint', () => {
    expect(glowToken('--glow-a').of).toBe('--cta');
    expect(glowToken('--glow-b').of).toBe('--muscle');
    expect(glowToken('--glow-a').alpha).toBeLessThanOrEqual(0.2);
    expect(glowToken('--glow-b').alpha).toBeLessThanOrEqual(0.2);
  });

  // The brightest point: both glows at full strength stacked on --bg at the peak opacity (the
  // gradients start at the token colour and never overlap more than that).
  it.each(ACCENTS)(
    'accent %s: --text >= 7:1 and --text-2 >= 4.5:1 at the brightest point',
    (accent) => {
      const acc = tokenBlock(`[data-accent='${accent}']`);
      const a = glowToken('--glow-a');
      const b = glowToken('--glow-b');
      let px = hexToRgb(hexOf('--bg'));
      px = over(hexOf(a.of, acc), a.alpha * peakOpacity, px);
      px = over(hexOf(b.of, acc), b.alpha * peakOpacity, px);
      const brightest = toHex(px);
      expect(contrast(hexOf('--text'), brightest)).toBeGreaterThanOrEqual(7);
      expect(contrast(hexOf('--text-2'), brightest)).toBeGreaterThanOrEqual(4.5);
      // The action colour still stands out from the page as a graphic.
      expect(contrast(hexOf('--cta', acc), brightest)).toBeGreaterThanOrEqual(3);
    },
  );

  it('is one fixed, pre-composited ::before layer drawn only from the glow tokens', () => {
    expect(layerRules).toHaveLength(1);
    const layer = layerRules[0] as Rule;
    expect(layer.selector).toMatch(/::before$/);
    const d = Object.fromEntries(decls(layer.body));
    expect(d['position']).toBe('fixed');
    expect(d['will-change']).toBe('transform');
    expect(d['pointer-events']).toBe('none');
    const bgVars = [...(d['background'] ?? '').matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]);
    expect(new Set(bgVars)).toEqual(new Set(['--glow-a', '--glow-b']));
    expect(d['background']).toMatch(/radial-gradient/);
    // iOS ignores background-attachment: fixed; no filter / blend work per frame either.
    for (const k of ['background-attachment', 'filter', 'backdrop-filter', 'mix-blend-mode'])
      expect(d, k).not.toHaveProperty(k);
  });

  it('never runs on in-workout screens, sheets or the black Track mood', () => {
    const sel = (layerRules[0] as Rule).selector.replace(/"/g, "'");
    expect(sel).not.toMatch(/mood-track/);
    for (const hook of MOTION_OFF.replace(/"/g, "'").split(/,\s*/))
      expect(sel, hook).toContain(hook);
    expect(sel).toContain('.sheet');
    expect(sel).toMatch(/\.mood-energy/);
    expect(sel).toMatch(/\.mood-pro/);
    expect(sel).toMatch(/:not\(\[data-background='plain'\]\)/);
  });

  it('the keyframes move only transform and opacity, slowly, with a small travel', () => {
    expect(keyframes).toMatch(/transform/);
    const props = new Set(
      [...keyframes.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]).filter((p) => p !== undefined),
    );
    expect([...props].every((p) => p === 'transform' || p === 'opacity')).toBe(true);
    expect(peakOpacity).toBeLessThanOrEqual(1);
    for (const m of keyframes.matchAll(/translate3?d?\(([^)]*)\)/g)) {
      for (const v of (m[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)) {
        expect(v, m[0]).toMatch(/^-?\d+(\.\d+)?%$|^0$/);
        expect(Math.abs(parseFloat(v)), m[0]).toBeLessThanOrEqual(6);
      }
    }
    const d = Object.fromEntries(decls((layerRules[0] as Rule).body));
    const secs = Number(/(\d+(?:\.\d+)?)s/.exec(d['animation'] ?? '')?.[1]);
    // One there-and-back cycle (alternate) of 40–60 s.
    expect(d['animation']).toMatch(/alternate/);
    expect(d['animation']).toMatch(/infinite/);
    expect(2 * secs).toBeGreaterThanOrEqual(40);
    expect(2 * secs).toBeLessThanOrEqual(60);
  });

  it('pauses on html[data-ambient=paused]; Plain removes the layer', () => {
    const paused = rules(css).filter((r) => r.selector.includes("html[data-ambient='paused']"));
    expect(paused.some((r) => /animation-play-state\s*:\s*paused/.test(r.body))).toBe(true);
    expect(paused.every((r) => r.selector.endsWith('::before'))).toBe(true);
    // Plain: the layer's selector requires :not([data-background='plain']), so Plain has no
    // ::before at all (checked above); nothing else may draw the glow tokens.
    const users = rules(css).filter((r) => /var\(--glow-[ab]\)/.test(r.body));
    expect(users).toEqual(layerRules);
  });

  it('launch colour and page colour are unchanged (#0d0f12)', () => {
    expect(hexOf('--bg').toLowerCase()).toBe('#0d0f12');
  });
});
