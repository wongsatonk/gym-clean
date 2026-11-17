import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeekDot } from '../../core/stats';
import type { ProgramDay } from '../../core/types';
import { dayMuscles, estimateMinutes } from '../../core/dayInfo';
import { exerciseById, program } from '../../data/catalog';
import { tabBar, type TabId } from '../tabBar';
import { FakeEl, asFake, useFakeDom } from './testDom';
import { previewScreen, type PreviewRow } from './preview';
import type { MissedDay } from '../../core/progress/completion';
import { checkCopy } from '../../core/trainer/replies';
import {
  createTodayMotion,
  dateLabel,
  missedDayText,
  isMoved,
  noticesLabel,
  todayScreen,
  volumeLine,
  whenLabel,
  ymd,
  type CalendarEntry,
  type TodayProps,
} from './today';

useFakeDom();

// ---------- data ----------

const DAYS = program.days;
const PULL_A = DAYS.find((d) => d.name === 'Pull A') as ProgramDay;
const NOW = new Date(2026, 10, 13, 18, 0).getTime(); // Fri 13 Nov 2026, local
const dayAt = (offset: number) => new Date(2026, 10, 9 + offset).getTime(); // Monday 9 Nov
const DOTS: WeekDot[] = [
  { dayStart: dayAt(0), state: 'done' },
  { dayStart: dayAt(1), state: 'rest' },
  { dayStart: dayAt(2), state: 'done' },
  { dayStart: dayAt(3), state: 'rest' },
  { dayStart: dayAt(4), state: 'today' },
  { dayStart: dayAt(5), state: 'future' },
  { dayStart: dayAt(6), state: 'future' },
];

function props(over: Partial<TodayProps> = {}): TodayProps {
  return {
    now: NOW,
    days: DAYS,
    upNextDayId: PULL_A.id,
    streakWeeks: 3,
    weekDots: DOTS,
    last: {
      dayName: 'Push A',
      date: new Date(2026, 10, 11, 18).getTime(),
      durationMs: 42 * 60000,
      volumeKg: 3200,
      volumeVsLast: 6,
    },
    doneThisWeek: { [DAYS[0]?.id ?? '']: dayAt(0) },
    unit: 'kg',
    ...over,
  };
}

function render(over: Partial<TodayProps> = {}) {
  const calls: { start: string[]; open: string[]; tab: TabId[] } = { start: [], open: [], tab: [] };
  const el = asFake(
    todayScreen(props(over), {
      onStart: (d) => calls.start.push(d.id),
      onOpenDay: (d) => calls.open.push(d.id),
      onTab: (t) => calls.tab.push(t),
    }),
  );
  return { el, calls };
}

// ---------- tests ----------

// The helpers' unit tests live in src/core/dayInfo.test.ts; these check them on the real program.
describe('dayInfo on the vendored program', () => {
  it('estimates every day at 30 min or more', () => {
    for (const d of DAYS) expect(estimateMinutes(d)).toBeGreaterThanOrEqual(30);
  });

  it('finds primary muscles for Pull A, none of them also listed as secondary', () => {
    const m = dayMuscles(PULL_A, exerciseById);
    expect(m.primary.length).toBeGreaterThan(0);
    expect(m.secondary.some((s) => m.primary.includes(s))).toBe(false);
  });
});

describe('Today labels', () => {
  it('formats the date, the last-session day and the volume line', () => {
    expect(dateLabel(NOW)).toBe('Fri 13 Nov');
    expect(whenLabel(new Date(2026, 10, 11).getTime(), NOW)).toBe('Wed');
    expect(whenLabel(new Date(2026, 10, 3).getTime(), NOW)).toBe('3 Nov');
    expect(volumeLine({ volumeKg: 100, volumeVsLast: 6 }, 'kg')).toEqual({
      text: '+6% volume',
      tone: 'up',
    });
    expect(volumeLine({ volumeKg: 100, volumeVsLast: 0 }, 'kg').text).toBe('Same volume');
    expect(volumeLine({ volumeKg: 100, volumeVsLast: -4 }, 'kg')).toEqual({
      text: '−4% volume',
      tone: 'flat',
    });
  });

  it('falls back when volumeVsLast is null: weight lifted, or a bodyweight day', () => {
    expect(volumeLine({ volumeKg: 3200, volumeVsLast: null }, 'kg').text).toBe('3,200 kg lifted');
    expect(volumeLine({ volumeKg: 3200, volumeVsLast: null }, 'lb').text).toBe('7,054.8 lb lifted');
    expect(volumeLine({ volumeKg: 0, volumeVsLast: null }, 'kg')).toEqual({
      text: 'Bodyweight day',
      tone: 'flat',
    });
  });
});

describe('todayScreen', () => {
  it('is an Energy screen with the hero for the up-next day', () => {
    const { el } = render();
    expect(el.tag).toBe('main');
    expect(el.classes).toEqual(expect.arrayContaining(['screen', 'today', 'mood-energy']));
    expect(el.getAttribute('data-screen')).toBe('today');
    const hero = el.oneByClass('hero');
    expect(hero.getAttribute('data-hero')).toBe(PULL_A.id);
    expect(hero.byTag('h1')[0]?.textContent).toBe('Pull A');
    const idx = DAYS.indexOf(PULL_A) + 1;
    expect(hero.oneByClass('eyebrow').textContent).toBe(`Next up · Day ${idx} of ${DAYS.length}`);
    expect(hero.oneByClass('hero-meta').textContent).toBe(
      `${PULL_A.exercises.length} exercises~${estimateMinutes(PULL_A)} min`,
    );
    const chips = hero.byClass('chip').map((c) => c.textContent);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.length).toBeLessThanOrEqual(3);
    expect(hero.oneByClass('hero-fig').innerHTML).toContain('body-map--mini');
  });

  it('Start workout calls onStart with the up-next day; the silent hint sits right above it', () => {
    const hint = new FakeEl('div');
    hint.setAttribute('data-silent-hint', '');
    const { el, calls } = render({ hint: hint as unknown as HTMLElement });
    const hero = el.oneByClass('hero');
    const start = hero.oneByClass('hero-cta');
    expect(start.textContent).toBe('Start workout');
    const i = hero.children.indexOf(start);
    expect(hero.children[i - 1]).toBe(hint);
    start.click();
    expect(calls.start).toEqual([PULL_A.id]);
  });

  it('disables Start while the up-next day is unknown (history loading)', () => {
    const { el, calls } = render({ upNextDayId: null });
    const start = el.oneByClass('hero-cta');
    expect(start.hasAttribute('disabled')).toBe(true);
    expect(start.textContent).toBe('Loading…');
    // The placeholder heading has a spoken name, not just "…".
    const h1 = el.byTag('h1')[0];
    expect(h1?.oneByClass('sr-only').textContent).toBe('Loading');
    start.click();
    expect(calls.start).toEqual([]);
    expect(el.byClass('up-next')).toHaveLength(0);
  });

  it('streak tile: the number, wk/wks, 7 dots with spoken-safe text', () => {
    const { el } = render();
    const tile = el.oneByClass('streak');
    expect(tile.oneByClass('tile-num').textContent).toBe('3wks');
    const dots = tile.byClass('wd');
    expect(dots.map((d) => d.getAttribute('data-dot'))).toEqual(DOTS.map((d) => d.state));
    expect(dots[0]?.oneByClass('sr-only').textContent).toBe('Monday: trained');
    expect(dots[4]?.oneByClass('sr-only').textContent).toBe('Friday: today');
    expect(render({ streakWeeks: 1 }).el.oneByClass('tile-num').textContent).toBe('1wk');
    expect(render({ streakWeeks: 0 }).el.oneByClass('tile-num').textContent).toBe('0wks');
  });

  it('last-time tile: day, when, minutes, trend; and its empty state', () => {
    const { el } = render();
    const tile = el.oneByClass('last');
    expect(tile.oneByClass('last-name').textContent).toBe('Push A');
    expect(tile.oneByClass('last-meta').textContent).toBe('Wed · 42 min');
    expect(tile.oneByClass('trend').textContent).toBe('+6% volume');
    expect(tile.oneByClass('trend').getAttribute('data-volume')).toBe('up');

    const bw = render({
      last: {
        dayName: 'Pull B',
        date: NOW - 3600000,
        durationMs: 0,
        volumeKg: 0,
        volumeVsLast: null,
      },
    });
    expect(bw.el.oneByClass('trend').textContent).toBe('Bodyweight day');
    expect(bw.el.oneByClass('last-meta').textContent).toBe('Fri · 1 min');

    const none = render({ last: null }).el.oneByClass('last');
    expect(none.getAttribute('data-last-session')).toBe('none');
    expect(none.oneByClass('last-name').textContent).toBe('None yet');
  });

  it('day strip keeps the e2e hooks: one .day-btn per day, data-day, .up-next on the next', () => {
    const { el, calls } = render();
    const btns = el.byClass('day-btn');
    expect(btns).toHaveLength(DAYS.length);
    expect(btns.map((b) => b.getAttribute('data-day'))).toEqual(DAYS.map((d) => d.id));
    expect(btns.every((b) => b.tag === 'button')).toBe(true);
    const next = el.byClass('up-next');
    expect(next).toHaveLength(1);
    expect(next[0]?.textContent).toBe('Pull ANext');
    // Done this week: ✓ + weekday. Others: exercise count.
    expect(btns[0]?.classes).toContain('done');
    expect(btns[0]?.oneByClass('day-when').textContent).toBe('Mon');
    const other = btns.find((b) => !b.classes.includes('done') && !b.classes.includes('up-next'));
    expect(other?.oneByClass('day-when').textContent).toMatch(/^\d+ exercises$/);
    // Every card has a mini figure, aria-hidden (the text names the day).
    for (const b of btns) {
      const fig = b.oneByClass('day-fig');
      expect(fig.getAttribute('aria-hidden')).toBe('true');
      expect(fig.innerHTML).toContain('data-size="mini"');
    }
    btns[2]?.click();
    expect(calls.open).toEqual([DAYS[2]?.id]);
  });

  it('ends with the tab bar, Today current; the other tabs call onTab', () => {
    const { el, calls } = render();
    const bar = el.children.at(-1) as FakeEl;
    expect(bar.classes).toContain('tabbar');
    const tabs = bar.byClass('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Today',
      'Fuel',
      'Coach',
      'Calendar',
      'Settings',
    ]);
    expect(tabs[0]?.getAttribute('aria-current')).toBe('page');
    expect(tabs[1]?.getAttribute('aria-current')).toBeNull();
    tabs.forEach((t) => t.click());
    expect(calls.tab).toEqual(['fuel', 'coach', 'calendar', 'settings']);
  });
});

describe('tabBar', () => {
  it('labels every tab and marks the active one', () => {
    const picked: TabId[] = [];
    const bar = asFake(tabBar('settings', (t) => picked.push(t)));
    expect(bar.tag).toBe('nav');
    expect(bar.getAttribute('aria-label')).toBe('Main');
    const tabs = bar.byClass('tab');
    expect(tabs.map((t) => t.getAttribute('data-tab'))).toEqual([
      'today',
      'fuel',
      'coach',
      'calendar',
      'settings',
    ]);
    expect(tabs.every((t) => t.byClass('tab-label').length === 1)).toBe(true);
    expect(tabs[4]?.classes).toContain('on');
    tabs[0]?.click();
    expect(picked).toEqual(['today']);
  });
});

describe('previewScreen', () => {
  const rows: PreviewRow[] = PULL_A.exercises.map((p, i) => ({
    exerciseId: p.exerciseId,
    tracking: p.tracking,
    name: `Ex ${i}`,
    plan: `${p.sets} × 8–12 reps · 15 kg`,
    machine: i === 0 ? 'Seat 4' : undefined,
    last: i === 1 ? '8×40, 8×40 kg' : undefined,
  }));

  function renderPreview(loading: boolean, hint?: FakeEl) {
    const calls = { back: 0, start: [] as string[] };
    const el = asFake(
      previewScreen(
        {
          day: PULL_A,
          position: 2,
          total: 6,
          rows,
          loading,
          hint: hint as unknown as HTMLElement | undefined,
        },
        { onBack: () => calls.back++, onStart: (d) => calls.start.push(d.id) },
      ),
    );
    return { el, calls };
  }

  it('keeps the preview hooks: data-screen, ‹ Back, .ex-row per exercise, machine, last time', () => {
    const { el, calls } = renderPreview(false);
    expect(el.getAttribute('data-screen')).toBe('preview');
    expect(el.classes).toContain('mood-energy');
    // M13 task 20: the shared back button (chevron icon + "Back"); the old text was "‹ Back".
    const back = el.byTag('button').find((b) => /^(‹ )?Back$/.test(b.textContent));
    back?.click();
    expect(calls.back).toBe(1);
    expect(el.byTag('h1')[0]?.textContent).toBe('Pull A');
    expect(el.oneByClass('eyebrow').textContent).toBe('Day 2 of 6');
    const items = el.byClass('ex-row');
    expect(items).toHaveLength(PULL_A.exercises.length);
    expect(items[0]?.textContent).toContain('Machine: Seat 4');
    expect(items[1]?.textContent).toContain('Last time: 8×40, 8×40 kg');
    expect(items[0]?.byClass('ex-badges')).toHaveLength(1);
  });

  it('Start reads Loading… and is disabled while loading; the hint sits above it', () => {
    const hint = new FakeEl('div');
    const loading = renderPreview(true, hint);
    const bottom = loading.el.oneByClass('sticky-bottom');
    expect(bottom.children[0]).toBe(hint);
    const start = bottom.oneByClass('primary-btn');
    expect(start.textContent).toBe('Loading…');
    expect(start.hasAttribute('disabled')).toBe(true);

    const ready = renderPreview(false);
    const go = ready.el.oneByClass('sticky-bottom').oneByClass('primary-btn');
    expect(go.textContent).toBe('Start workout');
    go.click();
    expect(ready.calls.start).toEqual([PULL_A.id]);
  });
});

// ---------- M10 trainer props ----------

describe('todayScreen with M10 trainer props', () => {
  const ids = DAYS.map((d) => d.id);
  // Mon 9 – Sun 15 Nov; NOW is Fri 13. Wed is a rest weekday; Fri was postponed (rest
  // override) and Sat runs the moved day.
  const CAL: CalendarEntry[] = [
    { date: '2026-11-09', dayId: ids[0] ?? null, rest: false },
    { date: '2026-11-10', dayId: ids[1] ?? null, rest: false },
    { date: '2026-11-11', dayId: null, rest: true },
    { date: '2026-11-12', dayId: ids[2] ?? null, rest: false },
    { date: '2026-11-13', dayId: null, rest: true, override: { date: '2026-11-13', rest: true } },
    {
      date: '2026-11-14',
      dayId: PULL_A.id,
      rest: false,
      override: { date: '2026-11-14', dayId: PULL_A.id },
    },
    { date: '2026-11-15', dayId: ids[4] ?? null, rest: false },
  ];

  function renderM10(over: Partial<TodayProps> = {}, withActions = true) {
    const calls = { start: [] as string[], train: [] as string[], coach: 0, undo: 0 };
    const el = asFake(
      todayScreen(props(over), {
        onStart: (d) => calls.start.push(d.id),
        onOpenDay: () => undefined,
        onTab: () => undefined,
        ...(withActions
          ? {
              onCoach: () => calls.coach++,
              onUndoAdjust: () => calls.undo++,
              onTrainAnyway: (d: ProgramDay) => calls.train.push(d.id),
            }
          : {}),
      }),
    );
    return { el, calls };
  }

  it('without trainer props renders none of the M10 parts', () => {
    const { el } = render();
    expect(el.find((e) => e.hasAttribute('data-coach-open'))).toHaveLength(0);
    expect(el.find((e) => e.hasAttribute('data-adjusted'))).toHaveLength(0);
    expect(el.byClass('cal-card')).toHaveLength(0);
    expect(el.oneByClass('appbar').children[1]?.classes).toEqual(['date']);
    expect(el.oneByClass('days-head').textContent).toBe(`Your week${DAYS.length}-day split`);
  });

  it('M13: no Coach button in the app bar, even with onCoach (the Coach tab is the way in)', () => {
    const { el, calls } = renderM10();
    expect(el.find((e) => e.hasAttribute('data-coach-open'))).toHaveLength(0);
    expect(el.byClass('coach-btn')).toHaveLength(0);
    const bar = el.oneByClass('appbar');
    expect(bar.children.map((c) => c.classes[0])).toEqual(['brand', 'date']);
    expect(bar.oneByClass('date').textContent).toBe('Fri 13 Nov');
    expect(calls.coach).toBe(0);
  });

  it('shows "Adjusted today: …" with Undo as the one notice, right below the hero', () => {
    const { el, calls } = renderM10({ adjustedToday: 'Easy on arms · 2 swaps' });
    const banner = el.oneByClass('adjusted-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.oneByClass('adjusted-text').textContent).toBe(
      'Adjusted today: Easy on arms · 2 swaps',
    );
    expect(el.children.indexOf(banner)).toBe(el.children.indexOf(el.oneByClass('hero')) + 1);
    const undo = banner.find((e) => e.hasAttribute('data-undo-adjust'))[0];
    expect(undo?.textContent).toBe('Undo');
    undo?.click();
    expect(calls.undo).toBe(1);
    expect(renderM10({ adjustedToday: null }).el.byClass('adjusted-banner')).toHaveLength(0);
  });

  it('a rest day today shows "Rest day" with Train anyway, never disabled', () => {
    const { el, calls } = renderM10({ calendar: CAL });
    const hero = el.oneByClass('hero');
    expect(hero.getAttribute('data-hero')).toBe('rest');
    expect(hero.byTag('h1')[0]?.textContent).toBe('Rest day');
    expect(hero.oneByClass('rest-next').textContent).toBe('Next up: Pull A');
    const cta = hero.oneByClass('hero-cta');
    expect(cta.textContent).toBe('Train anyway');
    expect(cta.hasAttribute('disabled')).toBe(false);
    expect(cta.getAttribute('data-start')).toBe(PULL_A.id);
    cta.click();
    expect(calls.train).toEqual([PULL_A.id]);
    expect(calls.start).toEqual([]);
  });

  it('Train anyway falls back to onStart when no onTrainAnyway is given', () => {
    const { el, calls } = renderM10({ calendar: CAL }, false);
    el.oneByClass('hero-cta').click();
    expect(calls.start).toEqual([PULL_A.id]);
  });

  it('a training day in the calendar keeps the normal hero', () => {
    const cal = CAL.map((e) =>
      e.date === '2026-11-13' ? { date: e.date, dayId: PULL_A.id, rest: false } : e,
    );
    const hero = renderM10({ calendar: cal }).el.oneByClass('hero');
    expect(hero.getAttribute('data-hero')).toBe(PULL_A.id);
    expect(hero.oneByClass('hero-cta').textContent).toBe('Start workout');
  });

  it('the week strip follows the calendar: dated cards, rest cards, moved days marked', () => {
    const { el } = renderM10({ calendar: CAL, doneThisWeek: { [ids[0] ?? '']: dayAt(0) } });
    const cards = el.oneByClass('day-strip').children;
    expect(cards.map((c) => c.getAttribute('data-cal'))).toEqual(CAL.map((e) => e.date));
    // Training days are .day-btn buttons (open the preview); rest days are not buttons.
    expect(cards.map((c) => c.tag)).toEqual([
      'button',
      'button',
      'div',
      'button',
      'div',
      'button',
      'button',
    ]);
    expect(cards[0]?.getAttribute('data-day')).toBe(ids[0]);
    expect(cards[2]?.hasAttribute('data-rest')).toBe(true);
    expect(cards[2]?.oneByClass('day-name').textContent).toBe('Rest');
    // Dates; today reads "Today".
    expect(cards[0]?.oneByClass('cal-date').textContent).toBe('Mon 9');
    expect(cards[4]?.oneByClass('cal-date').textContent).toBe('Today');
    expect(cards[4]?.classes).toContain('today');
    // Done on its date.
    expect(cards[0]?.classes).toContain('done');
    expect(cards[0]?.oneByClass('day-when').textContent).toBe('Done');
    // Today was postponed (rest override) and Sat runs the moved day: both marked Moved.
    expect(cards[4]?.classes).toContain('moved');
    expect(cards[4]?.oneByClass('day-when').textContent).toBe('Moved');
    expect(cards[5]?.classes).toEqual(expect.arrayContaining(['moved', 'up-next']));
    expect(cards[5]?.oneByClass('day-when').textContent).toBe('Moved');
    expect(cards[5]?.oneByClass('sr-only').textContent).toBe(' (next, moved)');
    // A plain rest weekday isn't moved.
    expect(cards[2]?.classes).not.toContain('moved');
    expect(cards[2]?.oneByClass('day-when').textContent).toBe('Off');
    // Exactly one up-next.
    expect(el.byClass('up-next')).toHaveLength(1);
  });

  it('marks an adjusted (not moved) day and puts Next on the first upcoming run of it', () => {
    const cal: CalendarEntry[] = [
      { date: '2026-11-12', dayId: PULL_A.id, rest: false },
      {
        date: '2026-11-13',
        dayId: PULL_A.id,
        rest: false,
        override: {
          date: '2026-11-13',
          adjust: { kind: 'lighter', exercises: PULL_A.exercises },
        },
      },
      { date: '2026-11-14', dayId: PULL_A.id, rest: false },
    ];
    const cards = renderM10({ calendar: cal, doneThisWeek: {} }).el.oneByClass(
      'day-strip',
    ).children;
    expect(cards[0]?.classes).not.toContain('up-next');
    expect(cards[1]?.classes).toContain('up-next');
    expect(cards[1]?.oneByClass('day-when').textContent).toBe('Next');
    expect(cards[1]?.oneByClass('sr-only').textContent).toBe(' (next, adjusted)');
    expect(cards[2]?.classes).not.toContain('up-next');
    expect(isMoved(cal[1] as CalendarEntry)).toBe(false);
  });

  it('ymd is the local date', () => {
    expect(ymd(NOW)).toBe('2026-11-13');
    expect(ymd(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});

describe('previewScreen with M10 trainer props', () => {
  const base: PreviewRow[] = PULL_A.exercises.map((p, i) => ({
    exerciseId: p.exerciseId,
    tracking: p.tracking,
    name: `Ex ${i}`,
    plan: `${p.sets} × 8–12 reps`,
  }));

  it('without trainer props: no Coach, no banner, no badges, no removed list', () => {
    const el = asFake(
      previewScreen(
        { day: PULL_A, position: 1, total: 6, rows: base, loading: false },
        { onBack: () => undefined, onStart: () => undefined },
      ),
    );
    expect(el.byClass('coach-btn')).toHaveLength(0);
    expect(el.byClass('adjusted-banner')).toHaveLength(0);
    expect(el.byClass('adj-badge')).toHaveLength(0);
    expect(el.byClass('removed-list')).toHaveLength(0);
  });

  it('shows Coach, the banner with Undo, Adjusted badges and the removed rows', () => {
    const rows: PreviewRow[] = base.map((r, i) =>
      i === 0
        ? { ...r, adjusted: 'swap', adjustNote: 'Swapped for Hammer Curls' }
        : i === 1
          ? { ...r, adjusted: 'lighter', adjustNote: '−1 set, −10% weight' }
          : r,
    );
    const calls = { coach: 0, undo: 0 };
    const el = asFake(
      previewScreen(
        {
          day: PULL_A,
          position: 1,
          total: 6,
          rows,
          loading: false,
          adjustedToday: 'Easy on arms',
          removedRows: [
            {
              exerciseId: 'Barbell_Curl',
              tracking: 'manual',
              name: 'Barbell Curl',
              plan: '',
              adjusted: 'removed',
            },
          ],
        },
        {
          onBack: () => undefined,
          onStart: () => undefined,
          onCoach: () => calls.coach++,
          onUndoAdjust: () => calls.undo++,
        },
      ),
    );
    const top = el.oneByClass('top-bar');
    top.oneByClass('coach-btn').click();
    expect(calls.coach).toBe(1);
    const banner = el.oneByClass('adjusted-banner');
    expect(banner.oneByClass('adjusted-text').textContent).toBe('Adjusted today: Easy on arms');
    banner.oneByClass('adjusted-undo').click();
    expect(calls.undo).toBe(1);

    // .ex-row still counts the exercises that run; changed rows carry the badge + note.
    const items = el.byClass('ex-row');
    expect(items).toHaveLength(PULL_A.exercises.length);
    expect(items[0]?.getAttribute('data-adjusted')).toBe('swap');
    expect(items[0]?.oneByClass('adj-badge').textContent).toBe('Adjusted');
    expect(items[0]?.oneByClass('adj-note').textContent).toBe('Swapped for Hammer Curls');
    expect(items[1]?.getAttribute('data-adjusted')).toBe('lighter');
    expect(items[2]?.byClass('adj-badge')).toHaveLength(0);
    expect(items[2]?.getAttribute('data-adjusted')).toBeNull();

    const removed = el.oneByClass('removed-list');
    expect(removed.oneByClass('removed-title').textContent).toBe('Taken out today');
    const r = removed.oneByClass('ex-row-removed');
    expect(r.getAttribute('data-adjusted')).toBe('removed');
    expect(r.textContent).toBe('Barbell CurlAdjustedRemoved today');
  });
});

describe('todayScreen M7 nudge', () => {
  const nudges = (el: FakeEl) => el.find((e) => e.hasAttribute('data-fuel-nudge'));

  it('hidden without the nudge prop, or without onDismissNudge', () => {
    expect(nudges(render().el)).toHaveLength(0);
    expect(nudges(render({ nudge: '40 g protein to go today.' }).el)).toHaveLength(0);
  });

  it('shown below the hero (M13: hero first) with Dismiss and Log food', () => {
    let dismissed = 0;
    let opened = 0;
    const el = asFake(
      todayScreen(props({ nudge: '40 g protein to go today.' }), {
        onStart: () => undefined,
        onOpenDay: () => undefined,
        onTab: () => undefined,
        onDismissNudge: () => dismissed++,
        onOpenFuel: () => opened++,
      }),
    );
    const n = nudges(el);
    expect(n).toHaveLength(1);
    expect(n[0]?.textContent).toContain('40 g protein to go today.');
    const idx = el.children.findIndex((c) => c.hasAttribute('data-fuel-nudge'));
    const hero = el.children.findIndex((c) => c.classes.some((k) => k.includes('hero')));
    expect(idx).toBe(hero + 1);
    n[0]?.find((e) => e.hasAttribute('data-nudge-dismiss'))[0]?.click();
    n[0]?.find((e) => e.hasAttribute('data-nudge-open'))[0]?.click();
    expect([dismissed, opened]).toEqual([1, 1]);
  });
});

// ---------- M12 task 14: missed-day card + first-load motion ----------

const PUSH_A = DAYS.find((d) => d.name === 'Push A') as ProgramDay;
const MISSED: MissedDay = { date: '2026-11-10', dayId: PUSH_A.id, name: 'Push A' };

function renderM12(over: Partial<TodayProps> = {}, withMissed = true) {
  const calls = { move: [] as MissedDay[], skip: [] as MissedDay[] };
  const el = asFake(
    todayScreen(props(over), {
      onStart: () => {},
      onOpenDay: () => {},
      onTab: () => {},
      onLighterToday: () => {},
      onNotToday: () => {},
      onTrainAsPlanned: () => {},
      ...(withMissed
        ? { onMoveMissed: (m) => calls.move.push(m), onSkipMissed: (m) => calls.skip.push(m) }
        : {}),
    }),
  );
  return { el, calls };
}
const byAttr = (el: FakeEl, name: string) => el.find((e) => e.hasAttribute(name));

describe('Today: missed-day card (M12)', () => {
  it('says which day was missed, with Move it / Skip it passing the missed day out', () => {
    const { el, calls } = renderM12({ missedDay: MISSED });
    const card = byAttr(el, 'data-missed-day');
    expect(card).toHaveLength(1);
    expect(card[0]?.getAttribute('data-missed-day')).toBe('2026-11-10');
    expect(card[0]?.getAttribute('role')).toBe('status');
    expect(card[0]?.oneByClass('missed-text').textContent).toBe('You missed Push A on Tue.');
    const move = byAttr(el, 'data-missed-move')[0];
    const skip = byAttr(el, 'data-missed-skip')[0];
    expect([move?.textContent, skip?.textContent]).toEqual(['Move it', 'Skip it']);
    expect(move?.classes).toContain('missed-btn');
    expect(skip?.classes).toContain('missed-btn');
    move?.click();
    skip?.click();
    expect(calls.move).toEqual([MISSED]);
    expect(calls.skip).toEqual([MISSED]);
  });

  it('sits below the hero (M13: hero first), and is gone without a missed day or callbacks', () => {
    const { el } = renderM12({ missedDay: MISSED });
    const kids = el.children.map((c) =>
      c.hasAttribute('data-missed-day') ? 'missed' : c.hasAttribute('data-hero') ? 'hero' : '',
    );
    expect(kids.indexOf('missed')).toBeGreaterThan(-1);
    expect(kids.indexOf('missed')).toBe(kids.indexOf('hero') + 1);
    expect(byAttr(renderM12({ missedDay: null }).el, 'data-missed-day')).toEqual([]);
    expect(byAttr(renderM12({}).el, 'data-missed-day')).toEqual([]);
    expect(byAttr(renderM12({ missedDay: MISSED }, false).el, 'data-missed-day')).toEqual([]);
  });

  it('names the weekday within 6 days, else weekday + date (7 days back is the same weekday)', () => {
    expect(missedDayText(MISSED, NOW)).toBe('You missed Push A on Tue.');
    expect(missedDayText({ ...MISSED, date: '2026-11-12' }, NOW)).toBe('You missed Push A on Thu.');
    expect(missedDayText({ ...MISSED, date: '2026-11-06' }, NOW)).toBe(
      'You missed Push A on Fri 6.',
    );
  });

  it('a rotation miss (missedAction "start") offers Start it / Skip it instead of Move it', () => {
    const calls = { start: [] as MissedDay[], skip: [] as MissedDay[] };
    const el = asFake(
      todayScreen(props({ missedDay: MISSED, missedAction: 'start' }), {
        onStart: () => {},
        onOpenDay: () => {},
        onTab: () => {},
        onMoveMissed: () => {
          throw new Error('Move it is not offered');
        },
        onStartMissed: (m) => calls.start.push(m),
        onSkipMissed: (m) => calls.skip.push(m),
      }),
    );
    expect(byAttr(el, 'data-missed-move')).toEqual([]);
    const start = byAttr(el, 'data-missed-start')[0];
    const skip = byAttr(el, 'data-missed-skip')[0];
    expect([start?.textContent, skip?.textContent]).toEqual(['Start it', 'Skip it']);
    expect(start?.classes).toContain('missed-cta');
    start?.click();
    skip?.click();
    expect(calls).toEqual({ start: [MISSED], skip: [MISSED] });
    // Without its callback the card isn't shown.
    const bare = asFake(
      todayScreen(props({ missedDay: MISSED, missedAction: 'start' }), {
        onStart: () => {},
        onOpenDay: () => {},
        onTab: () => {},
        onSkipMissed: () => {},
      }),
    );
    expect(byAttr(bare, 'data-missed-day')).toEqual([]);
  });

  it('copy passes checkCopy', () => {
    for (const t of [missedDayText(MISSED, NOW), 'Move it', 'Start it', 'Skip it']) {
      expect(checkCopy(t).ok).toBe(true);
    }
  });
});

describe('Today: first-load motion (M12)', () => {
  type Anim = { el: FakeEl; frames: Keyframe[] };
  let anims: Anim[] = [];
  let reduce = false;
  const g = globalThis as { matchMedia?: unknown };
  let savedMM: unknown;
  const proto = FakeEl.prototype as unknown as { animate?: unknown };
  beforeEach(() => {
    anims = [];
    reduce = false;
    savedMM = g.matchMedia;
    g.matchMedia = (q: string) => ({ matches: q.includes('reduced-motion') && reduce, media: q });
    proto.animate = function (this: FakeEl, frames: Keyframe[]) {
      anims.push({ el: this, frames });
      return { cancel: () => {} };
    };
    vi.useFakeTimers();
  });
  afterEach(() => {
    g.matchMedia = savedMM;
    delete proto.animate;
    vi.useRealTimers();
  });

  const READY = {
    date: '2026-11-13',
    signals: [],
    reasons: ['Short sleep last night.'],
    offer: 'lighter' as const,
  };
  const streakText = (el: FakeEl) => byAttr(el, 'data-streak-num')[0]?.textContent;

  it('first render: cards stagger in, the streak counts up to its value, readiness slides in', () => {
    const motion = createTodayMotion();
    const { el } = renderM12({ motion, readiness: READY });
    const rising = anims.filter((a) => a.frames[0]?.transform === 'translateY(8px)');
    expect(rising.map((a) => a.el)).toContain(byAttr(el, 'data-hero')[0]);
    const slid = anims.filter((a) => a.frames[0]?.transform === 'translateX(8px)');
    expect(slid.map((a) => a.el)).toEqual(byAttr(el, 'data-readiness'));
    expect(streakText(el)).toBe('0');
    vi.runAllTimers();
    expect(streakText(el)).toBe('3');
    expect(motion).toEqual({ entered: true, readiness: 'lighter|Short sleep last night.' });
  });

  it('M13: with two notices the "things to sort" row slides in; a lone missed card rises', () => {
    const two = renderM12({ motion: createTodayMotion(), missedDay: MISSED, readiness: READY }).el;
    const slid = anims.filter((a) => a.frames[0]?.transform === 'translateX(8px)');
    expect(slid.map((a) => a.el)).toEqual(byAttr(two, 'data-notices'));
    vi.runAllTimers();
    anims = [];
    const one = renderM12({ motion: createTodayMotion(), missedDay: MISSED }).el;
    const rising = anims.filter((a) => a.frames[0]?.transform === 'translateY(8px)');
    expect(rising.map((a) => a.el)).toContain(byAttr(one, 'data-missed-day')[0]);
  });

  it('a re-render with the same motion state plays nothing and shows final numbers', () => {
    const motion = createTodayMotion();
    renderM12({ motion, readiness: READY });
    vi.runAllTimers();
    anims = [];
    const { el } = renderM12({ motion, readiness: READY });
    expect(anims).toEqual([]);
    expect(streakText(el)).toBe('3');
  });

  it('the readiness card slides in when it first appears after the entrance', () => {
    const motion = createTodayMotion();
    renderM12({ motion });
    vi.runAllTimers();
    anims = [];
    const { el } = renderM12({ motion, readiness: READY });
    expect(anims.map((a) => a.el)).toEqual(byAttr(el, 'data-readiness'));
  });

  it('reduced motion: nothing animates and numbers are final at once', () => {
    reduce = true;
    const motion = createTodayMotion();
    const { el } = renderM12({ motion, missedDay: MISSED, readiness: READY });
    expect(anims).toEqual([]);
    expect(streakText(el)).toBe('3');
  });

  it('without a motion state Today renders still (as before M12)', () => {
    const { el } = renderM12({ missedDay: MISSED, readiness: READY });
    expect(anims).toEqual([]);
    expect(streakText(el)).toBe('3');
  });
});

describe('Today: feel today + cardio line (M12 1b tasks 31, 32)', () => {
  const TODAY = ymd(NOW);
  const OFFERS = [{ area: 'back' as const, text: 'Go easy on back today?' }];
  const base = { onStart: () => {}, onOpenDay: () => {}, onTab: () => {} };
  const children = (el: FakeEl) => el.children.filter((c) => c.tag !== '#text');
  const indexOf = (el: FakeEl, attr: string) => children(el).findIndex((c) => c.hasAttribute(attr));

  it('without onSaveFeel there is no feel row (Today as before)', () => {
    const { el } = render({ feel: { date: TODAY, energy: 3 } });
    expect(byAttr(el, 'data-feel-today')).toEqual([]);
  });

  it('the collapsed row sits right below Start (the hero), saved answers pass out', () => {
    const saved: unknown[] = [];
    const el = asFake(todayScreen(props(), { ...base, onSaveFeel: (f) => saved.push(f) }));
    expect(indexOf(el, 'data-feel-today')).toBe(indexOf(el, 'data-hero') + 1);
    const row = byAttr(el, 'data-feel-today')[0] as FakeEl;
    expect(row.getAttribute('data-state')).toBe('ask');
    byAttr(row, 'data-feel-open')[0]?.click();
    byAttr(row, 'data-feel-energy')
      .find((e) => e.getAttribute('data-feel-energy') === '4')
      ?.click();
    byAttr(row, 'data-feel-save')[0]?.click();
    expect(saved).toEqual([{ date: TODAY, energy: 4 }]);
  });

  it('answered today: shows the answer; feelOpen keeps it open across a re-render', () => {
    const answered = asFake(
      todayScreen(props({ feel: { date: TODAY, energy: 4 } }), { ...base, onSaveFeel: () => {} }),
    );
    expect(byAttr(answered, 'data-feel-today')[0]?.getAttribute('data-state')).toBe('done');
    const open = asFake(todayScreen(props({ feelOpen: true }), { ...base, onSaveFeel: () => {} }));
    expect(byAttr(open, 'data-feel-today')[0]?.getAttribute('data-state')).toBe('open');
  });

  it('offers show on the feel row (no card), never on a rest day', () => {
    const easy: string[] = [];
    const acts = { ...base, onSaveFeel: () => {}, onEasyOn: (a: string) => easy.push(a) };
    const feel = { date: TODAY, sore: ['back' as const] };
    const el = asFake(todayScreen(props({ feel, feelOffers: OFFERS }), acts));
    byAttr(el, 'data-easy-on')[0]?.click();
    expect(easy).toEqual(['back']);
    const restCal: CalendarEntry[] = [{ date: TODAY, dayId: null, rest: true }];
    const rest = asFake(todayScreen(props({ feel, feelOffers: OFFERS, calendar: restCal }), acts));
    expect(byAttr(rest, 'data-feel-today')).toHaveLength(1);
    expect(byAttr(rest, 'data-easy-on')).toEqual([]);
  });

  it('Goal card: shown with both callbacks; "Set your goal" with no goals opens the intake', () => {
    const goal = { goals: [], today: TODAY };
    expect(byAttr(render({ goal }).el, 'data-goal-card')).toEqual([]);
    let set = 0;
    const el = asFake(
      todayScreen(props({ goal }), { ...base, onSetGoal: () => set++, onOpenGoal: () => {} }),
    );
    expect(byAttr(el, 'data-goal-card')).toHaveLength(1);
    byAttr(el, 'data-goal-set')[0]?.click();
    expect(set).toBe(1);
    const none = asFake(
      todayScreen(props({ goal: null }), { ...base, onSetGoal: () => {}, onOpenGoal: () => {} }),
    );
    expect(byAttr(none, 'data-goal-card')).toEqual([]);
  });

  it('cardio line: "Cardio this week: 95 min" under Your week; hidden when null or absent', () => {
    const { el } = render({ cardioMinutes: 95 });
    const line = byAttr(el, 'data-cardio');
    expect(line).toHaveLength(1);
    expect(line[0]?.textContent).toBe('Cardio this week: 95 min');
    expect(line[0]?.getAttribute('data-cardio')).toBe('95');
    expect(line[0]?.classes).toContain('week-load');
    // After the "Your week" heading, before the strip.
    const head = children(el).findIndex((c) => c.classes.includes('days-head'));
    expect(indexOf(el, 'data-cardio')).toBeGreaterThan(head);
    expect(indexOf(el, 'data-cardio')).toBeLessThan(indexOf(el, 'data-day-strip'));
    expect(byAttr(render({ cardioMinutes: 0 }).el, 'data-cardio')[0]?.textContent).toBe(
      'Cardio this week: 0 min',
    );
    expect(byAttr(render({ cardioMinutes: null }).el, 'data-cardio')).toEqual([]);
    expect(byAttr(render().el, 'data-cardio')).toEqual([]);
  });
});

// ---------- M13 task 19: hero first, notices in one row, one filled button ----------

describe('Today: hero first + "things to sort" (M13)', () => {
  const READY = {
    date: '2026-11-13',
    signals: [],
    reasons: ['Short sleep last night.'],
    offer: 'lighter' as const,
  };
  const ALL_ACTIONS = {
    onStart: () => {},
    onOpenDay: () => {},
    onTab: () => {},
    onCoach: () => {},
    onLighterToday: () => {},
    onNotToday: () => {},
    onTrainAsPlanned: () => {},
    onMoveMissed: () => {},
    onSkipMissed: () => {},
    onUndoAdjust: () => {},
    onSeeGymSwap: () => {},
    onKeepExercise: () => {},
    onUseNewProgram: () => {},
    onKeepPlan: () => {},
    onDismissNudge: () => {},
    onOpenFuel: () => {},
    onSetGoal: () => {},
    onOpenGoal: () => {},
    onSaveFeel: () => {},
    onOpenTodos: () => {},
  };
  const kids = (el: FakeEl) => el.children.filter((c) => c.tag !== '#text');
  const byAttr = (el: FakeEl, name: string) => el.find((e) => e.hasAttribute(name));
  const NOTICE_ATTRS = [
    'data-readiness',
    'data-adjusted',
    'data-missed-day',
    'data-gym-prompt',
    'data-program-prompt',
    'data-goal-card',
    'data-fuel-nudge',
  ];
  const isNotice = (e: FakeEl) => NOTICE_ATTRS.some((a) => e.hasAttribute(a));

  function renderAll(over: Partial<TodayProps> = {}, acts: Record<string, unknown> = {}) {
    return asFake(
      todayScreen(
        props({
          readiness: READY,
          adjustedToday: 'Easy on arms',
          missedDay: MISSED_M13,
          missingKit: { exerciseId: 'Leg_Press', name: 'Leg Press' },
          newProgram: true,
          goal: { goals: [], today: ymd(NOW) },
          nudge: '40 g protein to go today.',
          feelOpen: true,
          todo: { done: 3, total: 12, visible: true, nextTitle: 'Coach tab' },
          ...over,
        }),
        { ...ALL_ACTIONS, ...acts } as Parameters<typeof todayScreen>[1],
      ),
    );
  }

  it('noticesLabel: "1 thing to sort" / "3 things to sort"', () => {
    expect(noticesLabel(1)).toBe('1 thing to sort');
    expect(noticesLabel(3)).toBe('3 things to sort');
    expect(checkCopy(noticesLabel(2)).ok).toBe(true);
  });

  it('0 notices: no row, no notice card; the hero is the first thing after the app bar', () => {
    const el = asFake(todayScreen(props(), ALL_ACTIONS));
    expect(byAttr(el, 'data-notices')).toEqual([]);
    expect(el.find(isNotice)).toEqual([]);
    expect(kids(el)[0]?.tag).toBe('header');
    expect(kids(el)[1]?.hasAttribute('data-hero')).toBe(true);
  });

  it('1 notice: that card itself, after the hero and the feel row (no row)', () => {
    const el = asFake(todayScreen(props({ missedDay: MISSED_M13 }), ALL_ACTIONS));
    expect(byAttr(el, 'data-notices')).toEqual([]);
    const k = kids(el);
    expect(k[1]?.hasAttribute('data-hero')).toBe(true);
    expect(k[2]?.hasAttribute('data-feel-today')).toBe(true);
    expect(k[3]?.hasAttribute('data-missed-day')).toBe(true);
  });

  it('3 notices: one compact row "3 things to sort", closed, that opens in place', () => {
    const toggles: boolean[] = [];
    const el = asFake(
      todayScreen(
        props({ readiness: READY, missedDay: MISSED_M13, nudge: '40 g protein to go today.' }),
        { ...ALL_ACTIONS, onNoticesToggle: (o: boolean) => toggles.push(o) },
      ),
    );
    const k = kids(el);
    expect(k[1]?.hasAttribute('data-hero')).toBe(true);
    // No notice card sits directly on the screen: all three are inside the row.
    expect(k.filter(isNotice)).toEqual([]);
    const row = byAttr(el, 'data-notices')[0] as FakeEl;
    expect(k.indexOf(row)).toBe(3); // header, hero, feel row, then the row
    expect(row.getAttribute('data-notices')).toBe('3');
    const toggle = byAttr(row, 'data-notices-toggle')[0] as FakeEl;
    expect(toggle.tag).toBe('button');
    expect(toggle.oneByClass('notices-title').textContent).toBe('3 things to sort');
    expect(toggle.oneByClass('notices-sub').textContent).toBe(
      'Lighter today? · Missed Push A · Food',
    );
    const list = byAttr(row, 'data-notices-list')[0] as FakeEl;
    expect(toggle.getAttribute('aria-controls')).toBe(list.getAttribute('id'));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(list.hasAttribute('hidden')).toBe(true);
    expect(list.children.map((c) => NOTICE_ATTRS.find((a) => c.hasAttribute(a)))).toEqual([
      'data-readiness',
      'data-missed-day',
      'data-fuel-nudge',
    ]);
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.hasAttribute('hidden')).toBe(false);
    toggle.click();
    expect(list.hasAttribute('hidden')).toBe(true);
    expect(toggles).toEqual([true, false]);
  });

  it('noticesOpen keeps the row open across a re-render', () => {
    const el = renderAll({ noticesOpen: true });
    const row = byAttr(el, 'data-notices')[0] as FakeEl;
    expect(row.getAttribute('data-notices')).toBe('7');
    expect(byAttr(row, 'data-notices-toggle')[0]?.getAttribute('aria-expanded')).toBe('true');
    expect(byAttr(row, 'data-notices-list')[0]?.hasAttribute('hidden')).toBe(false);
  });

  it('a goal card with goals is progress, not a notice: it stays on the screen below', () => {
    const goal = {
      goals: [
        {
          goal: { id: 'g1', text: 'Bench 60 kg × 5', kind: 'strength', due: '2027-01-31' },
          pct: 40,
          status: 'onTrack' as const,
        },
      ],
      today: ymd(NOW),
    } as unknown as TodayProps['goal'];
    const el = asFake(todayScreen(props({ goal, missedDay: MISSED_M13 }), ALL_ACTIONS));
    const k = kids(el);
    expect(byAttr(el, 'data-notices')).toEqual([]);
    const card = k.findIndex((c) => c.getAttribute('data-goal-card') === 'goals');
    expect(card).toBeGreaterThan(k.findIndex((c) => c.hasAttribute('data-missed-day')));
  });

  // The CSS rules that paint a button with the orange fill, from every stylesheet in src/, and
  // the outline overrides today.css adds. Every rule's last compound selector → its class set.
  const SRC = join(__dirname, '..', '..');
  function cssFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) return cssFiles(p);
      return n.endsWith('.css') ? [p] : [];
    });
  }
  function compounds(css: string, body: RegExp): string[][] {
    const out: string[][] = [];
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!body.test(m[2] ?? '')) continue;
      for (const sel of (m[1] ?? '').split(',')) {
        const last =
          sel
            .trim()
            .split(/[\s>+~]+/)
            .at(-1) ?? '';
        const classes = [...last.replace(/:[\w-]+(\([^)]*\))?/g, '').matchAll(/\.([\w-]+)/g)].map(
          (c) => c[1] ?? '',
        );
        if (classes.length) out.push(classes);
      }
    }
    return out;
  }
  const FILLED = cssFiles(SRC).flatMap((f) =>
    compounds(readFileSync(f, 'utf8'), /background(-color)?:\s*var\(--cta\)/),
  );
  const OUTLINED = compounds(
    readFileSync(join(__dirname, 'today.css'), 'utf8'),
    /background:\s*transparent/,
  );
  const hit = (e: FakeEl, sets: string[][]) =>
    sets.some((cls) => cls.every((c) => e.classes.includes(c)));

  it('exactly one filled primary button: Start (every notice open, the feel row open)', () => {
    // The scan sees the fills it guards against (else this test would pass vacuously).
    for (const c of ['primary-btn', 'readiness-cta', 'missed-cta', 'gym-prompt-cta', 'feel-save'])
      expect(FILLED).toContainEqual([c]);
    expect(FILLED).toContainEqual(['goal-card-btn', 'primary']);
    for (const over of [{}, { noticesOpen: true }]) {
      const el = renderAll(over);
      const filled = el.byTag('button').filter((b) => hit(b, FILLED) && !hit(b, OUTLINED));
      expect(filled).toHaveLength(1);
      expect(filled[0]?.classes).toContain('hero-cta');
      expect(filled[0]?.textContent).toBe('Start workout');
      // The notice CTAs that would be filled elsewhere are outlined on Today.
      const outlined = el.byTag('button').filter((b) => hit(b, FILLED) && hit(b, OUTLINED));
      expect(outlined.length).toBeGreaterThanOrEqual(4);
    }
  });
});

const MISSED_M13: MissedDay = { date: '2026-11-10', dayId: 'push-a', name: 'Push A' };
