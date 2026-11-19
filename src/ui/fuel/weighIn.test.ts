import { describe, expect, it } from 'vitest';
import type { TrendPoint } from '../../core/nutrition/adjust';
import type { HistoryDay } from '../../core/nutrition/day';
import type { WeeklyCheck } from '../../core/types';
import type { Unit } from '../../core/units';
import { asFake, useFakeDom } from '../screens/testDom';
import { checkCopy } from '../../core/trainer/replies';
import { byAttr, copyHits, oneAttr, typeInto, valueOf } from './fuelTestUtil';
import { checkHealthCopy } from '../../core/health/copy';
import { ACTIVITY_CHOICES } from './setup';
import {
  activityLine,
  BODY_COMP_NOTE,
  CHART,
  COMP_CHART,
  compChange,
  compGeometry,
  compNow,
  compSeries,
  chartGeometry,
  dayNumber,
  rateText,
  weeklyCardCopy,
  weighInScreen,
  type BodyCompPoint,
  type WeighInProps,
} from './weighIn';

useFakeDom();

// Made-up numbers only (public repo).
const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;
// Core `trend(...)` shape: one point per day 1..12 Nov, nulls on gaps.
const WEIGHED = [2, 3, 5, 6, 8, 9, 10, 12];
const AVG_DAYS = [8, 9, 10, 12];
const TREND: TrendPoint[] = Array.from({ length: 12 }, (_, k) => {
  const d = k + 1;
  const i = WEIGHED.indexOf(d);
  const j = AVG_DAYS.indexOf(d);
  return {
    date: day(d),
    kg: i < 0 ? null : 70 + (i % 3) * 0.3 + i * 0.05,
    avgKg: j < 0 ? null : 70.3 + j * 0.05,
  };
});
const pts = (list: [number, number | null, number | null][]): TrendPoint[] =>
  list.map(([d, kg, avgKg]) => ({ date: day(d), kg, avgKg }));
const hday = (d: number, kcal: number, proteinG: number, count: number, training: boolean) =>
  ({ date: day(d), totals: { kcal, proteinG, count }, training }) satisfies HistoryDay;
// Core `nutritionHistory(...)` order: oldest first.
const HISTORY: HistoryDay[] = [
  hday(11, 2702.4, 118.6, 3, false),
  hday(12, 0, 0, 0, false),
  hday(13, 2410, 132, 4, true),
];
const check = (kind: WeeklyCheck['kind'], over: Partial<WeeklyCheck> = {}): WeeklyCheck => ({
  weekStart: day(9),
  avgKg: kind === 'needData' ? null : 70.4,
  prevAvgKg: kind === 'needData' ? null : 70.3,
  ratePct: kind === 'needData' ? null : kind === 'down' ? 0.9 : kind === 'up' ? 0.14 : 0.35,
  kind,
  deltaKcal: kind === 'up' ? 150 : kind === 'down' ? -100 : 0,
  outcome: 'pending',
  ...over,
});

function render(over: Partial<WeighInProps> = {}) {
  const calls = { back: 0, save: [] as number[], accept: 0, dismiss: 0 };
  const el = asFake(
    weighInScreen(
      {
        unit: 'kg',
        todayKg: null,
        lastKg: 70.4,
        trend: TREND,
        check: null,
        kcalTarget: 2650,
        history: HISTORY,
        ...over,
      },
      {
        onBack: () => calls.back++,
        onSave: (kg) => calls.save.push(kg),
        onAccept: () => calls.accept++,
        onDismiss: () => calls.dismiss++,
      },
    ),
  );
  return { el, calls };
}

describe('weekly card copy', () => {
  it('rateText', () => {
    expect(rateText(0.35)).toBe('up 0.35%');
    expect(rateText(-0.2)).toBe('down 0.2%');
    expect(rateText(0)).toBe('no change');
  });

  it('up: +150 with the new target', () => {
    const c = weeklyCardCopy(check('up'), 'kg', 2650);
    expect(c.title).toBe('Add 150 kcal a day?');
    expect(c.body).toContain(
      "Last week's average was 70.4 kg, up 0.14% from 70.3 kg the week before.",
    );
    expect(c.change).toBe('New target: 2,800 kcal a day (was 2,650).');
    expect([c.accept, c.dismiss]).toEqual(['Accept', 'Not now']);
  });

  it('down: −100', () => {
    const c = weeklyCardCopy(check('down'), 'kg', 2650);
    expect(c.title).toBe('Eat 100 kcal a day less?');
    expect(c.change).toBe('New target: 2,550 kcal a day (was 2,650).');
    expect(c.accept).toBe('Accept');
  });

  it('on track and need data: nothing to accept', () => {
    const on = weeklyCardCopy(check('onTrack'), 'kg', 2650);
    expect(on.title).toBe('On track this week');
    expect([on.accept, on.change, on.dismiss]).toEqual([null, null, 'Got it']);
    const need = weeklyCardCopy(check('needData'), 'kg', 2650);
    expect(need.title).toBe('Need more weigh-ins');
    expect(need.body).toContain('Nothing was changed.');
    expect([need.accept, need.change]).toEqual([null, null]);
  });

  it.each<['up' | 'down', string]>([
    ['down', 'Your target is already at maintenance, so it stays the same.'],
    ['up', 'Your target is already at the top of its range, so it stays the same.'],
  ])('%s with deltaKcal 0: an info card, nothing to accept, no "−0"', (kind, line) => {
    const c = weeklyCardCopy(check(kind, { deltaKcal: 0 }), 'kg', 2650);
    expect(c.title).toBe('Your target stays the same');
    expect(c.body).toContain(line);
    expect([c.accept, c.change, c.dismiss]).toEqual([null, null, 'Got it']);
    const all = `${c.title} ${c.body}`;
    expect(all).not.toMatch(/[−-]\s?0\b|\b0 kcal/);
    expect(checkCopy(all).hits).toEqual([]);
  });

  it('no target known → no "New target" line', () => {
    expect(weeklyCardCopy(check('up'), 'kg', null).change).toBeNull();
  });

  it('lb shows the averages in lb', () => {
    expect(weeklyCardCopy(check('onTrack'), 'lb', 2650).body).toContain('155.2 lb');
  });
});

describe('weighInScreen weekly card', () => {
  it.each<[WeeklyCheck['kind'], boolean]>([
    ['up', true],
    ['down', true],
    ['onTrack', false],
    ['needData', false],
  ])('%s card: Accept shown = %s, buttons call back', (kind, hasAccept) => {
    const { el, calls } = render({ check: check(kind) });
    const card = oneAttr(el, 'data-weekly-card');
    expect(card.getAttribute('data-kind')).toBe(kind);
    expect(byAttr(card, 'data-weekly-accept')).toHaveLength(hasAccept ? 1 : 0);
    if (hasAccept) oneAttr(card, 'data-weekly-accept').click();
    oneAttr(card, 'data-weekly-dismiss').click();
    expect(calls).toMatchObject({ accept: hasAccept ? 1 : 0, dismiss: 1 });
    expect(copyHits(card)).toEqual([]);
  });

  it.each(['up', 'down'] as const)(
    '%s with no change possible: Got it only, calls onDismiss',
    (kind) => {
      const { el, calls } = render({ check: check(kind, { deltaKcal: 0 }) });
      const card = oneAttr(el, 'data-weekly-card');
      expect(card.getAttribute('data-change')).toBe('none');
      expect(byAttr(card, 'data-weekly-accept')).toHaveLength(0);
      expect(card.textContent).not.toContain('New target');
      const ok = oneAttr(card, 'data-weekly-dismiss');
      expect(ok.textContent).toBe('Got it');
      ok.click();
      expect(calls).toMatchObject({ accept: 0, dismiss: 1 });
      expect(copyHits(card)).toEqual([]);
    },
  );

  it('is hidden once accepted or dismissed, and when there is no check', () => {
    expect(
      byAttr(render({ check: check('up', { outcome: 'accepted' }) }).el, 'data-weekly-card'),
    ).toHaveLength(0);
    expect(
      byAttr(render({ check: check('up', { outcome: 'dismissed' }) }).el, 'data-weekly-card'),
    ).toHaveLength(0);
    expect(byAttr(render().el, 'data-weekly-card')).toHaveLength(0);
  });

  it('comes before the stepper (the thing to act on)', () => {
    const { el } = render({ check: check('up') });
    const order = el.find(
      (e) => e.hasAttribute('data-weekly-card') || e.getAttribute('data-field') === 'weigh-in',
    );
    expect(order[0]?.hasAttribute('data-weekly-card')).toBe(true);
  });
});

describe('weighInScreen stepper', () => {
  it.each<[Unit, string, string, number]>([
    ['kg', '70.4', '70.5', 70.5],
    ['lb', '155.2', '155.4', 155.4 * 0.45359237],
  ])('%s: starts at the last weigh-in and saves kg', (unit, start, after, kg) => {
    const { el, calls } = render({ unit });
    const field = oneAttr(el, 'data-field', 'weigh-in');
    expect(valueOf(field.oneByClass('nf-value'))).toBe(start);
    expect(field.textContent).toContain(unit);
    oneAttr(field, 'data-step', 'up').click();
    expect(valueOf(field.oneByClass('nf-value'))).toBe(after);
    oneAttr(el, 'data-weigh-save').click();
    expect(calls.save[0]).toBeCloseTo(kg, 6);
  });

  it("today's weigh-in already saved: starts there and says saving again replaces it", () => {
    const { el, calls } = render({ todayKg: 71.2 });
    expect(valueOf(oneAttr(el, 'data-field', 'weigh-in').oneByClass('nf-value'))).toBe('71.2');
    expect(oneAttr(el, 'data-weigh-today', 'saved').textContent).toBe(
      'Saved today: 71.2 kg. Saving again replaces it.',
    );
    expect(oneAttr(el, 'data-weigh-save').textContent).toBe('Update weigh-in');
    typeInto(oneAttr(el, 'data-field', 'weigh-in').oneByClass('nf-value'), '71.0');
    oneAttr(el, 'data-weigh-save').click();
    expect(calls.save).toEqual([71]);
  });

  it('M13d task 24: the header Back is the edge swipe’s one Back', () => {
    for (const over of [{}, { check: check('up') }]) {
      const marked = render(over).el.find((e) => e.hasAttribute('data-swipe-back'));
      expect(marked).toHaveLength(1);
      expect(marked[0]?.classes).toContain('fuel-back');
    }
  });

  it('Back calls onBack', () => {
    const { el, calls } = render();
    el.find((e) => e.tag === 'button' && e.textContent === 'Back')[0]?.click();
    expect(calls.back).toBe(1);
  });
});

describe('trend chart', () => {
  it('dayNumber is DST-proof (whole days)', () => {
    expect(dayNumber('2026-03-30') - dayNumber('2026-03-28')).toBe(2);
    expect(dayNumber('2026-11-02') - dayNumber('2026-10-31')).toBe(2);
  });

  it('lays daily dots and the average inside the box, oldest on the left', () => {
    const g = chartGeometry(TREND, 'kg');
    expect(g).not.toBeNull();
    if (!g) return;
    expect(g.dots).toHaveLength(WEIGHED.length);
    for (const d of g.dots) {
      expect(d.cx).toBeGreaterThanOrEqual(CHART.padL);
      expect(d.cx).toBeLessThanOrEqual(CHART.w - CHART.padR);
      expect(d.cy).toBeGreaterThanOrEqual(CHART.padT);
      expect(d.cy).toBeLessThanOrEqual(CHART.h - CHART.padB);
    }
    expect(g.dots[0]?.cx).toBe(CHART.padL);
    expect(g.dots.at(-1)?.cx).toBe(CHART.w - CHART.padR);
    expect(g.avgPath.startsWith('M')).toBe(true);
    expect(g.avgPath.split('L')).toHaveLength(AVG_DAYS.length);
    expect(Number(g.yTop.label)).toBeGreaterThan(Number(g.yBottom.label));
    expect([g.xFirst, g.xLast]).toEqual(['2 Nov', '12 Nov']);
    // Null gaps (day 1, 4, 7, 11) are skipped, not drawn at 0.
    expect(g.dots.map((d) => d.date)).toEqual(WEIGHED.map(day));
  });

  it('a heavier day sits higher', () => {
    const g = chartGeometry(
      pts([
        [1, 70, null],
        [2, 71, null],
      ]),
      'kg',
    );
    expect(g && g.dots[1] && g.dots[0] && g.dots[1].cy < g.dots[0].cy).toBe(true);
    expect(g?.avgPath).toBe('');
  });

  it('labels in lb when the unit is lb', () => {
    const kg = chartGeometry(TREND, 'kg');
    const lb = chartGeometry(TREND, 'lb');
    expect(Number(lb?.yTop.label)).toBeGreaterThan(Number(kg?.yTop.label) * 2);
  });

  it('draws an SVG with dots, the average line and a text alternative', () => {
    const { el } = render();
    const svg = oneAttr(el, 'data-trend-chart', 'drawn');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('7-day average');
    expect(svg.byClass('wc-dot')).toHaveLength(WEIGHED.length);
    expect(svg.byClass('wc-avg')).toHaveLength(1);
    expect(el.textContent).toContain('Daily');
  });

  it('fewer than 2 weigh-ins: a short line instead of a chart', () => {
    const { el } = render({
      trend: pts([
        [1, 70, 70],
        [2, null, 70],
      ]),
    });
    expect(oneAttr(el, 'data-trend-chart', 'empty').textContent).toBe(
      'Weigh in on a few mornings to see your trend.',
    );
    expect(chartGeometry([], 'kg')).toBeNull();
  });
});

describe('14-day history', () => {
  it('takes core oldest-first days and lists them newest first with kcal, protein and training days marked', () => {
    const { el } = render();
    const days = byAttr(oneAttr(el, 'data-fuel-history'), 'data-day');
    expect(days.map((d) => d.getAttribute('data-day'))).toEqual([day(13), day(12), day(11)]);
    expect(days.map((d) => d.getAttribute('data-trained'))).toEqual(['true', 'false', 'false']);
    expect(days[0]?.textContent).toContain('Fri 13 Nov');
    expect(days[0]?.textContent).toContain('2,410 kcal');
    expect(days[0]?.textContent).toContain('132 g protein');
    expect(days[0]?.textContent).toContain('Trained');
    expect(days[1]?.textContent).toContain('Nothing logged');
    expect(days[2]?.textContent).toContain('2,702 kcal');
    expect(days[2]?.textContent).toContain('119 g protein');
  });

  it('empty history', () => {
    expect(oneAttr(render({ history: [] }).el, 'data-fuel-history', 'empty').textContent).toBe(
      'Nothing logged yet.',
    );
  });
});

it('the whole screen passes the copy check for every card kind', () => {
  for (const kind of ['up', 'down', 'onTrack', 'needData'] as const) {
    expect(copyHits(render({ check: check(kind) }).el)).toEqual([]);
  }
});

describe('M11: from Health tag and activity line', () => {
  it('"from Health" shows only for an imported weigh-in saved today', () => {
    const tagged = render({ todayKg: 70.2, todaySource: 'health' }).el;
    const tag = oneAttr(tagged, 'data-from-health');
    expect(tag.textContent).toBe('from Health');
    expect(tag.tag).toBe('span'); // a static label, not a control
    expect(oneAttr(tagged, 'data-weigh-today').textContent).toContain('from Health');
    expect(
      byAttr(render({ todayKg: 70.2, todaySource: 'manual' }).el, 'data-from-health'),
    ).toHaveLength(0);
    expect(byAttr(render({ todayKg: 70.2 }).el, 'data-from-health')).toHaveLength(0);
    expect(
      byAttr(render({ todayKg: null, todaySource: 'health' }).el, 'data-from-health'),
    ).toHaveLength(0);
  });

  it('activityLine: more / less, null when the same', () => {
    expect(activityLine({ current: 'light', suggested: 'moderate' })).toBe(
      'Health shows more activity than “Lightly active”. Switch to “Active”?',
    );
    expect(activityLine({ current: 'very', suggested: 'light' })).toBe(
      'Health shows less activity than “Very active”. Switch to “Lightly active”?',
    );
    expect(activityLine({ current: 'light', suggested: 'light' })).toBeNull();
  });

  it('every activity line passes checkCopy + the M11 list', () => {
    for (const a of ACTIVITY_CHOICES)
      for (const b of ACTIVITY_CHOICES) {
        const line = activityLine({ current: a.value, suggested: b.value });
        if (line) expect(checkHealthCopy(line).hits, line).toEqual([]);
      }
  });

  function renderActivity(over: Partial<WeighInProps>) {
    const calls = { sw: [] as string[], keep: 0 };
    const el = asFake(
      weighInScreen(
        {
          unit: 'kg',
          todayKg: null,
          lastKg: 70.4,
          trend: TREND,
          check: null,
          kcalTarget: 2650,
          history: HISTORY,
          activity: { current: 'light', suggested: 'moderate' },
          ...over,
        },
        {
          onBack: () => {},
          onSave: () => {},
          onAccept: () => {},
          onDismiss: () => {},
          onSwitchActivity: (l) => calls.sw.push(l),
          onKeepActivity: () => calls.keep++,
        },
      ),
    );
    return { el, calls };
  }

  it('inside the pending weekly card: asks with Switch / Keep, never applies by itself', () => {
    const { el, calls } = renderActivity({ check: check('onTrack') });
    const card = oneAttr(el, 'data-weekly-card');
    const block = oneAttr(card, 'data-activity-suggest');
    expect(block.textContent).toContain('Switch to “Active”?');
    expect(byAttr(el, 'data-activity-card')).toHaveLength(0);
    expect(calls).toEqual({ sw: [], keep: 0 });
    const sw = oneAttr(card, 'data-activity-switch');
    const keep = oneAttr(card, 'data-activity-keep');
    expect([sw.textContent, keep.textContent]).toEqual(['Switch', 'Keep']);
    expect(sw.classes).toContain('wi-activity-btn');
    sw.click();
    keep.click();
    expect(calls).toEqual({ sw: ['moderate'], keep: 1 });
    expect(copyHits(el)).toEqual([]);
  });

  it('no pending check: its own small card; no callbacks or no suggestion: nothing', () => {
    const { el } = renderActivity({});
    expect(byAttr(el, 'data-weekly-card')).toHaveLength(0);
    expect(oneAttr(el, 'data-activity-card').textContent).toContain('Activity level');
    expect(byAttr(renderActivity({ activity: null }).el, 'data-activity-suggest')).toHaveLength(0);
    const unwired = render({ activity: { current: 'light', suggested: 'moderate' } }).el;
    expect(byAttr(unwired, 'data-activity-suggest')).toHaveLength(0);
  });
});

describe('M12 1b: body composition trends (from Health)', () => {
  // Made-up readings; HealthDay rows have this shape (other fields are ignored).
  const COMP: BodyCompPoint[] = [
    { date: day(14), bodyFatPct: 18.4, leanMassKg: 57.6 },
    { date: day(3), bodyFatPct: 19, leanMassKg: 57.2 },
    { date: day(8), bodyFatPct: 18.7 },
    { date: day(10) },
  ];

  it('series: oldest first, only days with a value, lean mass in his unit', () => {
    expect(compSeries(COMP, 'bodyFat', 'kg')).toEqual([
      { date: day(3), value: 19 },
      { date: day(8), value: 18.7 },
      { date: day(14), value: 18.4 },
    ]);
    expect(compSeries(COMP, 'leanMass', 'kg').map((r) => r.value)).toEqual([57.2, 57.6]);
    expect(compSeries(COMP, 'leanMass', 'lb')[1]?.value).toBeCloseTo(126.99, 1);
    // Body fat is a percent in either unit.
    expect(compSeries(COMP, 'bodyFat', 'lb')[0]?.value).toBe(19);
  });

  it('the number and the change are plain words', () => {
    const fat = compSeries(COMP, 'bodyFat', 'kg');
    expect(compNow(fat)).toBe('18.4');
    expect(compChange(fat, '%')).toBe('down 0.6 % since 3 Nov');
    expect(compChange(compSeries(COMP, 'leanMass', 'kg'), 'kg')).toBe('up 0.4 kg since 3 Nov');
    expect(compChange([{ date: day(3), value: 19 }], '%')).toBe('First reading, 3 Nov');
    expect(
      compChange(
        [
          { date: day(3), value: 19 },
          { date: day(9), value: 19 },
        ],
        '%',
      ),
    ).toBe('same as 3 Nov');
    expect(compNow([])).toBeNull();
    expect(compChange([], '%')).toBeNull();
  });

  it('geometry: null under 2 readings; dots inside the plot, labelled ends', () => {
    expect(compGeometry([{ date: day(3), value: 19 }])).toBeNull();
    const g = compGeometry(compSeries(COMP, 'bodyFat', 'kg'));
    expect(g?.dots).toHaveLength(3);
    for (const d of g?.dots ?? []) {
      expect(d.cx).toBeGreaterThanOrEqual(COMP_CHART.padL);
      expect(d.cx).toBeLessThanOrEqual(COMP_CHART.w - COMP_CHART.padR);
      expect(d.cy).toBeGreaterThanOrEqual(COMP_CHART.padT);
      expect(d.cy).toBeLessThanOrEqual(COMP_CHART.h - COMP_CHART.padB);
    }
    // Lower body fat sits lower on the chart (a bigger y).
    expect(g?.dots[2]?.cy).toBeGreaterThan(g?.dots[0]?.cy ?? 0);
    expect([g?.xFirst, g?.xLast]).toEqual(['3 Nov', '14 Nov']);
    expect([g?.yBottom.label, g?.yTop.label]).toEqual(['17.5', '19.5']);
    expect(g?.path.startsWith('M')).toBe(true);
  });

  it('not drawn without the prop or without a value', () => {
    expect(byAttr(render().el, 'data-body-comp')).toHaveLength(0);
    expect(byAttr(render({ bodyComp: [] }).el, 'data-body-comp')).toHaveLength(0);
    expect(byAttr(render({ bodyComp: [{ date: day(3) }] }).el, 'data-body-comp')).toHaveLength(0);
  });

  it('both trends sit between the weight trend and the 14-day list, and say where they come from', () => {
    const { el } = render({ bodyComp: COMP });
    const sec = oneAttr(el, 'data-body-comp');
    expect(BODY_COMP_NOTE).toContain('From Apple Health');
    expect(byAttr(sec, 'data-comp').map((c) => c.getAttribute('data-comp'))).toEqual([
      'bodyFat',
      'leanMass',
    ]);
    expect(oneAttr(sec, 'data-comp-now', 'bodyFat').textContent).toBe('18.4');
    expect(oneAttr(sec, 'data-comp-now', 'leanMass').textContent).toBe('57.6');
    expect(oneAttr(sec, 'data-comp-change', 'bodyFat').textContent).toBe('down 0.6 % since 3 Nov');
    const chart = oneAttr(sec, 'data-comp-chart', 'bodyFat');
    expect(chart.getAttribute('role')).toBe('img');
    expect(chart.getAttribute('aria-label')).toBe('Body fat from 3 Nov to 14 Nov: 19 % to 18.4 %.');
    expect(chart.byClass('bc-dot')).toHaveLength(3);
    // The chart is labelled in text: two values and two dates.
    expect(chart.byClass('bc-axis').map((t) => t.textContent)).toEqual([
      '19.5',
      '17.5',
      '3 Nov',
      '14 Nov',
    ]);
    expect(sec.textContent).toContain(BODY_COMP_NOTE);
    const order = el.find(
      (e) =>
        e.hasAttribute('data-trend-chart') ||
        e.hasAttribute('data-body-comp') ||
        e.hasAttribute('data-fuel-history'),
    );
    expect(order.map((e) => e.hasAttribute('data-body-comp'))).toEqual([false, true, false]);
    expect(copyHits(sec)).toEqual([]);
    expect(checkHealthCopy(sec.textContent).ok).toBe(true);
  });

  it('only one kind present: only that card; one reading: the number without a chart', () => {
    const { el } = render({ bodyComp: [{ date: day(14), bodyFatPct: 18.4 }] });
    const sec = oneAttr(el, 'data-body-comp');
    expect(byAttr(sec, 'data-comp')).toHaveLength(1);
    expect(byAttr(sec, 'data-comp-chart')).toHaveLength(0);
    expect(oneAttr(sec, 'data-comp-change', 'bodyFat').textContent).toBe('First reading, 14 Nov');
  });

  it('lean mass follows lb', () => {
    const { el } = render({ unit: 'lb', bodyComp: COMP });
    expect(oneAttr(el, 'data-comp-now', 'leanMass').textContent).toBe('127');
    expect(oneAttr(el, 'data-comp', 'leanMass').textContent).toContain('lb');
  });
});
