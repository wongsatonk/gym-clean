// M7 Fuel rings (task 11). One row per macro: a progress ring (decorative, its percent is in the
// row's text) and the amount left as a big number (≥ 64px) with "kcal to go" / "g protein to go".
// Quick mode: kcal + protein; Full adds carbs + fat. Past the target the ring is full in the
// success colour and the number reads "+120" with "kcal over target" (words, not colour alone).
// Targets that are computed carry the "estimate" tag.
// The math is core's: `remaining(...)` (src/core/nutrition/day.ts) for left / over and
// `visibleMacros(mode)` (src/core/nutrition/targets.ts) for which rings show.
import { remaining, type MacroKey, type MacroLeft } from '../../core/nutrition/day';
import { visibleMacros } from '../../core/nutrition/targets';
import type { MacroSet, NutritionMode, NutritionTargets } from '../../core/types';
import { h } from '../dom';
import { estimateTag, fmtNum } from './common';

export type { MacroKey };

export const MACRO_META: Record<MacroKey, { name: string; unit: string }> = {
  kcal: { name: 'Calories', unit: 'kcal' },
  proteinG: { name: 'Protein', unit: 'g protein' },
  carbsG: { name: 'Carbs', unit: 'g carbs' },
  fatG: { name: 'Fat', unit: 'g fat' },
};

/** How far along: 0..1 (capped), 0 when there is no target. */
export function ringFraction(eaten: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.min(1, Math.max(0, eaten / target));
}

/** The big number for one core `MacroLeft`, in whole units: "over" only once it shows as ≥ 1. */
export function leftDisplay(m: MacroLeft): { value: number; over: boolean } {
  const over = Math.round(m.over);
  return over > 0 ? { value: over, over: true } : { value: Math.round(m.left), over: false };
}

const R = 40;
const C = 2 * Math.PI * R;

/** stroke-dashoffset for a fraction of the ring. */
export function ringDashOffset(fraction: number): number {
  return C * (1 - Math.min(1, Math.max(0, fraction)));
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function ringSvg(fraction: number, done: boolean): SVGElement {
  const svg = svgEl('svg', {
    class: 'fuel-ring-svg',
    viewBox: '0 0 100 100',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.append(
    svgEl('circle', { class: 'fuel-ring-bg', cx: '50', cy: '50', r: String(R) }),
    svgEl('circle', {
      class: done ? 'fuel-ring-fg done' : 'fuel-ring-fg',
      cx: '50',
      cy: '50',
      r: String(R),
      'stroke-dasharray': C.toFixed(1),
      'stroke-dashoffset': ringDashOffset(fraction).toFixed(1),
      transform: 'rotate(-90 50 50)',
    }),
  );
  return svg;
}

/** One macro row from core `remaining(...)[key]`. */
export function ringRow(key: MacroKey, m: MacroLeft): HTMLElement {
  const meta = MACRO_META[key];
  const { eaten, target } = m;
  const frac = ringFraction(eaten, target);
  const left = leftDisplay(m);
  const pct = Math.round(target > 0 ? (eaten / target) * 100 : 0);
  const done = target > 0 && eaten >= target;
  return h(
    'section',
    {
      class: `fuel-ring${left.over ? ' over' : ''}${done ? ' done' : ''}`,
      'data-ring': key,
      'data-over': left.over ? 'true' : undefined,
      'aria-label': meta.name,
    },
    h(
      'div',
      { class: 'fuel-ring-dial' },
      ringSvg(frac, done),
      h('span', { class: 'fuel-ring-pct', 'aria-hidden': 'true' }, `${pct}%`),
    ),
    h(
      'div',
      { class: 'fuel-ring-txt' },
      h(
        'p',
        { class: 'fuel-left' },
        h(
          'span',
          { class: 'fuel-left-num', 'data-left': key },
          left.over ? `+${fmtNum(left.value)}` : fmtNum(left.value),
        ),
      ),
      h(
        'p',
        { class: 'fuel-left-unit' },
        left.over ? `${meta.unit} over target` : `${meta.unit} to go`,
      ),
      h(
        'p',
        { class: 'fuel-ring-of' },
        h('span', {}, `${fmtNum(eaten)} of ${fmtNum(target)}`),
        m.estimate ? estimateTag() : null,
      ),
      h('span', { class: 'sr-only' }, `${pct}% of target`),
    ),
  );
}

/** The ring rows for the mode (core `remaining` + `visibleMacros`). */
export function fuelRings(
  mode: NutritionMode,
  totals: MacroSet,
  targets: NutritionTargets,
): HTMLElement {
  const left = remaining(totals, targets);
  return h(
    'div',
    { class: 'fuel-rings', 'data-rings': mode },
    ...visibleMacros(mode).map((k) => ringRow(k, left[k])),
  );
}
