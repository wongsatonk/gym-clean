import { describe, expect, it, vi } from 'vitest';
import type { DayCompletion, PeriodScore } from '../core/types';
import { FIX_MONTH, FIX_MONTH_SCORE, FIX_NAMES, fixtureMonth } from './screens/calendarFixture';
import type { ShareStats } from '../core/types';
import {
  SHARE_H,
  SHARE_W,
  STORY_H,
  STORY_W,
  logoPathData,
  shareFileName,
  shareMonth,
  shareMonthLayout,
  leadValueSize,
  leadValueWidth,
  shareStoryFileName,
  shareStoryLayout,
  type ShareItem,
} from './shareMonth';

function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('missing');
  return x;
}

const layout = (days: DayCompletion[] = fixtureMonth()) =>
  shareMonthLayout(FIX_MONTH, days, { month: FIX_MONTH_SCORE, streakWeeks: 6 });

const texts = (items: ShareItem[]) =>
  items
    .filter((i): i is Extract<ShareItem, { kind: 'text' }> => i.kind === 'text')
    .map((i) => i.text);

describe('shareMonthLayout', () => {
  it('is a 1080×1350 image with the month title, grid and scores', () => {
    const l = layout();
    expect([l.width, l.height]).toEqual([SHARE_W, SHARE_H]);
    expect([SHARE_W, SHARE_H]).toEqual([1080, 1350]);
    const t = texts(l.items);
    expect(t).toContain('November 2026');
    expect(t).toContain('89%');
    expect(t).toContain('of planned sets');
    expect(t).toContain('11 of 21 sessions');
    expect(t).toContain('+ 1 extra');
    expect(t).toContain('Chest: 9 of 40 sets');
    expect(t).toContain('Streak 6 weeks');
    expect(t).toContain('Every set logged in Gym Clean');
    for (let d = 1; d <= 30; d++) expect(t).toContain(String(d));
  });

  it('rings match the Calendar: none on rest days, an arc on done/partial/extra, dashed when missed', () => {
    const days = fixtureMonth();
    const l = layout(days);
    const rings = l.items.filter(
      (i): i is Extract<ShareItem, { kind: 'ring' }> => i.kind === 'ring',
    );
    const notRest = days.filter((d) => d.status !== 'rest').length;
    const arcs = days.filter((d) => ['done', 'partial', 'extra'].includes(d.status)).length;
    expect(rings.filter((r) => r.color !== '--success')).toHaveLength(notRest);
    expect(rings.filter((r) => r.color === '--success')).toHaveLength(arcs);
    expect(rings.filter((r) => r.dash)).toHaveLength(
      days.filter((d) => d.status === 'missed').length,
    );
    const partial = must(rings.find((r) => r.color === '--success' && r.pct < 100));
    expect(partial.pct).toBe(67); // 12 of 18
    const focus = l.items.filter((i) => i.kind === 'rect' && i.color === '--muscle');
    expect(focus).toHaveLength(days.filter((d) => d.blockId).length);
  });

  it('places the 1st after Monday-first blanks (Sun 1 Nov → 7th column)', () => {
    const one = must(
      layout().items.find(
        (i): i is Extract<ShareItem, { kind: 'text' }> => i.kind === 'text' && i.text === '1',
      ),
    );
    const sun = layout().items.filter(
      (i): i is Extract<ShareItem, { kind: 'text' }> => i.kind === 'text' && i.text === 'S',
    );
    expect(one.x).toBe(sun.at(-1)?.x);
  });

  it('holds only shapes, dates and scores: no weights, body or Health data, no names', () => {
    const days = fixtureMonth().map((d) => ({
      ...d,
      // Extra fields a caller might pass by mistake must not leak.
      weightKg: 82.5,
      bodyFatPct: 18,
    })) as unknown as DayCompletion[];
    const l = layout(days);
    const allowed = new Set([
      'kind',
      'x',
      'y',
      'w',
      'h',
      'r',
      'color',
      'cx',
      'cy',
      'width',
      'pct',
      'dash',
      'text',
      'size',
      'weight',
      'font',
      'align',
    ]);
    for (const it of l.items) for (const k of Object.keys(it)) expect(allowed.has(k)).toBe(true);
    const all = texts(l.items).join(' | ');
    expect(all).not.toMatch(/\bkg\b|\blb\b|82\.5|body|fat|kcal|sleep|heart|steps|weigh/i);
    for (const n of Object.values(FIX_NAMES)) expect(all).not.toContain(n);
    for (const id of Object.keys(FIX_NAMES)) expect(all).not.toContain(id);
    // `weight` is only ever the font weight.
    for (const it of l.items) if (it.kind === 'text') expect([400, 700]).toContain(it.weight);
  });

  it('more sessions done than planned: never "7 of 6"', () => {
    const over = { ...FIX_MONTH_SCORE, sessionsPlanned: 6, sessionsDone: 7 };
    const t = texts(shareMonthLayout(FIX_MONTH, [], { month: over }).items);
    expect(t).toContain('7 sessions done');
    expect(t.join(' | ')).not.toMatch(/7 of 6/);
  });

  it('ignores dates outside the month and handles a month with nothing planned', () => {
    const none = {
      ...FIX_MONTH_SCORE,
      sessionsPlanned: 0,
      sessionsDone: 0,
      setsPlanned: 0,
      setsDone: 0,
      extra: 0,
    };
    const noFocus: PeriodScore = { ...none };
    delete noFocus.focus;
    const l = shareMonthLayout(
      FIX_MONTH,
      [
        {
          date: '2026-10-31',
          status: 'done',
          dayId: 'x',
          setsPlanned: 1,
          setsDone: 1,
          exercises: [],
        },
      ],
      { month: noFocus },
    );
    const t = texts(l.items);
    expect(t).toContain('No sessions planned');
    expect(t).toContain('–');
    expect(t).not.toContain('31');
    expect(l.items.some((i) => i.kind === 'ring')).toBe(false);
  });
});

describe('shareMonth', () => {
  const png = new Blob(['x'], { type: 'image/png' });

  const fakeDoc = () => {
    const anchors: { href: string; download: string; clicked: boolean }[] = [];
    const doc = {
      body: { append: vi.fn() },
      createElement: () => {
        const a = {
          href: '',
          download: '',
          rel: '',
          clicked: false,
          click() {
            a.clicked = true;
          },
          remove: vi.fn(),
        };
        anchors.push(a);
        return a;
      },
    };
    return { doc: doc as never, anchors };
  };

  it('uses the share sheet with the PNG file when it takes files', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    const { doc, anchors } = fakeDoc();
    const r = await shareMonth(png, '2026-11', { nav: { share, canShare }, doc });
    expect(r).toBe('shared');
    const data = share.mock.calls[0]?.[0] as { files: File[] };
    expect(data.files[0]?.name).toBe('gym-clean-2026-11.png');
    expect(data.files[0]?.type).toBe('image/png');
    expect(anchors).toHaveLength(0);
  });

  it('a cancelled share sheet is cancelled, not a download', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    const { doc, anchors } = fakeDoc();
    const r = await shareMonth(png, '2026-11', {
      nav: { share: vi.fn().mockRejectedValue(abort), canShare: () => true },
      doc,
    });
    expect(r).toBe('cancelled');
    expect(anchors).toHaveLength(0);
  });

  it('downloads when files cannot be shared, or sharing fails', async () => {
    vi.useFakeTimers();
    for (const nav of [
      undefined,
      { share: vi.fn(), canShare: () => false },
      { share: vi.fn().mockRejectedValue(new Error('NotAllowed')), canShare: () => true },
    ]) {
      const { doc, anchors } = fakeDoc();
      const revoke = vi.fn();
      const r = await shareMonth(png, '2026-11', {
        nav: nav ?? ({} as never),
        doc,
        createObjectURL: () => 'blob:local/1',
        revokeObjectURL: revoke,
      });
      expect(r).toBe('downloaded');
      expect(anchors[0]).toMatchObject({
        href: 'blob:local/1',
        download: shareFileName('2026-11'),
        clicked: true,
      });
      vi.advanceTimersByTime(10_000);
      expect(revoke).toHaveBeenCalledWith('blob:local/1');
    }
    vi.useRealTimers();
  });

  it('never fetches', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { doc } = fakeDoc();
    await shareMonth(png, '2026-11', {
      nav: { share: vi.fn(), canShare: () => false },
      doc,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

// ---------- M13 task 25: Story size ----------

const STATS: ShareStats = { sessionsDone: 11, volumeKg: 23456.7, streakWeeks: 6 };
const story = (
  lead: Parameters<typeof shareStoryLayout>[2]['lead'],
  stats: ShareStats = STATS,
  unit: 'kg' | 'lb' = 'kg',
  days: DayCompletion[] = fixtureMonth(),
) => shareStoryLayout(FIX_MONTH, days, { stats, lead, unit });

type TextItem = Extract<ShareItem, { kind: 'text' }>;
const textItems = (items: ShareItem[]) => items.filter((i): i is TextItem => i.kind === 'text');

describe('shareStoryLayout (9:16)', () => {
  it('is 1080×1920', () => {
    const l = story('sessions');
    expect([STORY_W, STORY_H]).toEqual([1080, 1920]);
    expect([l.width, l.height]).toEqual([1080, 1920]);
  });

  it('the lockup is on top: the mark and the name above everything else', () => {
    const l = story('sessions');
    const mark = must(l.items.find((i) => i.kind === 'mark'));
    const name = must(textItems(l.items).find((i) => i.text === 'Gym Clean'));
    const others = textItems(l.items).filter((i) => i !== name);
    expect(mark.kind === 'mark' && mark.y).toBeLessThan(260);
    for (const o of others) expect(o.y).toBeGreaterThan(name.y);
  });

  it('leads with the picked number, large, its label under it, above the grid', () => {
    const l = story('sessions');
    const t = textItems(l.items);
    const value = must(t.find((i) => i.text === '11'));
    const label = must(t.find((i) => i.text === 'sessions done'));
    expect(value.size).toBeGreaterThanOrEqual(200);
    expect(value.size).toBe(Math.max(...t.map((i) => i.size)));
    expect(label.y).toBeGreaterThan(value.y);
    const days = t.filter((i) => /^\d{1,2}$/.test(i.text) && i !== value);
    expect(days.length).toBeGreaterThanOrEqual(28);
    for (const d of days) expect(d.y).toBeGreaterThan(label.y);
  });

  it('total lifted shows only when picked, in the unit asked; streak too', () => {
    expect(textItems(story('volume').items).map((i) => i.text)).toEqual(
      expect.arrayContaining(['23,457', 'kg lifted']),
    );
    expect(textItems(story('volume', STATS, 'lb').items).map((i) => i.text)).toContain('lb lifted');
    expect(textItems(story('streak').items).map((i) => i.text)).toEqual(
      expect.arrayContaining(['6', 'weeks in a row']),
    );
    const sessions = textItems(story('sessions').items)
      .map((i) => i.text)
      .join(' | ');
    expect(sessions).not.toMatch(/23,457|23457|lifted|\bkg\b|\blb\b/);
  });

  it('an unavailable lead falls back (pickLead); all zero → grid only, no lead number', () => {
    const noStreak = { ...STATS, streakWeeks: 0 };
    expect(textItems(story('streak', noStreak).items).map((i) => i.text)).toContain(
      'sessions done',
    );
    const zero = { sessionsDone: 0, volumeKg: 0, streakWeeks: 0 };
    const t = textItems(story('sessions', zero).items).map((i) => i.text);
    expect(t.join(' | ')).not.toMatch(/sessions? done|lifted|in a row/);
    expect(t).toContain('November 2026');
  });

  it('missed days are quiet grey rings: no red/warn colour anywhere, no "missed" text', () => {
    const days = fixtureMonth();
    const missed = days.filter((d) => d.status === 'missed').length;
    expect(missed).toBeGreaterThan(0);
    const l = story('sessions', STATS, 'kg', days);
    const colours = l.items.map((i) => ('color' in i ? i.color : ''));
    expect(colours).not.toContain('--warn');
    expect(colours).not.toContain('--danger');
    const rings = l.items.filter(
      (i): i is Extract<ShareItem, { kind: 'ring' }> => i.kind === 'ring',
    );
    expect(rings.filter((r) => r.dash)).toHaveLength(missed);
    for (const r of rings.filter((x) => x.dash)) expect(r.color).toBe('--line');
    expect(
      textItems(l.items)
        .map((i) => i.text)
        .join(' '),
    ).not.toMatch(/miss/i);
  });

  it('no body, Health or per-lift data, no day or exercise names', () => {
    const days = fixtureMonth().map((d) => ({
      ...d,
      weightKg: 82.5,
      bodyFatPct: 18,
    })) as unknown as DayCompletion[];
    const all = textItems(story('sessions', STATS, 'kg', days).items)
      .map((i) => i.text)
      .join(' | ');
    expect(all).not.toMatch(/82\.5|body|fat|kcal|sleep|heart|steps|weigh/i);
    for (const n of Object.values(FIX_NAMES)) expect(all).not.toContain(n);
  });

  it('a long lead value (1,000,000+ lb) steps down and carries a maxWidth so it never runs off', () => {
    const big = { ...STATS, volumeKg: 500_000 };
    const t = textItems(story('volume', big, 'lb').items);
    const value = must(t.find((i) => i.text === '1,102,311'));
    const label = must(t.find((i) => i.text === 'lb lifted'));
    const room = STORY_W - 80 - value.x;
    expect(value.maxWidth).toBe(room);
    expect(value.size).toBeLessThan(260);
    expect(value.size).toBeGreaterThanOrEqual(150);
    expect(leadValueWidth(value.text, value.size)).toBeLessThanOrEqual(room);
    expect(label.y - value.y).toBeGreaterThanOrEqual(110);
    // A short value keeps the full 260.
    const short = must(textItems(story('sessions').items).find((i) => i.text === '11'));
    expect(short.size).toBe(260);
    expect(leadValueSize('23,457', room)).toBe(260);
  });

  it('a quiet footer at the bottom', () => {
    const t = textItems(story('sessions').items);
    const footer = must(t.find((i) => i.y === Math.max(...t.map((x) => x.y))));
    expect(footer.color).toBe('--text-2');
    expect(footer.y).toBeGreaterThan(1750);
    expect(footer.text).toContain('Gym Clean');
  });

  it('the mark uses the app logo path', () => {
    expect(logoPathData()).toMatch(/^M[\d.\s]/);
  });

  it('file name gym-clean-<month>-story.png', () => {
    expect(shareStoryFileName('2026-11')).toBe('gym-clean-2026-11-story.png');
  });

  it('shareMonth hands over the Story file name for size story', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    await shareMonth(new Blob(['x']), '2026-11', { nav: { share, canShare: () => true } }, 'story');
    const data = share.mock.calls[0]?.[0] as { files: File[] };
    expect(data.files[0]?.name).toBe('gym-clean-2026-11-story.png');
  });
});
