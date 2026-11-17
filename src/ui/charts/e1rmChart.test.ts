/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkCopy } from '../../core/trainer/replies';
import { asFake, useFakeDom } from '../screens/testDom';
import {
  bestIndex,
  E1RM_CHART,
  E1RM_EMPTY,
  E1RM_NOTE,
  E1RM_ONE,
  e1rmChart,
  e1rmDate,
  e1rmGeometry,
  e1rmSummary,
  e1rmSummaryText,
  type E1rmPoint,
} from './e1rmChart';

useFakeDom();

// Made-up numbers only (public repo).
const d = (day: number) => `2026-11-${String(day).padStart(2, '0')}`;
const MANY: E1rmPoint[] = [
  { date: d(1), e1rmKg: 66 },
  { date: d(3), e1rmKg: 67.5 },
  { date: d(5), e1rmKg: 60, lighter: true },
  { date: d(8), e1rmKg: 70 },
  { date: d(10), e1rmKg: 70.5 },
  { date: d(12), e1rmKg: 72 },
  { date: d(14), e1rmKg: 70 },
];
const render = (points: readonly E1rmPoint[], unit: 'kg' | 'lb' = 'kg') =>
  asFake(e1rmChart({ unit, points }));

describe('e1RM helpers', () => {
  it('reads both date forms', () => {
    expect(e1rmDate('2026-11-12')).toBe('12 Nov');
    expect(e1rmDate(new Date(2026, 10, 12, 18, 30).getTime())).toBe('12 Nov');
  });

  it('best = the highest estimate, the latest on a tie', () => {
    expect(bestIndex([])).toBe(-1);
    expect(bestIndex(MANY)).toBe(5);
    expect(
      bestIndex([
        { date: d(1), e1rmKg: 70 },
        { date: d(3), e1rmKg: 70 },
      ]),
    ).toBe(1);
  });

  it('the summary says best, latest and lighter days in words', () => {
    expect(e1rmSummary([], 'kg')).toBeNull();
    expect(e1rmSummary(MANY, 'kg')).toEqual({
      best: 'Best estimate 72 kg on 12 Nov',
      latest: 'Latest 70 kg on 14 Nov',
      lighter: '1 lighter day is marked.',
    });
    expect(e1rmSummaryText(MANY, 'kg')).toBe(
      'Best estimate 72 kg on 12 Nov. Latest 70 kg on 14 Nov. 1 lighter day is marked.',
    );
    // The latest is the best: said once.
    expect(e1rmSummary(MANY.slice(0, 6), 'kg')?.latest).toBeNull();
    expect(e1rmSummary(MANY, 'lb')?.best).toBe('Best estimate 158.7 lb on 12 Nov');
    expect(e1rmSummaryText([], 'kg')).toBe(E1RM_EMPTY);
  });

  it('geometry: marks left to right inside the box, higher estimate higher up', () => {
    expect(e1rmGeometry([], 'kg')).toBeNull();
    const g = e1rmGeometry(MANY, 'kg');
    expect(g?.marks).toHaveLength(7);
    const xs = g?.marks.map((m) => m.cx) ?? [];
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (const m of g?.marks ?? []) {
      expect(m.cx).toBeGreaterThanOrEqual(E1RM_CHART.padX);
      expect(m.cx).toBeLessThanOrEqual(E1RM_CHART.w - E1RM_CHART.padX);
      expect(m.cy).toBeGreaterThanOrEqual(E1RM_CHART.padT);
      expect(m.cy).toBeLessThanOrEqual(E1RM_CHART.h - E1RM_CHART.padB);
    }
    expect(g?.marks[5]?.cy).toBeLessThan(g?.marks[2]?.cy ?? 0);
    expect(g?.marks.filter((m) => m.best)).toHaveLength(1);
    expect(g?.marks[2]?.lighter).toBe(true);
    expect([g?.xFirst, g?.xLast]).toEqual(['1 Nov', '14 Nov']);
  });

  it('labels: every point up to 4; otherwise best, latest, first, never touching', () => {
    const few = e1rmGeometry(MANY.slice(0, 4), 'kg');
    expect(few?.marks.every((m) => m.labelled)).toBe(true);
    const g = e1rmGeometry(MANY, 'kg');
    const labelled = g?.marks.map((m, i) => (m.labelled ? i : -1)).filter((i) => i >= 0);
    // Best (index 5) wins; the latest (6) is one step away and would touch it; the first fits.
    expect(labelled).toEqual([0, 5]);
    const cx = g?.marks.filter((m) => m.labelled).map((m) => m.cx) ?? [];
    for (let i = 1; i < cx.length; i++) expect((cx[i] ?? 0) - (cx[i - 1] ?? 0)).toBeGreaterThan(60);
    // Edge labels grow inwards so they stay in the box.
    expect([g?.marks[0]?.anchor, g?.marks[3]?.anchor, g?.marks[6]?.anchor]).toEqual([
      'start',
      'middle',
      'end',
    ]);
  });

  it('a dip between two higher sessions is labelled under its mark', () => {
    const g = e1rmGeometry(MANY.slice(0, 4), 'kg');
    expect(g?.marks.map((m) => m.below)).toEqual([false, false, true, false]);
  });

  it('a flat series still has room (no divide by zero)', () => {
    const g = e1rmGeometry(
      [
        { date: d(1), e1rmKg: 70 },
        { date: d(3), e1rmKg: 70 },
      ],
      'kg',
    );
    expect(g?.marks.every((m) => Number.isFinite(m.cy))).toBe(true);
  });
});

describe('e1rmChart', () => {
  it('empty: a sentence, no chart', () => {
    const el = render([]);
    expect(el.getAttribute('data-state')).toBe('empty');
    expect(el.textContent).toContain(E1RM_EMPTY);
    expect(el.find((e) => e.hasAttribute('data-e1rm-chart'))).toHaveLength(0);
    expect(el.textContent).toContain('Estimated 1-rep max (kg)');
  });

  it('one point: the mark with its value and date, no line', () => {
    const el = render([{ date: d(12), e1rmKg: 72 }]);
    expect(el.getAttribute('data-state')).toBe('one');
    expect(el.byClass('e1-dot')).toHaveLength(1);
    expect(el.byClass('e1-line')).toHaveLength(0);
    expect(el.byClass('e1-val').map((t) => t.textContent)).toEqual(['72']);
    expect(el.byClass('e1-axis').map((t) => t.textContent)).toEqual(['12 Nov']);
    expect(el.textContent).toContain('Best estimate 72 kg on 12 Nov');
    expect(el.textContent).toContain(E1RM_ONE);
  });

  it('many: a line, one mark per session, best ringed, lighter hollow, all named', () => {
    const el = render(MANY);
    expect(el.getAttribute('data-state')).toBe('line');
    expect(el.byClass('e1-line')).toHaveLength(1);
    const dots = el.byClass('e1-dot');
    expect(dots).toHaveLength(7);
    expect(dots.filter((c) => c.getAttribute('data-best') === 'true')).toHaveLength(1);
    expect(el.byClass('e1-ring')).toHaveLength(1);
    const lighter = dots.filter((c) => c.getAttribute('data-lighter') === 'true');
    expect(lighter).toHaveLength(1);
    expect(lighter[0]?.classes).toContain('e1-dot-lighter');
    expect(el.byClass('e1-val').map((t) => t.textContent)).toEqual(['66', '72']);
    expect(el.byClass('e1-axis').map((t) => t.textContent)).toEqual(['1 Nov', '14 Nov']);
    const legend = el.find((e) => e.hasAttribute('data-e1rm-legend'))[0];
    expect(legend?.textContent).toBe('SessionBestLighter day');
  });

  it('the legend names "Lighter day" only when one is drawn', () => {
    const el = render(MANY.filter((p) => !p.lighter));
    expect(el.find((e) => e.hasAttribute('data-e1rm-legend'))[0]?.textContent).toBe('SessionBest');
  });

  it('has a text summary for screen readers and in view', () => {
    const el = render(MANY);
    const chart = el.find((e) => e.hasAttribute('data-e1rm-chart'))[0];
    expect(chart?.getAttribute('role')).toBe('img');
    expect(chart?.getAttribute('aria-label')).toBe(
      'Best estimate 72 kg on 12 Nov. Latest 70 kg on 14 Nov. 1 lighter day is marked.',
    );
    const sum = el.find((e) => e.hasAttribute('data-e1rm-summary'))[0];
    expect(sum?.byTag('p').map((p) => p.textContent)).toEqual([
      'Best estimate 72 kg on 12 Nov',
      'Latest 70 kg on 14 Nov',
    ]);
  });

  it('lb: values and title in lb', () => {
    const el = render(MANY, 'lb');
    expect(el.textContent).toContain('Estimated 1-rep max (lb)');
    expect(el.byClass('e1-val').map((t) => t.textContent)).toEqual(['145.5', '158.7']);
  });

  it('copy: an estimate, no banned or diagnosis words', () => {
    for (const t of [E1RM_EMPTY, E1RM_ONE, E1RM_NOTE, e1rmSummaryText(MANY, 'kg')])
      expect(checkCopy(t).hits).toEqual([]);
    expect(E1RM_NOTE).toContain('An estimate');
  });
});

describe('e1rmChart.css', () => {
  const css = readFileSync(new URL('./e1rmChart.css', import.meta.url), 'utf8');

  it('tokens only; chart text at 22px in a 320 box (≥ 20px on screen at 390)', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*\d/);
    expect(css).not.toContain('--fs-label');
    expect(css).toMatch(/\.e1-val,\s*\.e1-axis \{[^}]*font-size: var\(--fs-cue\)/);
  });

  it('no orange and no animation of its own', () => {
    expect(css).not.toContain('--cta');
    expect(css).not.toMatch(/transition|animation/);
  });
});
