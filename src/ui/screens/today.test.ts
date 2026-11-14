import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WeekDot } from '../../core/stats';
import type { ProgramDay } from '../../core/types';
import { exerciseById, program } from '../../data/catalog';
import { tabBar, type TabId } from '../tabBar';
import { dayMuscles, estimateMinutes, muscleLabel } from './dayInfo';
import { previewScreen, type PreviewRow } from './preview';
import { dateLabel, todayScreen, volumeLine, whenLabel, type TodayProps } from './today';

// ---------- tiny DOM stub (vitest runs in node) ----------

class FakeEl {
  children: FakeEl[] = [];
  attrs = new Map<string, string>();
  text = '';
  html = '';
  listeners = new Map<string, (() => void)[]>();
  constructor(public tag: string) {}
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  set innerHTML(v: string) {
    this.html = v;
  }
  get innerHTML() {
    return this.html;
  }
  addEventListener(type: string, cb: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }
  click() {
    for (const cb of this.listeners.get('click') ?? []) cb();
  }
  append(...nodes: (FakeEl | string)[]) {
    for (const n of nodes) {
      if (typeof n === 'string') {
        const t = new FakeEl('#text');
        t.text = n;
        this.children.push(t);
      } else this.children.push(n);
    }
  }
  get textContent(): string {
    return this.tag === '#text' ? this.text : this.children.map((c) => c.textContent).join('');
  }
  get classes(): string[] {
    return (this.attrs.get('class') ?? '').split(/\s+/).filter(Boolean);
  }
  /** Depth-first descendants matching a predicate. */
  find(pred: (e: FakeEl) => boolean): FakeEl[] {
    const out: FakeEl[] = [];
    for (const c of this.children) {
      if (pred(c)) out.push(c);
      out.push(...c.find(pred));
    }
    return out;
  }
  byClass(cls: string): FakeEl[] {
    return this.find((e) => e.classes.includes(cls));
  }
  oneByClass(cls: string): FakeEl {
    const hit = this.byClass(cls)[0];
    if (!hit) throw new Error(`no .${cls}`);
    return hit;
  }
  byTag(tag: string): FakeEl[] {
    return this.find((e) => e.tag === tag);
  }
}

const g = globalThis as { document?: unknown };
let saved: unknown;
beforeEach(() => {
  saved = g.document;
  g.document = {
    createElement: (tag: string) => new FakeEl(tag),
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
  };
});
afterEach(() => {
  g.document = saved;
});

const asFake = (el: unknown) => el as FakeEl;

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

describe('dayInfo', () => {
  it('estimates work + rests (no rest after the last set), rounded to 5 min', () => {
    const day: ProgramDay = {
      id: 'x',
      name: 'X',
      exercises: [
        { exerciseId: 'a', sets: 3, targetReps: [8, 12], restSec: 90, tracking: 'manual' },
        { exerciseId: 'b', sets: 2, targetReps: [8, 12], restSec: 60, tracking: 'manual' },
      ],
    };
    // 3 × 130 + 2 × 100 − 60 = 530 s ≈ 8.8 min → 10
    expect(estimateMinutes(day)).toBe(10);
    expect(estimateMinutes({ id: 'e', name: 'E', exercises: [] })).toBe(5);
    for (const d of DAYS) expect(estimateMinutes(d)).toBeGreaterThanOrEqual(30);
  });

  it('ranks primary muscles by sets and keeps secondary ones that are not primary', () => {
    const m = dayMuscles(PULL_A, exerciseById);
    expect(m.primary.length).toBeGreaterThan(0);
    expect(m.secondary.some((s) => m.primary.includes(s))).toBe(false);
    expect(muscleLabel('middle back')).toBe('Middle back');
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

  it('ends with the tab bar, Today current; Settings calls onTab', () => {
    const { el, calls } = render();
    const bar = el.children.at(-1) as FakeEl;
    expect(bar.classes).toContain('tabbar');
    const tabs = bar.byClass('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Today', 'Settings']);
    expect(tabs[0]?.getAttribute('aria-current')).toBe('page');
    expect(tabs[1]?.getAttribute('aria-current')).toBeNull();
    tabs[0]?.click();
    tabs[1]?.click();
    expect(calls.tab).toEqual(['settings']);
  });
});

describe('tabBar', () => {
  it('labels every tab and marks the active one', () => {
    const picked: TabId[] = [];
    const bar = asFake(tabBar('settings', (t) => picked.push(t)));
    expect(bar.tag).toBe('nav');
    expect(bar.getAttribute('aria-label')).toBe('Main');
    const tabs = bar.byClass('tab');
    expect(tabs.map((t) => t.getAttribute('data-tab'))).toEqual(['today', 'settings']);
    expect(tabs.every((t) => t.byClass('tab-label').length === 1)).toBe(true);
    expect(tabs[1]?.classes).toContain('on');
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
