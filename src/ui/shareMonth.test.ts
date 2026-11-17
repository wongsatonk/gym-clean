import { describe, expect, it, vi } from 'vitest';
import type { DayCompletion, PeriodScore } from '../core/types';
import { FIX_MONTH, FIX_MONTH_SCORE, FIX_NAMES, fixtureMonth } from './screens/calendarFixture';
import {
  SHARE_H,
  SHARE_W,
  shareFileName,
  shareMonth,
  shareMonthLayout,
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
