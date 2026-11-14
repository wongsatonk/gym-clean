import { describe, expect, it } from 'vitest';
import type { WeekDot } from '../../core/stats';
import type { ProgramDay } from '../../core/types';
import { dayMuscles, estimateMinutes } from '../../core/dayInfo';
import { exerciseById, program } from '../../data/catalog';
import { tabBar, type TabId } from '../tabBar';
import { FakeEl, asFake, useFakeDom } from './testDom';
import { previewScreen, type PreviewRow } from './preview';
import {
  dateLabel,
  isMoved,
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

  it('ends with the tab bar, Today current; History and Settings call onTab', () => {
    const { el, calls } = render();
    const bar = el.children.at(-1) as FakeEl;
    expect(bar.classes).toContain('tabbar');
    const tabs = bar.byClass('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Today', 'History', 'Settings']);
    expect(tabs[0]?.getAttribute('aria-current')).toBe('page');
    expect(tabs[1]?.getAttribute('aria-current')).toBeNull();
    tabs[0]?.click();
    tabs[1]?.click();
    tabs[2]?.click();
    expect(calls.tab).toEqual(['history', 'settings']);
  });
});

describe('tabBar', () => {
  it('labels every tab and marks the active one', () => {
    const picked: TabId[] = [];
    const bar = asFake(tabBar('settings', (t) => picked.push(t)));
    expect(bar.tag).toBe('nav');
    expect(bar.getAttribute('aria-label')).toBe('Main');
    const tabs = bar.byClass('tab');
    expect(tabs.map((t) => t.getAttribute('data-tab'))).toEqual(['today', 'history', 'settings']);
    expect(tabs.every((t) => t.byClass('tab-label').length === 1)).toBe(true);
    expect(tabs[2]?.classes).toContain('on');
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
    const back = el.byTag('button').find((b) => b.textContent === '‹ Back');
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

  it('shows a Coach button in the app bar that calls onCoach', () => {
    const { el, calls } = renderM10();
    const coach = el.find((e) => e.hasAttribute('data-coach-open'));
    expect(coach).toHaveLength(1);
    expect(coach[0]?.tag).toBe('button');
    expect(coach[0]?.textContent).toBe('Coach');
    expect(coach[0]?.classes).toContain('coach-btn');
    // The date stays next to it.
    expect(el.oneByClass('appbar-end').oneByClass('date').textContent).toBe('Fri 13 Nov');
    coach[0]?.click();
    expect(calls.coach).toBe(1);
  });

  it('shows "Adjusted today: …" with Undo above the hero', () => {
    const { el, calls } = renderM10({ adjustedToday: 'Easy on arms · 2 swaps' });
    const banner = el.oneByClass('adjusted-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.oneByClass('adjusted-text').textContent).toBe(
      'Adjusted today: Easy on arms · 2 swaps',
    );
    expect(el.children.indexOf(banner)).toBe(el.children.indexOf(el.oneByClass('hero')) - 1);
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
