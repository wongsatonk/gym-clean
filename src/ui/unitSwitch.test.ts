// M13d task 13b (SPEC M13d Goal 3): the unit switch. Render tests run on the fake DOM; the CSS
// checks read unitSwitch.css from disk (sizes, fill) and the contrast checks resolve the tokens
// in styles.css to hex for every theme.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { asFake, useFakeDom, type FakeEl } from './screens/testDom';
import {
  HEIGHT_UNIT_SWITCH,
  TAPE_UNIT_SWITCH,
  WEIGHT_UNIT_SWITCH,
  setUnitSwitch,
  unitSwitch,
  type UnitSwitchSpec,
} from './unitSwitch';

useFakeDom();

const opts = (el: FakeEl) => el.byTag('button');
const pressed = (el: FakeEl) =>
  opts(el)
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.getAttribute('data-unit'));

describe('unitSwitch render', () => {
  it.each([
    [WEIGHT_UNIT_SWITCH, 'Weight unit', ['kg', 'lb'], ['kg', 'lb']],
    [HEIGHT_UNIT_SWITCH, 'Height unit', ['cm', 'in'], ['cm', 'ft·in']],
    [TAPE_UNIT_SWITCH, 'Measurement unit', ['cm', 'in'], ['cm', 'in']],
  ] as [UnitSwitchSpec<string>, string, string[], string[]][])(
    '%#: a named group of two buttons with the visible words as names',
    (spec, name, units, words) => {
      const el = asFake(unitSwitch({ ...spec, value: units[0] ?? '', onChange: () => {} }));
      expect(el.tag).toBe('div');
      expect(el.getAttribute('role')).toBe('group');
      expect(el.getAttribute('aria-label')).toBe(name);
      const bs = opts(el);
      expect(bs).toHaveLength(2);
      expect(bs.map((b) => b.getAttribute('data-unit'))).toEqual(units);
      expect(bs.map((b) => b.textContent)).toEqual(words);
      for (const b of bs) {
        expect(b.getAttribute('type')).toBe('button');
        // The visible word is the name: no aria-label that could disagree with it.
        expect(b.getAttribute('aria-label')).toBeNull();
      }
    },
  );

  it('the active option is filled and pressed, the other not', () => {
    const el = asFake(unitSwitch({ ...WEIGHT_UNIT_SWITCH, value: 'lb', onChange: () => {} }));
    const [kg, lb] = opts(el) as [FakeEl, FakeEl];
    expect(lb.getAttribute('aria-pressed')).toBe('true');
    expect(lb.classes).toContain('active');
    expect(kg.getAttribute('aria-pressed')).toBe('false');
    expect(kg.classes).not.toContain('active');
    expect(el.getAttribute('data-value')).toBe('lb');
  });

  it('a tap on the other option: one callback with its unit, and the fill moves', () => {
    const onChange = vi.fn();
    const el = asFake(unitSwitch({ ...HEIGHT_UNIT_SWITCH, value: 'cm', onChange }));
    const [cm, ftin] = opts(el) as [FakeEl, FakeEl];
    ftin.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('in');
    expect(pressed(el)).toEqual(['in']);
    expect(ftin.classes).toContain('active');
    expect(el.getAttribute('data-value')).toBe('in');
    cm.click();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('cm');
    expect(pressed(el)).toEqual(['cm']);
  });

  it('a tap on the active option calls nothing (even after a switch)', () => {
    const onChange = vi.fn();
    const el = asFake(unitSwitch({ ...TAPE_UNIT_SWITCH, value: 'cm', onChange }));
    const [cm, inch] = opts(el) as [FakeEl, FakeEl];
    cm.click();
    cm.click();
    expect(onChange).not.toHaveBeenCalled();
    inch.click();
    inch.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(pressed(el)).toEqual(['in']);
  });

  it('setUnitSwitch re-shows a unit chosen elsewhere without a callback', () => {
    const onChange = vi.fn();
    const g = unitSwitch({ ...WEIGHT_UNIT_SWITCH, value: 'kg', onChange });
    const el = asFake(g);
    setUnitSwitch(g, 'lb');
    expect(pressed(el)).toEqual(['lb']);
    expect(onChange).not.toHaveBeenCalled();
    // Now lb is the active one: tapping it does nothing, tapping kg calls once.
    const [kg, lb] = opts(el) as [FakeEl, FakeEl];
    lb.click();
    expect(onChange).not.toHaveBeenCalled();
    kg.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('kg');
  });

  it('class and hooks land on the group', () => {
    const el = asFake(
      unitSwitch({
        ...WEIGHT_UNIT_SWITCH,
        value: 'kg',
        class: 'fs-unit',
        hooks: { 'data-field': 'weight' },
        onChange: () => {},
      }),
    );
    expect(el.classes).toEqual(['unit-switch', 'fs-unit']);
    expect(el.getAttribute('data-field')).toBe('weight');
    expect(el.hasAttribute('data-unit-switch')).toBe(true);
  });
});

// ---- CSS (read from disk) ----
const css = readFileSync(join(__dirname, 'unitSwitch.css'), 'utf8');
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

describe('unitSwitch.css', () => {
  it('each option is at least 56px tall and wide, words at the body size', () => {
    const opt = block(css, '.unit-switch-opt');
    expect(opt).toMatch(/min-height:\s*var\(--tap-min\)/);
    expect(opt).toMatch(/min-width:\s*var\(--tap-min\)/);
    expect(opt).toMatch(/font-size:\s*var\(--fs-body\)/);
    expect(stylesCss).toMatch(/--tap-min:\s*56px/);
    expect(stylesCss).toMatch(/--fs-body:\s*20px/);
  });

  it('the active option is filled with the selected colours', () => {
    const on = block(css, '.unit-switch-opt.active');
    expect(on).toMatch(/background:\s*var\(--selected\)/);
    expect(on).toMatch(/color:\s*var\(--on-selected\)/);
  });

  it('no motion of its own and only tokens (no raw colours)', () => {
    const s = strip(css);
    expect(s).not.toMatch(/transition|animation|@keyframes/);
    expect(s).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
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

describe('contrast (ui-ux-pro-max: words >= 4.5:1, focus ring >= 3:1)', () => {
  it('active word on its fill, the other word on the track, in every theme', () => {
    for (const [theme, over] of Object.entries(THEMES)) {
      expect(
        contrast(hexOf('--on-selected', over), hexOf('--selected', over)),
        `active ${theme}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(hexOf('--text-2', over), hexOf('--surface', over)),
        `inactive ${theme}`,
      ).toBeGreaterThanOrEqual(4.5);
      // The fill must stand out from the track by more than colour hue alone.
      expect(
        contrast(hexOf('--selected', over), hexOf('--surface', over)),
        `fill vs track ${theme}`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(hexOf('--focus', over), hexOf('--surface', over)),
        `focus ${theme}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
