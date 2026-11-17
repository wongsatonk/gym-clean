import { describe, expect, it } from 'vitest';
import type { TodoAnswer, TodoFacts, TodoTopic } from '../types';
import {
  currentAnswer,
  isBlankAnswer,
  ownerTopics,
  pendingAutoTicks,
  resignReminder,
  topicApplies,
  topicStatus,
  todoSummary,
} from './progress';

// Made-up topics, answers and facts only (public repo).
const NOW = new Date(2026, 10, 16, 12).getTime();

const facts = (
  platform: TodoFacts['platform'],
  counts: Record<string, number> = {},
  flags: Record<string, boolean> = {},
  extra: Partial<TodoFacts> = {},
): TodoFacts => ({ platform, now: NOW, counts, flags, ...extra });

const MIXED: TodoTopic = {
  id: 'mixed',
  title: 'Mixed',
  since: '1.12.0',
  platform: 'any',
  steps: [
    { id: 'a1', title: 'Ask once', kind: 'auto', detector: 'chatAsked', params: { min: 1 } },
    { id: 'q1', title: 'How was it?', kind: 'ask', options: [{ id: 'ok', label: 'OK' }] },
    {
      id: 'a2',
      title: 'Two changes',
      kind: 'auto',
      detector: 'coachChanges',
      params: { min: 2 },
    },
  ],
};

const NATIVE: TodoTopic = {
  id: 'phone',
  title: 'Phone',
  since: '1.12.0',
  platform: 'native',
  steps: [{ id: 'n1', title: 'In the app', kind: 'auto', detector: 'nativeApp' }],
};

const RESIGN: TodoTopic = {
  id: 'resign',
  title: 'Re-sign',
  since: '1.12.0',
  platform: 'native',
  recurring: true,
  steps: [
    {
      id: 'days',
      title: 'Days left',
      kind: 'auto',
      detector: 'resignDaysLeft',
      params: { minDaysLeft: 3 },
    },
  ],
};

const ASK_ONLY: TodoTopic = {
  id: 'ask',
  title: 'Ask only',
  since: '1.12.0',
  platform: 'any',
  steps: [
    { id: 'x', title: 'X?', kind: 'ask', options: [{ id: 'y', label: 'Yes' }] },
    { id: 'z', title: 'Z?', kind: 'ask', options: [{ id: 'y', label: 'Yes' }] },
  ],
};

let seq = 0;
const ans = (
  topicId: string,
  stepId: string,
  kind: TodoAnswer['kind'],
  extra: Partial<TodoAnswer> = {},
): TodoAnswer => ({
  id: `t${seq++}`,
  topicId,
  stepId,
  kind,
  at: NOW - 1000 + seq,
  release: '1.12.0',
  ...extra,
});

describe('topicStatus', () => {
  it('counts auto steps met now and answered ask steps', () => {
    const s = topicStatus(MIXED, [], facts('web', { chatQuestions: 1 }));
    expect(s).toEqual({ done: false, skipped: false, stepsDone: 1, steps: 3, nextStepId: 'q1' });
  });

  it('is done when every auto step is ticked and every ask step answered', () => {
    const a = [ans('mixed', 'q1', 'ask', { optionIds: ['ok'] })];
    const f = facts('web', { chatQuestions: 1, coachChanges: 2 });
    expect(topicStatus(MIXED, a, f)).toEqual({
      done: true,
      skipped: false,
      stepsDone: 3,
      steps: 3,
    });
  });

  it('keeps a stored auto tick ticked even when the facts no longer show it', () => {
    const a = [
      ans('mixed', 'a1', 'auto'),
      ans('mixed', 'a2', 'auto'),
      ans('mixed', 'q1', 'ask', { optionIds: ['ok'] }),
    ];
    expect(topicStatus(MIXED, a, facts('web')).done).toBe(true);
  });

  it('ignores answers of other topics and of unknown steps', () => {
    const a = [ans('other', 'q1', 'ask', { optionIds: ['ok'] }), ans('mixed', 'gone', 'ask')];
    expect(topicStatus(MIXED, a, facts('web')).stepsDone).toBe(0);
  });

  it('a skipped topic is skipped, not done, with no next step', () => {
    const s = topicStatus(MIXED, [ans('mixed', '', 'skip')], facts('web'));
    expect(s).toEqual({ done: false, skipped: true, stepsDone: 0, steps: 3 });
  });

  it('a topic finished after being skipped counts as done, not skipped', () => {
    const a = [
      ans('ask', '', 'skip'),
      ans('ask', 'x', 'ask', { optionIds: ['y'] }),
      ans('ask', 'z', 'ask', { optionIds: ['y'] }),
    ];
    expect(topicStatus(ASK_ONLY, a, facts('web'))).toMatchObject({ done: true, skipped: false });
  });

  it('recurring topics follow their detector; stored ticks do not stick', () => {
    const first = (daysAgo: number) => new Date(2026, 10, 16 - daysAgo, 9).getTime();
    const tick = [ans('resign', 'days', 'auto')];
    const ok = facts('native', {}, {}, { buildFirstSeenAt: first(1) });
    const late = facts('native', {}, {}, { buildFirstSeenAt: first(5) });
    expect(topicStatus(RESIGN, tick, ok).done).toBe(true);
    expect(topicStatus(RESIGN, tick, late)).toMatchObject({ done: false, nextStepId: 'days' });
  });
});

describe('blank ask answers (no options, no note)', () => {
  it('isBlankAnswer: no options and no or blank note; never for auto or skip rows', () => {
    expect(isBlankAnswer(ans('ask', 'x', 'ask'))).toBe(true);
    expect(isBlankAnswer(ans('ask', 'x', 'ask', { optionIds: [] }))).toBe(true);
    expect(isBlankAnswer(ans('ask', 'x', 'ask', { optionIds: [], note: '  \n ' }))).toBe(true);
    expect(isBlankAnswer(ans('ask', 'x', 'ask', { optionIds: ['y'] }))).toBe(false);
    expect(isBlankAnswer(ans('ask', 'x', 'ask', { optionIds: [], note: 'n' }))).toBe(false);
    expect(isBlankAnswer(ans('ask', 'x', 'auto'))).toBe(false);
    expect(isBlankAnswer(ans('ask', '', 'skip'))).toBe(false);
  });

  it('a blank answer does not make its step done', () => {
    const a = [
      ans('ask', 'x', 'ask', { optionIds: [] }),
      ans('ask', 'z', 'ask', { optionIds: [], note: '   ' }),
    ];
    expect(topicStatus(ASK_ONLY, a, facts('web'))).toEqual({
      done: false,
      skipped: false,
      stepsDone: 0,
      steps: 2,
      nextStepId: 'x',
    });
  });

  it('a note alone (no option) counts as answered', () => {
    const a = [ans('ask', 'x', 'ask', { note: 'n' }), ans('ask', 'z', 'ask', { optionIds: ['y'] })];
    expect(topicStatus(ASK_ONLY, a, facts('web')).done).toBe(true);
  });

  it('a blank row next to a real one keeps the step done', () => {
    const a = [
      ans('ask', 'x', 'ask', { optionIds: ['y'] }),
      ans('ask', 'x', 'ask', { optionIds: [] }),
      ans('ask', 'z', 'ask', { optionIds: ['y'] }),
    ];
    expect(topicStatus(ASK_ONLY, a, facts('web')).done).toBe(true);
  });

  it('currentAnswer skips blank rows', () => {
    const real = ans('ask', 'x', 'ask', { optionIds: ['y'] });
    const blank = ans('ask', 'x', 'ask', { optionIds: [] });
    expect(currentAnswer([real, blank], 'ask', 'x')).toBe(real);
    expect(currentAnswer([blank], 'ask', 'x')).toBeUndefined();
  });
});

describe('topicApplies', () => {
  it('native-only topics apply only in the iPhone app', () => {
    expect(topicApplies(NATIVE, 'web')).toBe(false);
    expect(topicApplies(NATIVE, 'native')).toBe(true);
    expect(topicApplies(MIXED, 'web')).toBe(true);
    expect(topicApplies(MIXED, 'native')).toBe(true);
  });
});

describe('todoSummary', () => {
  const topics = [MIXED, NATIVE, ASK_ONLY, RESIGN];

  it('leaves native-only topics out of the web count', () => {
    expect(todoSummary(topics, [], facts('web'))).toEqual({ done: 0, total: 2, visible: true });
  });

  it('counts done and skipped topics as done ("1 of 4 done")', () => {
    const a = [ans('ask', '', 'skip')];
    const f = facts('native', {}, {}, { buildFirstSeenAt: NOW - 1000 });
    // ASK_ONLY skipped, NATIVE done (in the app), RESIGN done (7 days left).
    expect(todoSummary(topics, a, f)).toEqual({ done: 3, total: 4, visible: true });
  });

  it('a "6 of 12" summary', () => {
    const many: TodoTopic[] = Array.from({ length: 12 }, (_, i) => ({
      ...ASK_ONLY,
      id: `t${i}`,
    }));
    const a = many.slice(0, 6).map((t) => ans(t.id, '', 'skip'));
    expect(todoSummary(many, a, facts('web'))).toEqual({ done: 6, total: 12, visible: true });
  });

  it('hides the card when every topic for this platform is done or skipped', () => {
    const a = [
      ans('mixed', 'a1', 'auto'),
      ans('mixed', 'a2', 'auto'),
      ans('mixed', 'q1', 'ask', { optionIds: ['ok'] }),
      ans('ask', '', 'skip'),
    ];
    // Web: NATIVE and RESIGN don't count, so 2 of 2.
    expect(todoSummary(topics, a, facts('web'))).toEqual({ done: 2, total: 2, visible: false });
  });

  it('is not visible with no topics', () => {
    expect(todoSummary([], [], facts('web'))).toEqual({ done: 0, total: 0, visible: false });
  });
});

describe('pendingAutoTicks', () => {
  it('lists auto steps met now that have no stored tick', () => {
    const f = facts('web', { chatQuestions: 3, coachChanges: 2 });
    expect(pendingAutoTicks([MIXED], [ans('mixed', 'a1', 'auto')], f)).toEqual([
      { topicId: 'mixed', stepId: 'a2' },
    ]);
  });

  it('skips recurring topics, topics for the other platform and skipped topics', () => {
    const f = facts('web', { chatQuestions: 1 }, {}, { buildFirstSeenAt: NOW - 1000 });
    const phone = facts('native', {}, {}, { buildFirstSeenAt: NOW - 1000 });
    expect(pendingAutoTicks([RESIGN, NATIVE], [], phone)).toEqual([
      { topicId: 'phone', stepId: 'n1' },
    ]);
    expect(pendingAutoTicks([NATIVE], [], f)).toEqual([]);
    expect(pendingAutoTicks([MIXED], [ans('mixed', '', 'skip')], f)).toEqual([]);
  });
});

describe('currentAnswer', () => {
  it('is the latest ask answer of the step', () => {
    const older = ans('ask', 'x', 'ask', { optionIds: ['y'], at: 1 });
    const newer = ans('ask', 'x', 'ask', { optionIds: ['n'], at: 2 });
    expect(currentAnswer([newer, older], 'ask', 'x')).toBe(newer);
    expect(currentAnswer([older], 'ask', 'z')).toBeUndefined();
  });
});

describe('resignReminder', () => {
  const first = (daysAgo: number) => new Date(2026, 10, 16 - daysAgo, 9).getTime();
  const topics = [MIXED, RESIGN];

  it('gives the days left once at or below the warning (≤ 2 days)', () => {
    expect(resignReminder(topics, facts('native', {}, {}, { buildFirstSeenAt: first(4) }))).toBe(
      null,
    );
    expect(resignReminder(topics, facts('native', {}, {}, { buildFirstSeenAt: first(5) }))).toBe(2);
    expect(resignReminder(topics, facts('native', {}, {}, { buildFirstSeenAt: first(9) }))).toBe(0);
  });

  it('is null on web, on the paid account and without a re-sign topic', () => {
    const late = { buildFirstSeenAt: first(6) };
    expect(resignReminder(topics, facts('web', {}, {}, late))).toBe(null);
    expect(resignReminder(topics, facts('native', {}, { signingPaid: true }, late))).toBe(null);
    expect(resignReminder([MIXED], facts('native', {}, {}, late))).toBe(null);
  });
});

describe('owner mode (M13)', () => {
  const OWNER_ONLY: TodoTopic = { ...ASK_ONLY, id: 'owner-only', owner: true };
  const topics = [MIXED, NATIVE, ASK_ONLY, RESIGN, OWNER_ONLY];
  const late = { buildFirstSeenAt: new Date(2026, 10, 10, 9).getTime() };

  it('ownerTopics keeps owner-only topics only when on', () => {
    expect(ownerTopics(topics, true)).toEqual(topics);
    expect(ownerTopics(topics, false).map((t) => t.id)).toEqual(['mixed', 'phone', 'ask', 'resign']);
  });

  it('owner on: the summary, ticks and re-sign line are unchanged (defaults = on)', () => {
    const f = facts('native', { chatQuestions: 1 }, {}, late);
    const a = [ans('ask', '', 'skip')];
    expect(todoSummary(topics, a, f, true)).toEqual(todoSummary(topics, a, f));
    expect(todoSummary(topics, a, f, true)).toEqual({ done: 2, total: 5, visible: true });
    expect(pendingAutoTicks(topics, a, f, true)).toEqual(pendingAutoTicks(topics, a, f));
    expect(pendingAutoTicks(topics, a, f, true).length).toBeGreaterThan(0);
    expect(resignReminder(topics, f, true)).toBe(resignReminder(topics, f));
    expect(resignReminder(topics, f, true)).toBe(1);
  });

  it('owner off: no Today card, no auto ticks recorded, no re-sign line', () => {
    const f = facts('native', { chatQuestions: 1 }, {}, late);
    const s = todoSummary(topics, [], f, false);
    expect(s.visible).toBe(false);
    // Owner-only topics don't count when off.
    expect(s.total).toBe(4);
    expect(pendingAutoTicks(topics, [], f, false)).toEqual([]);
    expect(resignReminder(topics, f, false)).toBe(null);
  });
});
