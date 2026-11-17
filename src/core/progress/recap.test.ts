import { describe, expect, it } from 'vitest';
import {
  FIXTURE_CATALOG,
  FIXTURE_SESSIONS,
  FIXTURE_SETS,
  fixtureState,
} from '../testkit/progressFixture';
import { addDate } from '../trainer/plan';
import { checkCopy, SPOKEN_MAX_WORDS } from '../trainer/replies';
import { wordCount } from '../advice';
import { periodScore, type CompletionInput } from './completion';
import { recapDue, weekRecapText } from './recap';
import type { FocusBlock } from '../types';

// Made-up history (fixtures/twoWeeks.json); the repo is public.
const SESSIONS = FIXTURE_SESSIONS;
const SETS = FIXTURE_SETS;
const state = fixtureState;
const CATALOG = FIXTURE_CATALOG;
const input = (over: Partial<CompletionInput> = {}): CompletionInput => ({
  state: state(),
  sessions: SESSIONS,
  sets: SETS,
  today: '2026-11-16',
  catalog: CATALOG,
  ...over,
});
const expectClean = (text: string, say: string) => {
  expect(checkCopy(text).ok, text).toBe(true);
  expect(checkCopy(say).ok, say).toBe(true);
  expect(wordCount(say)).toBeLessThanOrEqual(SPOKEN_MAX_WORDS);
};

describe('week recap', () => {
  it('after the week ends: last week’s numbers, equal to periodScore', () => {
    const [r] = recapDue(input(), {});
    const score = periodScore(input(), '2026-11-09', '2026-11-15');
    expect(r).toMatchObject({ period: 'week', from: '2026-11-09', to: '2026-11-15', score });
    expect(r?.text).toBe(
      'Last week: 3 of 4 sessions, 67% of planned sets. Plus 1 extra session. New week, fresh start.',
    );
    expect(r?.say).toBe('Last week: 3 of 4 sessions.');
    expectClean(r?.text ?? '', r?.say ?? '');
  });

  it('once: not again after it was posted', () => {
    expect(recapDue(input(), { week: '2026-11-09' })).toEqual([]);
    // Mid-week later: still the same week, nothing new.
    expect(recapDue(input({ today: '2026-11-19' }), { week: '2026-11-09' })).toEqual([]);
  });

  it('nothing for a week with nothing planned or done (empty history)', () => {
    expect(recapDue(input({ sessions: [], sets: [] }), {})).toEqual([]);
  });

  it('texts for a full week, a good week and an extra-only week pass the copy check', () => {
    const base = { from: 'x', to: 'y', setsPlanned: 0, setsDone: 0, extra: 0 };
    const cases = [
      { ...base, sessionsPlanned: 4, sessionsDone: 4, setsPlanned: 24, setsDone: 24 },
      { ...base, sessionsPlanned: 4, sessionsDone: 4, setsPlanned: 24, setsDone: 21 },
      { ...base, sessionsPlanned: 0, sessionsDone: 0, extra: 2 },
    ];
    const texts = cases.map((s) => weekRecapText(s));
    expect(texts[0]?.text).toMatch(/Every session done/);
    expect(texts[1]?.text).toMatch(/Solid week/);
    expect(texts[2]?.text).toBe('Last week: 2 extra sessions. Nice work.');
    for (const t of texts) expectClean(t.text, t.say);
  });
});

describe('week recap without fixed rest weekdays', () => {
  it('a 3-day rotation trained 3 times reads "3 of 3", the other days are rest', () => {
    // Made-up: the fixture's plan with no rest weekdays; trained Mon, Wed, Sat last week.
    const base = state();
    const s = { ...base, schedule: { ...base.schedule, restWeekdays: [] } };
    const keep = new Set(['s1', 's2', 's4']);
    const i = input({
      state: s,
      sessions: SESSIONS.filter((x) => keep.has(x.sessionId)),
      sets: SETS.filter((x) => keep.has(x.sessionId)),
    });
    const [r] = recapDue(i, {});
    expect(r?.score).toMatchObject({ sessionsPlanned: 3, sessionsDone: 3, extra: 0 });
    expect(r?.say).toBe('Last week: 3 of 3 sessions.');
    expect(r?.text).toMatch(/^Last week: 3 of 3 sessions, 89% of planned sets\./);
    expectClean(r?.text ?? '', r?.say ?? '');
  });
});

describe('block recap', () => {
  const block: FocusBlock = {
    id: 'focus-done',
    group: 'chest',
    startDate: '2026-11-02',
    weeks: 2,
    weekdays: [1, 3, 5],
    days: Array.from({ length: 14 }, (_, i) => ({ date: addDate('2026-11-02', i), day: null })),
    targetSetsPerWeek: 7,
    baseSetsPerWeek: 5,
  };

  it('after a block’s last date: its scores, focus sets and a Keep going chip', () => {
    const i = input({ state: state({ blocks: [block] }) });
    const r = recapDue(i, { week: '2026-11-09' });
    expect(r).toHaveLength(1);
    const [b] = r;
    expect(b).toMatchObject({
      period: 'block',
      from: '2026-11-02',
      to: '2026-11-15',
      blockId: 'focus-done',
    });
    expect(b?.score).toEqual(periodScore(i, '2026-11-02', '2026-11-15'));
    expect(b?.score.focus).toEqual({ group: 'chest', sets: 9, target: 14 });
    expect(b?.text).toMatch(/^Chest block done: /);
    expect(b?.text).toMatch(/Chest sets: 9 of 14\./);
    expect(b?.chips).toEqual([
      {
        id: 'focusBlock',
        label: 'Keep going',
        args: { group: 'chest', weeks: 2, weekdays: [1, 3, 5] },
      },
    ]);
    expectClean(b?.text ?? '', b?.say ?? '');
  });

  it('once, not before it ends, and not for a block that ended over a week ago', () => {
    const i = input({ state: state({ blocks: [block] }) });
    expect(recapDue(i, { week: '2026-11-09', block: 'focus-done' })).toEqual([]);
    expect(
      recapDue({ ...i, today: '2026-11-15' }, { week: '2026-11-02' }).some(
        (r) => r.period === 'block',
      ),
    ).toBe(false);
    expect(recapDue({ ...i, today: '2026-11-24' }, { week: '2026-11-16' })).toEqual([]);
  });

  it('week and block recaps together, week first', () => {
    const r = recapDue(input({ state: state({ blocks: [block] }) }), {});
    expect(r.map((x) => x.period)).toEqual(['week', 'block']);
  });
});
