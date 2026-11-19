// M13d task 36 (SPEC M13d Goal 7): the shared round icon button. Render tests run on the fake
// DOM; the CSS checks read iconButton.css and styles.css from disk (sizes, press animation,
// reduced motion, focus ring) and the contrast checks resolve the variant tokens to hex.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ICON_BTN_CIRCLE_PX,
  ICON_BTN_COLOURS,
  ICON_BTN_VARIANTS,
  iconButton,
  iconButtonLayout,
  setPressFeel,
  type IconButtonVariant,
} from './iconButton';
import { ICON_PX } from './icons';
import { asFake, useFakeDom, type FakeEl } from './screens/testDom';

useFakeDom();

afterEach(() => setPressFeel(null));

const css = readFileSync(join(__dirname, 'iconButton.css'), 'utf8');
const stylesCss = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** Declarations of every innermost rule whose selector list contains `selector` exactly. */
function block(source: string, selector: string): string {
  return [...strip(source).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) =>
      (m[1] ?? '')
        .split(',')
        .map((s) => s.trim().replace(/\s+/g, ' '))
        .includes(selector),
    )
    .map((m) => m[2] ?? '')
    .join('\n');
}

/** The body of the first `@media (prefers-reduced-motion: reduce)` block in `source`. */
function reducedBlock(source: string): string {
  const s = strip(source);
  const at = s.indexOf('@media (prefers-reduced-motion: reduce)');
  if (at < 0) return '';
  let depth = 0;
  const open = s.indexOf('{', at);
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    if (s[i] === '}' && --depth === 0) return s.slice(open + 1, i);
  }
  return '';
}

const pressDown = (el: FakeEl, ev: Partial<PointerEvent> = {}) =>
  el.dispatch('pointerdown', { isPrimary: true, button: 0, ...ev });

describe('iconButtonLayout (pure)', () => {
  it('main is a 72px circle with the large icon and the word beside it', () => {
    expect(iconButtonLayout('main')).toEqual({ circlePx: 72, iconSize: 'lg', labelAt: 'beside' });
  });

  it('the others are 56px circles with the medium icon and the word below', () => {
    for (const v of ['secondary', 'quiet', 'danger'] as const) {
      expect(iconButtonLayout(v)).toEqual({ circlePx: 56, iconSize: 'md', labelAt: 'below' });
    }
  });

  it('labelAt can be overridden either way', () => {
    expect(iconButtonLayout('main', 'below').labelAt).toBe('below');
    expect(iconButtonLayout('secondary', 'beside').labelAt).toBe('beside');
  });

  it('every circle is at least 56px, the main one at least 72px, and the icon fits inside', () => {
    for (const v of ICON_BTN_VARIANTS) {
      const { circlePx, iconSize } = iconButtonLayout(v);
      expect(circlePx).toBe(ICON_BTN_CIRCLE_PX[v]);
      expect(circlePx).toBeGreaterThanOrEqual(v === 'main' ? 72 : 56);
      expect(ICON_PX[iconSize]).toBeLessThanOrEqual(circlePx / 2);
    }
  });
});

describe('iconButton render', () => {
  it('is a <button type=button> with the hooks, a decorative icon and the word as its name', () => {
    let taps = 0;
    const el = asFake(iconButton({ icon: 'check', label: 'Save', onClick: () => taps++ }));
    expect(el.tag).toBe('button');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.hasAttribute('data-icon-btn')).toBe(true);
    expect(el.getAttribute('data-variant')).toBe('secondary');
    expect(el.getAttribute('data-label-at')).toBe('below');
    expect(el.classes).toContain('icon-btn');
    expect(el.textContent).toBe('Save');
    expect(el.getAttribute('aria-label')).toBeNull();
    const ics = el.find((e) => e.hasAttribute('data-icon'));
    expect(ics.map((i) => i.getAttribute('data-icon'))).toEqual(['check']);
    expect(ics[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(el.oneByClass('icon-btn-circle').getAttribute('aria-hidden')).toBe('true');
    expect(el.oneByClass('icon-btn-label').textContent).toBe('Save');
    el.click();
    el.click();
    expect(taps).toBe(2);
  });

  it('passes the button to onClick (screens hand focus back to it)', () => {
    let got: unknown;
    const el = iconButton({ icon: 'gear', label: 'Settings', onClick: (b) => (got = b) });
    asFake(el).click();
    expect(got).toBe(el);
  });

  it('main: large icon, word beside; secondary/quiet/danger: medium icon, word below', () => {
    for (const v of ICON_BTN_VARIANTS) {
      const el = asFake(iconButton({ icon: 'play', label: 'Go', variant: v, onClick: () => {} }));
      expect(el.getAttribute('data-variant')).toBe(v);
      const ic = el.find((e) => e.hasAttribute('data-icon'))[0];
      expect(ic?.getAttribute('width')).toBe(String(ICON_PX[iconButtonLayout(v).iconSize]));
      expect(el.getAttribute('data-label-at')).toBe(iconButtonLayout(v).labelAt);
    }
  });

  it('the circle comes first, then the word', () => {
    const el = asFake(
      iconButton({ icon: 'play', label: 'Start', variant: 'main', onClick: () => {} }),
    );
    expect(el.children.map((c) => c.classes[0])).toEqual(['icon-btn-circle', 'icon-btn-label']);
  });

  it('ariaLabel only when the visible word is shortened', () => {
    const el = asFake(
      iconButton({ icon: 'back', label: 'Back', ariaLabel: 'Back to To-dos', onClick: () => {} }),
    );
    expect(el.getAttribute('aria-label')).toBe('Back to To-dos');
    expect(el.textContent).toBe('Back');
  });

  it('wideHit marks the row as the tap area; extra hooks, class and disabled pass through', () => {
    const el = asFake(
      iconButton({
        icon: 'arrow-right',
        label: 'Next',
        variant: 'main',
        wideHit: true,
        class: 'first-run-next',
        hooks: { 'data-first-run-next': true, 'data-step': 'units' },
        disabled: true,
        onClick: () => {},
      }),
    );
    expect(el.hasAttribute('data-wide-hit')).toBe(true);
    expect(el.classes).toEqual(['icon-btn', 'first-run-next']);
    expect(el.hasAttribute('data-first-run-next')).toBe(true);
    expect(el.getAttribute('data-step')).toBe('units');
    expect(el.hasAttribute('disabled')).toBe(true);
    const plain = asFake(iconButton({ icon: 'plus', label: 'Add', onClick: () => {} }));
    expect(plain.hasAttribute('data-wide-hit')).toBe(false);
    expect(plain.hasAttribute('disabled')).toBe(false);
  });
});

describe('labelContent (M13d task 40a)', () => {
  it('fills the word span with richer content (two lines); ariaLabel names the button', () => {
    const day = document.createElement('b');
    day.textContent = 'Pull A';
    const pos = document.createElement('small');
    pos.textContent = '3 of 5';
    const el = asFake(
      iconButton({
        icon: 'list',
        label: 'Pull A',
        labelAt: 'beside',
        ariaLabel: 'Pull A, 3 of 5, Exercise list',
        labelContent: [day, pos],
        onClick: () => {},
      }),
    );
    const word = el.oneByClass('icon-btn-label');
    expect(word.children.map((c) => c.textContent)).toEqual(['Pull A', '3 of 5']);
    expect(el.getAttribute('aria-label')).toBe('Pull A, 3 of 5, Exercise list');
  });
});

describe('press feel hook (setPressFeel)', () => {
  // M13d Wave A follow-up (c): the haptic fires on the click (pointerup without a cancel), not on
  // pointerdown, so a scroll that starts on a button never buzzes.
  it('is a no-op by default: pressing a main button without a hook throws nothing', () => {
    const el = asFake(
      iconButton({ icon: 'play', label: 'Start', variant: 'main', onClick: () => {} }),
    );
    expect(() => el.click()).not.toThrow();
  });

  it('fires once per click on a main button, never on pointerdown alone or on the others', () => {
    const feel = vi.fn();
    setPressFeel(feel);
    const main = asFake(
      iconButton({ icon: 'play', label: 'Start', variant: 'main', onClick: () => {} }),
    );
    main.click();
    expect(feel).toHaveBeenCalledTimes(1);
    main.click();
    expect(feel).toHaveBeenCalledTimes(2);
    for (const v of ['secondary', 'quiet', 'danger'] as const) {
      const other = asFake(
        iconButton({ icon: 'close', label: 'Close', variant: v, onClick: () => {} }),
      );
      pressDown(other);
      other.click();
    }
    expect(feel).toHaveBeenCalledTimes(2);
  });

  it('a pointerdown that becomes a scroll (pointercancel, no click) never buzzes', () => {
    const feel = vi.fn();
    setPressFeel(feel);
    const main = asFake(
      iconButton({ icon: 'play', label: 'Start', variant: 'main', onClick: () => {} }),
    );
    pressDown(main);
    main.dispatch('pointercancel', { isPrimary: true });
    expect(feel).not.toHaveBeenCalled();
  });

  it('the feel comes before the action (an action that re-renders still gets its tap)', () => {
    const order: string[] = [];
    setPressFeel(() => order.push('feel'));
    const main = asFake(
      iconButton({
        icon: 'check',
        label: 'Save',
        variant: 'main',
        onClick: () => order.push('click'),
      }),
    );
    main.click();
    expect(order).toEqual(['feel', 'click']);
  });

  it('uses the hook set at press time (main wires it after screens are built)', () => {
    const main = asFake(
      iconButton({ icon: 'check', label: 'Save', variant: 'main', onClick: () => {} }),
    );
    const late = vi.fn();
    setPressFeel(late);
    main.click();
    expect(late).toHaveBeenCalledTimes(1);
    setPressFeel(null);
    main.click();
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('skips a disabled button', () => {
    const feel = vi.fn();
    setPressFeel(feel);
    const off = asFake(
      iconButton({
        icon: 'play',
        label: 'Start',
        variant: 'main',
        disabled: true,
        onClick: () => {},
      }),
    );
    off.click();
    expect(feel).not.toHaveBeenCalled();
  });

  it('a throwing or rejecting hook never breaks the click', async () => {
    let taps = 0;
    setPressFeel(() => {
      throw new Error('no haptics');
    });
    const main = asFake(
      iconButton({ icon: 'play', label: 'Start', variant: 'main', onClick: () => taps++ }),
    );
    expect(() => main.click()).not.toThrow();
    expect(taps).toBe(1);
    const rejected = vi.fn(() => Promise.reject(new Error('plugin missing')));
    setPressFeel(rejected);
    expect(() => main.click()).not.toThrow();
    await Promise.resolve();
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(taps).toBe(2);
  });
});

describe('iconButton.css', () => {
  it('the tap tokens are 56px and 72px', () => {
    const root = block(stylesCss, ':root');
    expect(root).toMatch(/--tap-min:\s*56px/);
    expect(root).toMatch(/--tap-cta:\s*72px/);
  });

  it('the button is at least 56px both ways; circles are 56px, the main one 72px', () => {
    const btn = block(css, '.icon-btn');
    expect(btn).toMatch(/min-height:\s*var\(--tap-min\)/);
    expect(btn).toMatch(/min-width:\s*var\(--tap-min\)/);
    const circle = block(css, '.icon-btn-circle');
    expect(circle).toMatch(/width:\s*var\(--tap-min\)/);
    expect(circle).toMatch(/height:\s*var\(--tap-min\)/);
    expect(circle).toMatch(/border-radius:\s*50%/);
    const main = block(css, ".icon-btn[data-variant='main'] .icon-btn-circle");
    expect(main).toMatch(/width:\s*var\(--tap-cta\)/);
    expect(main).toMatch(/height:\s*var\(--tap-cta\)/);
  });

  it('wideHit makes the whole row the tap area', () => {
    expect(block(css, '.icon-btn[data-wide-hit]')).toMatch(/width:\s*100%/);
  });

  it('the word is at least body size (20px)', () => {
    const word = block(css, '.icon-btn-label');
    expect(word).toMatch(/font-size:\s*var\(--fs-(body|cue|lead|head|title)\)/);
  });

  it('press: scale 0.92 on the circle and the glow fades in, transform/opacity only', () => {
    const pressed = block(css, '.icon-btn:active:not(:disabled) .icon-btn-circle');
    expect(pressed).toMatch(/transform:\s*scale\(0\.92\)/);
    const glow = block(css, '.icon-btn:active:not(:disabled) .icon-btn-circle::after');
    expect(glow).toMatch(/opacity:\s*1/);
    const transitions = [...strip(css).matchAll(/transition(?:-property)?:([^;]*);/g)].map(
      (m) => m[1] ?? '',
    );
    expect(transitions.length).toBeGreaterThan(0);
    for (const t of transitions) {
      for (const part of t.split(',')) {
        const prop = part.trim().split(/\s+/)[0];
        expect(['transform', 'opacity', 'none']).toContain(prop);
      }
    }
  });

  it('timings come from the motion tokens (fast = 120ms, within 200ms), spring on release', () => {
    expect(block(stylesCss, ':root')).toMatch(/--dur-fast:\s*120ms/);
    const timings = [...strip(css).matchAll(/(?:transition|animation)[a-z-]*:([^;]*);/g)].map(
      (m) => m[1] ?? '',
    );
    for (const t of timings) expect(t).not.toMatch(/\b\d*\.?\d+m?s\b/);
    expect(block(css, '.icon-btn-circle')).toMatch(/var\(--ease-spring\)/);
  });

  it('the global 0.97 press shrink does not stack on the whole button', () => {
    expect(block(css, '.icon-btn:active:not(:disabled)')).toMatch(/transform:\s*none/);
  });

  it('reduced motion: no scale and no glow, a colour change only', () => {
    // M13d follow-up (d): the rules live in the ONE reduced-motion block in styles.css, lifted by
    // :root over iconButton.css (which loads after styles.css); iconButton.css has none of its own.
    expect(reducedBlock(css)).toBe('');
    const rm = reducedBlock(stylesCss);
    expect(rm).not.toBe('');
    expect(rm).toMatch(
      /:root \.icon-btn:active:not\(:disabled\) \.icon-btn-circle\s*\{[^}]*transform:\s*none/,
    );
    expect(rm).toMatch(/:root \.icon-btn-circle::after\s*\{[^}]*display:\s*none/);
    // The colour change that stays: the pressed circle brightens (no motion involved).
    expect(block(css, '.icon-btn:active:not(:disabled) .icon-btn-circle')).toMatch(
      /filter:\s*brightness/,
    );
  });

  it('motion-off screens (Exercise, camera) get the look but not the scale or glow', () => {
    const s = strip(css).replace(/\s+/g, ' ');
    expect(s).toMatch(
      /\[data-motion='off'\][^{]*\[data-screen='exercise'\][^{]*\.camera-sheet[^{]*\.icon-btn:active:not\(:disabled\) \.icon-btn-circle\s*\{[^}]*transform:\s*none/,
    );
  });

  it('a visible focus ring on the circle, in the focus colour', () => {
    const ring = block(css, '.icon-btn:focus-visible .icon-btn-circle');
    expect(ring).toMatch(/outline:\s*3px solid var\(--focus\)/);
    expect(ring).toMatch(/outline-offset:\s*3px/);
  });

  it('every variant sets the colour tokens the table names', () => {
    for (const v of ICON_BTN_VARIANTS) {
      const b = block(css, `.icon-btn[data-variant='${v}']`);
      const c = ICON_BTN_COLOURS[v];
      expect(b, v).toMatch(
        new RegExp(`--ib-fill:\\s*${c.fill ? `var\\(${c.fill}\\)` : 'transparent'}`),
      );
      expect(b, v).toMatch(new RegExp(`--ib-ink:\\s*var\\(${c.ink}\\)`));
      expect(b, v).toMatch(new RegExp(`--ib-word:\\s*var\\(${c.word}\\)`));
    }
    const circle = block(css, '.icon-btn-circle');
    expect(circle).toMatch(/background:\s*var\(--ib-fill\)/);
    expect(circle).toMatch(/color:\s*var\(--ib-ink\)/);
    expect(block(css, '.icon-btn-label')).toMatch(/color:\s*var\(--ib-word\)/);
  });
});

// ---- contrast (WCAG 2.x), tokens resolved from styles.css ----
function tokens(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of block(stylesCss, selector).split(';')) {
    const i = d.indexOf(':');
    const k = d.slice(0, i).trim();
    if (k.startsWith('--')) out[k] = d.slice(i + 1).trim();
  }
  return out;
}
const ROOT = tokens(':root');
function hexOf(name: string, over: Record<string, string>): string {
  let v = over[name] ?? ROOT[name];
  for (let i = 0; i < 5 && v?.startsWith('var('); i++) {
    const ref = /var\((--[\w-]+)\)/.exec(v)?.[1] ?? '';
    v = over[ref] ?? ROOT[ref];
  }
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} is not a hex colour: ${v}`);
  return v;
}
function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES: Record<string, Record<string, string>> = {
  default: {},
  ...Object.fromEntries(
    ['orange', 'volt', 'yellow'].map((a) => [a, tokens(`[data-accent='${a}']`)]),
  ),
  track: tokens('.mood-track'),
};

describe('contrast per variant (ui-ux-pro-max: icon and word >= 4.5:1, focus ring >= 3:1)', () => {
  const pages = ['--bg', '--surface'] as const;

  it.each(ICON_BTN_VARIANTS.map((v) => [v] as [IconButtonVariant]))(
    '%s: icon on its circle and the word on the page',
    (v) => {
      const c = ICON_BTN_COLOURS[v];
      for (const [theme, over] of Object.entries(THEMES)) {
        const fills = c.fill ? [c.fill] : pages;
        for (const f of fills) {
          expect(
            contrast(hexOf(c.ink, over), hexOf(f, over)),
            `${v} ink/${f} ${theme}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
        for (const p of pages) {
          expect(
            contrast(hexOf(c.word, over), hexOf(p, over)),
            `${v} word/${p} ${theme}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it('the focus ring shows against the page and the cards', () => {
    for (const [theme, over] of Object.entries(THEMES)) {
      for (const p of pages) {
        expect(
          contrast(hexOf('--focus', over), hexOf(p, over)),
          `${theme} ${p}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
