import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ICON_NAMES,
  ICON_PATHS,
  ICON_PX,
  ICON_STROKE,
  icon,
  iconMarkup,
  type IconSize,
} from './icons';

const SIZES: IconSize[] = ['sm', 'md', 'lg'];

/** Attributes on the root <svg> of a markup string. */
function rootAttrs(markup: string): Record<string, string> {
  const open = /^<svg ([^>]*)>/.exec(markup)?.[1];
  if (open === undefined) throw new Error(`not an <svg>: ${markup}`);
  return Object.fromEntries([...open.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

describe('icon set', () => {
  it('has the mix set plus flag, each with drawable content', () => {
    for (const n of [
      'dumbbell',
      'speaker',
      'medal',
      'close',
      'flip',
      'lock',
      'palette',
      'ruler',
      'flag',
    ] as const) {
      expect(ICON_NAMES).toContain(n);
    }
    expect(ICON_NAMES.length).toBe(30);
    for (const n of ICON_NAMES) expect(ICON_PATHS[n]).toMatch(/^<(path|rect|circle) /);
  });

  it('renders every name at every size with one 2.25px round stroke in currentColor', () => {
    expect(ICON_STROKE).toBe(2.25);
    for (const n of ICON_NAMES) {
      for (const size of SIZES) {
        const markup = iconMarkup(n, size);
        const a = rootAttrs(markup);
        expect(a['viewBox']).toBe('0 0 24 24');
        expect(a['width']).toBe(String(ICON_PX[size]));
        expect(a['height']).toBe(String(ICON_PX[size]));
        expect(a['stroke']).toBe('currentColor');
        expect(a['stroke-width']).toBe('2.25');
        expect(a['stroke-linecap']).toBe('round');
        expect(a['stroke-linejoin']).toBe('round');
        expect(a['fill']).toBe('none');
        expect(a['aria-hidden']).toBe('true');
        expect(a['data-icon']).toBe(n);
        expect(a['class']).toBe(`ic ic-${size}`);
        expect(markup.endsWith('</svg>')).toBe(true);
      }
    }
  });

  it('children never override the stroke and only fill with currentColor', () => {
    for (const n of ICON_NAMES) {
      const body = ICON_PATHS[n];
      expect(body).not.toMatch(/stroke/);
      for (const m of body.matchAll(/fill="([^"]*)"/g)) expect(m[1]).toBe('currentColor');
      // Only simple shapes, nothing nested or scripted.
      const tags = [...body.matchAll(/<(\w+)/g)].map((m) => m[1]);
      for (const t of tags) expect(['path', 'rect', 'circle']).toContain(t);
    }
  });

  it('has no href, url() or external reference anywhere', () => {
    for (const n of ICON_NAMES) {
      const markup = iconMarkup(n, 'lg');
      expect(markup).not.toMatch(
        /href|url\(|<use|<image|<script|https?:\/\/(?!www\.w3\.org\/2000\/svg")/,
      );
      expect(markup).not.toMatch(/style=/);
    }
  });

  it('defaults to md and accepts an extra class and the stepper stroke', () => {
    expect(rootAttrs(iconMarkup('plus'))['width']).toBe('28');
    const a = rootAttrs(iconMarkup('plus', 'lg', { class: 'stepper-ic', stroke: 3 }));
    expect(a['class']).toBe('ic ic-lg stepper-ic');
    expect(a['stroke-width']).toBe('3');
  });
});

describe('icon() element', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds an SVG element with the same attributes and body for every name', () => {
    const made: { ns: string; tag: string; attrs: Map<string, string>; innerHTML: string }[] = [];
    vi.stubGlobal('document', {
      createElementNS(ns: string, tag: string) {
        const el = {
          ns,
          tag,
          attrs: new Map<string, string>(),
          innerHTML: '',
          setAttribute(k: string, v: string) {
            el.attrs.set(k, v);
          },
        };
        made.push(el);
        return el;
      },
    });
    for (const n of ICON_NAMES) {
      icon(n, 'sm');
      const el = made.at(-1);
      if (!el) throw new Error('no element made');
      expect(el.ns).toBe('http://www.w3.org/2000/svg');
      expect(el.tag).toBe('svg');
      expect(el.innerHTML).toBe(ICON_PATHS[n]);
      expect(Object.fromEntries(el.attrs)).toEqual(
        Object.fromEntries(
          Object.entries(rootAttrs(iconMarkup(n, 'sm'))).filter(([k]) => k !== 'xmlns'),
        ),
      );
    }
    expect(made).toHaveLength(ICON_NAMES.length);
  });
});
