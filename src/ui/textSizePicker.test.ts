// M13d task 21: Text size. The picker's own render (the Settings section is in
// screens/settings.test.ts), applyTextSize + its pre-paint mirror, and the stylesheet's
// html[data-text-size] blocks matching the core scale (src/core/textSize.ts is the source).
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { TEXT_SIZES, textScale } from '../core/textSize';
import type { TextSize } from '../core/types';
import {
  TEXT_SIZE_LABEL,
  TEXT_SIZE_MIRROR,
  applyTextSize,
  textSizeOf,
  textSizePicker,
} from './textSizePicker';
import { FakeEl, asFake, useFakeDom } from './screens/testDom';

useFakeDom();

const stylesCss = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
const pickerCss = readFileSync(join(__dirname, 'textSizePicker.css'), 'utf8');

/** The declarations of the first rule whose selector list is exactly `selector`. */
function block(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule ${selector}`);
  return css.slice(at, css.indexOf('}', at));
}

const px = (decls: string, token: string): number | null => {
  const m = new RegExp(`${token}:\\s*(\\d+)px;`).exec(decls);
  return m ? Number(m[1]) : null;
};

describe('textSizeOf', () => {
  it('keeps a valid size; anything else is Standard', () => {
    for (const s of TEXT_SIZES) expect(textSizeOf(s)).toBe(s);
    for (const v of [undefined, null, '', 'huge', 3, {}]) expect(textSizeOf(v)).toBe('standard');
  });
});

describe('applyTextSize', () => {
  it('sets html[data-text-size] and writes the pre-paint mirror', () => {
    const root = new FakeEl('html');
    const stored = new Map<string, string>();
    const storage = { setItem: (k: string, v: string) => void stored.set(k, v) };
    applyTextSize('larger', root as unknown as HTMLElement, storage);
    expect(root.getAttribute('data-text-size')).toBe('larger');
    expect(stored.get(TEXT_SIZE_MIRROR)).toBe('larger');
    applyTextSize('standard', root as unknown as HTMLElement, storage);
    expect(root.getAttribute('data-text-size')).toBe('standard');
    expect(stored.get(TEXT_SIZE_MIRROR)).toBe('standard');
  });

  it('storage that throws (private mode) still applies the attribute', () => {
    const root = new FakeEl('html');
    const storage = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => applyTextSize('large', root as unknown as HTMLElement, storage)).not.toThrow();
    expect(root.getAttribute('data-text-size')).toBe('large');
  });

  it('index.html applies large / larger from the mirror before first paint', () => {
    expect(indexHtml).toContain(`localStorage.getItem('${TEXT_SIZE_MIRROR}')`);
    expect(indexHtml).toMatch(/t === 'large' \|\| t === 'larger'/);
    expect(indexHtml).toContain('dataset.textSize = t');
  });
});

describe('textSizePicker', () => {
  it('three stacked options, the chosen one pressed with a check; a tap on another reports it', () => {
    const got: TextSize[] = [];
    const el = asFake(textSizePicker('large', (s) => got.push(s)));
    const btns = el.byTag('button');
    expect(btns.map((b) => b.textContent)).toEqual(TEXT_SIZES.map((s) => TEXT_SIZE_LABEL[s]));
    expect(btns.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(btns.map((b) => b.find((e) => e.getAttribute('data-icon') === 'check').length)).toEqual([
      0, 1, 0,
    ]);
    for (const b of btns) b.click();
    expect(got).toEqual(['standard', 'larger']);
  });

  it('CSS: one option per row, each ≥ 60px (--tap-bar), words at least body size', () => {
    expect(block(pickerCss, '.settings .segmented.text-size-options')).toMatch(
      /grid-template-columns: minmax\(0, 1fr\);/,
    );
    const btn = block(pickerCss, '.settings .text-size-options .seg-btn');
    expect(btn).toMatch(/min-height: var\(--tap-bar\);/);
    expect(btn).toMatch(/font-size: var\(--fs-body\);/);
    for (const s of TEXT_SIZES) expect(textScale(s).cue).toBeGreaterThanOrEqual(20);
  });
});

describe('styles.css html[data-text-size] blocks', () => {
  it('Standard is the :root scale (no attribute rule needed)', () => {
    const root = block(stylesCss, ':root');
    const std = textScale('standard');
    expect(px(root, '--fs-body')).toBe(std.body);
    expect(px(root, '--fs-cue')).toBe(std.cue);
    expect(px(root, '--fs-lead')).toBe(std.lead);
    expect(px(root, '--fs-label')).toBe(std.label);
    expect(stylesCss).not.toContain("html[data-text-size='standard']");
  });

  it('large and larger raise exactly the four word steps to the core scale', () => {
    for (const s of ['large', 'larger'] as const) {
      const decls = block(stylesCss, `html[data-text-size='${s}']`);
      const want = textScale(s);
      expect(px(decls, '--fs-body'), s).toBe(want.body);
      expect(px(decls, '--fs-cue'), s).toBe(want.cue);
      expect(px(decls, '--fs-lead'), s).toBe(want.lead);
      expect(px(decls, '--fs-label'), s).toBe(want.label);
      // Numbers, timers, headings and titles are not scaled.
      for (const t of [
        '--fs-head',
        '--fs-title',
        '--fs-display',
        '--fs-stepper',
        '--fs-num-sm',
        '--fs-num',
        '--fs-hero',
        '--fs-rep',
        '--fs-timer',
      ])
        expect(decls, `${s} ${t}`).not.toContain(`${t}:`);
    }
  });

  it('the tab bar keeps the Standard label size at every step', () => {
    const decls = block(
      stylesCss,
      "html[data-text-size='large'] .tabbar,\nhtml[data-text-size='larger'] .tabbar",
    );
    expect(px(decls, '--fs-label')).toBe(textScale('standard').label);
  });
});
