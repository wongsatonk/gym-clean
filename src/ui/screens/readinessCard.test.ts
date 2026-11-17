/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ReadinessCard } from '../../core/types';
import { program } from '../../data/catalog';
import { checkHealthCopy, deloadReason } from '../../core/health/copy';
import { todaysFeelOffers } from '../../core/health/readiness';
import { READINESS_COPY, readinessCard, readinessFixedCopy } from './readinessCard';
import { asFake, useFakeDom, type FakeEl } from './testDom';
import { todayScreen, ymd, type CalendarEntry, type TodayActions, type TodayProps } from './today';
import { kindWord, weekLoadLine, weekLoadText, type WeekLoad } from './weekLoad';

useFakeDom();

// Made-up card (public repo). Reasons are core's strings; these mirror SPEC's examples.
const NOW = new Date(2026, 10, 16, 8, 0).getTime();
const CARD: ReadinessCard = {
  date: ymd(NOW),
  signals: ['sleepShort', 'restingHrHigh'],
  reasons: [
    'Sleep was about 1 h 20 m shorter than usual.',
    'Resting heart rate is higher than usual.',
  ],
  offer: 'lighter',
};
const DELOAD: ReadinessCard = {
  ...CARD,
  reasons: [...CARD.reasons, deloadReason(3, 7)],
  offer: 'deload',
};
const DAY0 = program.days[0];

type Calls = { lighter: number; deload: number; postpone: number; keep: number };
function wired(c: Calls) {
  return {
    onLighterToday: () => c.lighter++,
    onDeloadWeek: () => c.deload++,
    onNotToday: () => c.postpone++,
    onTrainAsPlanned: () => c.keep++,
  };
}
const fresh = (): Calls => ({ lighter: 0, deload: 0, postpone: 0, keep: 0 });

function todayProps(over: Partial<TodayProps> = {}): TodayProps {
  return {
    now: NOW,
    days: program.days,
    upNextDayId: DAY0?.id ?? null,
    streakWeeks: 1,
    weekDots: [],
    last: null,
    unit: 'kg',
    ...over,
  };
}
function renderToday(over: Partial<TodayProps>, extra: Partial<TodayActions> = {}) {
  return asFake(
    todayScreen(todayProps(over), {
      onStart: () => {},
      onOpenDay: () => {},
      onTab: () => {},
      ...extra,
    }),
  );
}
const cardOf = (el: FakeEl) => el.find((e) => e.hasAttribute('data-readiness'));
const btn = (el: FakeEl, a: string) => el.find((e) => e.hasAttribute(a))[0];

describe('readiness card copy', () => {
  it('fixed words pass checkCopy + the M11 list', () => {
    for (const t of readinessFixedCopy()) expect(checkHealthCopy(t).hits, t).toEqual([]);
  });
  it('the rendered card (both offers) passes', () => {
    for (const card of [CARD, DELOAD]) {
      const el = asFake(readinessCard(card, wired(fresh())));
      const texts = el
        .find((e) => e.tag === '#text')
        .map((e) => e.text.trim())
        .filter(Boolean);
      for (const t of texts) expect(checkHealthCopy(t).hits, t).toEqual([]);
    }
  });
});

describe('readinessCard', () => {
  it('nothing without a card, without reasons, or without its callbacks', () => {
    const w = wired(fresh());
    expect(readinessCard(null, w)).toBeNull();
    expect(readinessCard(undefined, w)).toBeNull();
    expect(readinessCard({ ...CARD, reasons: [] }, w)).toBeNull();
    expect(readinessCard(CARD, { ...w, onLighterToday: undefined })).toBeNull();
    expect(readinessCard(CARD, { ...w, onNotToday: undefined })).toBeNull();
    expect(readinessCard(CARD, { ...w, onTrainAsPlanned: undefined })).toBeNull();
    expect(readinessCard(DELOAD, { ...w, onDeloadWeek: undefined })).toBeNull();
    // A lighter card doesn't need the deload callback, and vice versa.
    expect(readinessCard(CARD, { ...w, onDeloadWeek: undefined })).not.toBeNull();
    expect(readinessCard(DELOAD, { ...w, onLighterToday: undefined })).not.toBeNull();
  });

  it('lighter: title, reasons as facts, three buttons in order; taps reach the callbacks', () => {
    const c = fresh();
    const el = asFake(readinessCard(CARD, wired(c)));
    expect(el.getAttribute('data-readiness')).toBe('lighter');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBeNull(); // shown, not announced
    expect(el.oneByClass('readiness-title').textContent).toBe('Lighter today?');
    expect(
      el.find((e) => e.hasAttribute('data-readiness-reason')).map((r) => r.textContent),
    ).toEqual(CARD.reasons);
    const buttons = el.byTag('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Lighter today',
      'Not today',
      'Train as planned',
    ]);
    expect(buttons.every((b) => b.getAttribute('type') === 'button')).toBe(true);
    expect(buttons[0]?.classes).toContain('readiness-cta');
    expect(buttons[0]?.hasAttribute('data-readiness-lighter')).toBe(true);
    for (const b of buttons) b.click();
    expect(c).toEqual({ lighter: 1, deload: 0, postpone: 1, keep: 1 });
  });

  it('deload: core title, its reasons as-is, Deload week instead of Lighter today', () => {
    const c = fresh();
    const el = asFake(readinessCard(DELOAD, wired(c)));
    expect(el.getAttribute('data-readiness')).toBe('deload');
    expect(el.oneByClass('readiness-title').textContent).toBe(READINESS_COPY.deload.title);
    expect(
      el.find((e) => e.hasAttribute('data-readiness-reason')).map((r) => r.textContent),
    ).toEqual(DELOAD.reasons);
    const buttons = el.byTag('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Deload week',
      'Not today',
      'Train as planned',
    ]);
    expect(btn(el, 'data-readiness-lighter')).toBeUndefined();
    btn(el, 'data-readiness-deload')?.click();
    expect(c).toEqual({ lighter: 0, deload: 1, postpone: 0, keep: 0 });
  });

  it('CSS: buttons ≥ 56px, text at body size or larger, tokens only', () => {
    const css = readFileSync(new URL('./readinessCard.css', import.meta.url), 'utf8');
    const rule = (sel: string) => css.match(new RegExp(`\\n${sel} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('\\.readiness-btn')).toContain('min-height: var(--tap-min)');
    expect(rule('\\.readiness-btn')).toContain('font-size: var(--fs-body)');
    expect(rule('\\.readiness-reasons')).toContain('font-size: var(--fs-body)');
    expect(rule('\\.readiness-title')).toContain('font-size: var(--fs-lead)');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*\d/);
  });
});

describe('Today with the readiness card', () => {
  it('without the prop (or callbacks) Today is unchanged', () => {
    const plain = renderToday({});
    expect(cardOf(plain)).toHaveLength(0);
    const unwired = renderToday({ readiness: CARD });
    expect(cardOf(unwired)).toHaveLength(0);
    expect(unwired.textContent).toBe(plain.textContent);
  });

  it('M13: first in the "things to sort" row below the hero, then Adjusted, then the missing-kit prompt; Start untouched', () => {
    const c = fresh();
    const starts: string[] = [];
    const el = renderToday(
      {
        readiness: CARD,
        missingKit: { exerciseId: 'x', name: 'Leg Press' },
        adjustedToday: 'Easy on arms',
      },
      {
        ...wired(c),
        onSeeGymSwap: () => {},
        onKeepExercise: () => {},
        onStart: (d) => starts.push(d.id),
      },
    );
    expect(cardOf(el)).toHaveLength(1);
    const top = el.children;
    const hero = top.findIndex((k) => k.classes.includes('hero'));
    const row = top.findIndex((k) => k.hasAttribute('data-notices'));
    expect(row).toBeGreaterThan(hero);
    const kids = (top[row] as FakeEl).find((k) => k.hasAttribute('data-notices-list'))[0]
      ?.children as FakeEl[];
    const idx = (pred: (k: FakeEl) => boolean) => kids.findIndex(pred);
    const ready = idx((k) => k.hasAttribute('data-readiness'));
    const adj = idx((k) => k.hasAttribute('data-adjusted'));
    const gym = idx((k) => k.hasAttribute('data-gym-prompt'));
    expect([ready, adj, gym]).toEqual([0, 1, 2]);
    btn(el, 'data-readiness-lighter')?.click();
    expect(c.lighter).toBe(1);
    expect(starts).toEqual([]);
    btn(el, 'data-start')?.click();
    expect(starts).toEqual([DAY0?.id]);
  });

  it('never on a rest day', () => {
    const cal: CalendarEntry[] = [{ date: ymd(NOW), dayId: null, rest: true }];
    const el = renderToday({ readiness: CARD, calendar: cal }, wired(fresh()));
    expect(el.find((e) => e.getAttribute('data-hero') === 'rest')).toHaveLength(1);
    expect(cardOf(el)).toHaveLength(0);
  });
});

describe('the card stays off workout screens and is never spoken', () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('Exercise and camera screens never import it', () => {
    for (const p of ['./exercise.ts', '../cameraView.ts', '../cameraRestPanel.ts', './rest.ts']) {
      const s = src(p);
      expect(s, p).not.toMatch(/readinessCard|data-readiness/);
    }
  });

  it('the card module imports no voice', () => {
    expect(src('./readinessCard.ts')).not.toMatch(/from '\.\.\/voice'|speechSynthesis|speak\(/);
  });
});

describe('weekly load line', () => {
  const LOAD: WeekLoad = {
    gymSessions: 3,
    outside: [
      { kind: 'running', minutes: 40 },
      { kind: 'soccer', minutes: 90 },
    ],
  };

  it('weekLoadText (SPEC example), singulars, none, +N more', () => {
    expect(weekLoadText(LOAD)).toBe(
      'This week: 3 gym sessions, 2 other workouts (run 40 min, football 90 min)',
    );
    expect(weekLoadText({ gymSessions: 1, outside: [{ kind: 'cycling', minutes: 29.6 }] })).toBe(
      'This week: 1 gym session, 1 other workout (ride 30 min)',
    );
    expect(weekLoadText({ gymSessions: 0, outside: [] })).toBe(
      'This week: 0 gym sessions, no other workouts',
    );
    const many = Array.from({ length: 5 }, () => ({ kind: 'yoga', minutes: 30 }));
    expect(weekLoadText({ gymSessions: 2, outside: many })).toBe(
      'This week: 2 gym sessions, 5 other workouts (yoga 30 min, yoga 30 min, yoga 30 min, +2 more)',
    );
  });

  it('kindWord: known words, camelCase split, empty → workout', () => {
    expect(kindWord('highIntensityIntervalTraining')).toBe('HIIT');
    expect(kindWord('tableTennis')).toBe('table tennis');
    expect(kindWord('')).toBe('workout');
  });

  it('passes the copy check', () => {
    expect(checkHealthCopy(weekLoadText(LOAD)).hits).toEqual([]);
  });

  it('on Today: under "Your week", right above the strip; absent without the prop', () => {
    expect(weekLoadLine(null)).toBeNull();
    const el = renderToday({ weekLoad: LOAD });
    const kids = el.children;
    const line = kids.findIndex((k) => k.hasAttribute('data-week-load'));
    const head = kids.findIndex((k) => k.classes.includes('days-head'));
    const strip = kids.findIndex((k) => k.hasAttribute('data-day-strip'));
    expect(line).toBe(head + 1);
    expect(strip).toBe(line + 1);
    expect(kids[line]?.getAttribute('data-other')).toBe('2');
    expect(renderToday({}).find((e) => e.hasAttribute('data-week-load'))).toHaveLength(0);
  });

  it('CSS: body size, tokens only', () => {
    const css = readFileSync(new URL('./weekLoad.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.week-load \{[^}]*font-size: var\(--fs-body\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe('readiness card: "Go easy on … today?" (M12 1b task 31)', () => {
  // Made-up "feel today" answer: low energy + sore shoulders and legs → the card shows.
  const SORE: ReadinessCard = {
    date: ymd(NOW),
    signals: ['feltLow', 'sore'],
    reasons: ['You said your energy is low today.', 'You said your shoulders and legs are sore.'],
    offer: 'lighter',
  };
  const OFFERS = todaysFeelOffers(
    [{ date: ymd(NOW), energy: 2, sore: ['legs', 'shoulders'] }],
    ymd(NOW),
  );

  it('one offer per sore area, after the main choice; a tap passes the area out', () => {
    const areas: string[] = [];
    const el = asFake(
      readinessCard(SORE, { ...wired(fresh()), onEasyOn: (a) => areas.push(a) }, OFFERS),
    );
    const offers = el.find((e) => e.hasAttribute('data-easy-on'));
    expect(offers.map((o) => o.textContent)).toEqual([
      'Go easy on shoulders today?',
      'Go easy on legs today?',
    ]);
    expect(offers.every((o) => o.tag === 'button' && o.classes.includes('readiness-btn'))).toBe(
      true,
    );
    const order = el
      .find((e) => e.tag === 'button')
      .map((b) => (b.hasAttribute('data-easy-on') ? 'easy' : b.textContent));
    expect(order).toEqual(['Lighter today', 'easy', 'easy', 'Not today', 'Train as planned']);
    offers[1]?.click();
    expect(areas).toEqual(['legs']);
  });

  it('no offers when sore is not a reason, without offers, or without onEasyOn', () => {
    const on = { ...wired(fresh()), onEasyOn: () => {} };
    const has = (el: HTMLElement | null) =>
      asFake(el).find((e) => e.hasAttribute('data-easy-on')).length;
    expect(has(readinessCard(CARD, on, OFFERS))).toBe(0);
    expect(has(readinessCard(SORE, on))).toBe(0);
    expect(has(readinessCard(SORE, wired(fresh()), OFFERS))).toBe(0);
  });

  it('on Today the offers sit on the card, not again on the feel row', () => {
    const el = renderToday(
      { readiness: SORE, feelOffers: OFFERS, feel: { date: ymd(NOW), energy: 2, sore: ['legs'] } },
      { ...wired(fresh()), onEasyOn: () => {}, onSaveFeel: () => {} },
    );
    const offers = el.find((e) => e.hasAttribute('data-easy-on'));
    expect(offers).toHaveLength(2);
    const card = cardOf(el)[0] as FakeEl;
    expect(offers.every((o) => card.find((e) => e === o).length === 1)).toBe(true);
  });

  it('a sore area alone (no card): the offer is on the feel row instead', () => {
    const el = renderToday(
      { readiness: null, feelOffers: OFFERS, feel: { date: ymd(NOW), sore: ['legs'] } },
      { ...wired(fresh()), onEasyOn: () => {}, onSaveFeel: () => {} },
    );
    const row = el.find((e) => e.hasAttribute('data-feel-today'))[0] as FakeEl;
    expect(row.find((e) => e.hasAttribute('data-easy-on'))).toHaveLength(2);
  });
});
