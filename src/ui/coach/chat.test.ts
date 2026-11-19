import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STARTER_CHIPS } from '../../core/trainer/coach';
import type { ChatCard, ChatCardStatus, ChatMessage, FocusBlock } from '../../core/types';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import {
  CHAT_CHIPS,
  CLEAR_ARM_MS,
  CLEAR_CONFIRM,
  CLEAR_LABEL,
  EMPTY_LINE,
  LISTENING_PLACEHOLDER,
  THINKING_LABEL,
  sourceBadge,
  updateChatMic,
  resetChatDrafts,
  PRIVACY_LINE,
  awaitingAnswer,
  chat,
  coachTabScreen,
  recapRange,
  newestScrollTop,
  pinNewest,
  REVEAL_MS,
  redFlagUp,
  revealMessage,
  revealScrollTop,
  splitReplyChips,
  textToSend,
  visibleChatChips,
  type ChatActions,
  type ChatChip,
  type ChatProps,
} from './chat';
import { resetFocusCardMemory } from './focusBlockCard';
import { resetCheckInMemory } from './checkInCard';
import {
  MIC_DOWNLOADING,
  MIC_HINT,
  MIC_INSTALL_LABEL,
  MIC_UNAVAILABLE_LINES,
  resetMicHold,
} from './micButton';

useFakeDom();
beforeEach(() => {
  resetChatDrafts();
  resetFocusCardMemory();
  resetCheckInMemory();
  resetMicHold();
});

const T0 = Date.UTC(2026, 10, 16, 9);
let nextId = 1;
const msg = (
  role: 'user' | 'coach',
  text: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  id: nextId++,
  createdAt: T0 + nextId * 1000,
  role,
  text,
  source: role === 'user' ? 'chip' : 'rules',
  phase: 'today',
  ...extra,
});
const proposalCard = (status: ChatCardStatus): ChatCard => ({
  kind: 'proposal',
  title: 'Move Push A to Wed',
  lines: [{ before: 'Mon: Push A', after: 'Wed: Push A' }],
  why: 'Your week keeps its order.',
  status,
  baseVersion: 3,
});
const RED = 'Stop the workout for today and get checked by a doctor.';

const BLOCK: FocusBlock = {
  id: 'b1',
  group: 'chest',
  startDate: '2026-11-16',
  weeks: 2,
  weekdays: [1],
  days: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-11-${String(16 + i).padStart(2, '0')}`,
    day:
      i % 7 === 0
        ? {
            id: 'push',
            name: 'Push A',
            exercises: [
              {
                exerciseId: 'Bench',
                sets: 4,
                targetReps: [8, 12],
                restSec: 90,
                tracking: 'manual',
              },
            ],
          }
        : null,
  })),
  targetSetsPerWeek: 6,
  baseSetsPerWeek: 4,
};

function mount(p: Partial<ChatProps> = {}, extra: Partial<ChatActions> = {}) {
  const log: string[] = [];
  const el = asFake(
    chat(
      { messages: [], variant: 'tab', allowTyping: true, ...p },
      {
        onText: (t) => log.push(`text:${t}`),
        onChip: (c: ChatChip) =>
          log.push(`chip:${c.id}:${c.label}${c.args ? `:${JSON.stringify(c.args)}` : ''}`),
        onArea: (a) => log.push(`area:${a}`),
        onFollowUp: (i) => log.push(`follow:${i}`),
        onApply: (id) => log.push(`apply:${id}`),
        onDismiss: (id) => log.push(`dismiss:${id}`),
        onUndo: (id) => log.push(`undo:${id}`),
        onAskAgain: (id) => log.push(`ask:${id}`),
        onLogFood: (id, row) => log.push(`log:${id}:${row}`),
        onEndWorkout: () => log.push('end'),
        onClearChat: () => log.push('clear'),
        onClose: () => log.push('close'),
        ...extra,
      },
    ),
  );
  return { el, log };
}
const attr = (el: FakeEl, name: string, value?: string) =>
  el.find((e) => e.hasAttribute(name) && (value === undefined || e.getAttribute(name) === value));
const one = (el: FakeEl, name: string, value?: string) => {
  const hit = attr(el, name, value)[0];
  if (!hit) throw new Error(`no [${name}${value ? `=${value}` : ''}]`);
  return hit;
};
const texts = (el: FakeEl) => el.byTag('button').map((b) => b.textContent.trim());
const btn = (el: FakeEl, t: string) => {
  const hit = el.byTag('button').find((b) => b.textContent.trim() === t);
  if (!hit) throw new Error(`no button "${t}" in ${texts(el).join('|')}`);
  return hit;
};
const input = (el: FakeEl) => el.byTag('input')[0];

describe('chat: pure selectors', () => {
  it('splits a core reply into quick chips, the area chips and follow-ups', () => {
    const r = splitReplyChips([
      { id: 'notToday', label: 'Not today' },
      { id: 'focusBlock', label: 'Build a focus block' },
      { id: 'arms', label: 'Arms' },
      { id: 'swapTo', label: 'Try Hammer Curls', args: { exerciseId: 'a', toId: 'b' } },
      { id: 'focusBlock', label: '4 weeks', args: { group: 'chest', weeks: 4 } },
      { id: 'endWorkout', label: 'End workout' },
    ]);
    expect(r.quick).toEqual(['notToday', 'focusBlock']);
    expect(r.showAreas).toBe(true);
    expect(r.followUps.map((f) => f.label)).toEqual(['Try Hammer Curls', '4 weeks']);
  });

  it('red flag / waiting only when it is the newest message', () => {
    const red = msg('coach', RED, { card: { kind: 'redFlag' } });
    const pend = msg('coach', "Here's what I'd change.", { card: proposalCard('pending') });
    expect(redFlagUp([red])).toBe(true);
    expect(redFlagUp([red, msg('user', 'Not today')])).toBe(false);
    expect(awaitingAnswer([pend])).toBe(true);
    expect(awaitingAnswer([msg('coach', 'x', { card: proposalCard('applied') })])).toBe(false);
    expect(
      awaitingAnswer([
        msg('coach', 'x', { card: { kind: 'focusBlock', blockId: 'b1', status: 'pending' } }),
      ]),
    ).toBe(true);
    expect(visibleChatChips({ messages: [pend], variant: 'tab' })).toEqual([]);
    expect(visibleChatChips({ messages: [], variant: 'sheet' }).map((c) => c.id)).toEqual([
      'easyOn',
      'lighter',
      'swap',
    ]);
  });

  it('trims text and formats a recap range', () => {
    expect(textToSend('  hi   coach ')).toBe('hi coach');
    expect(textToSend('   ')).toBeNull();
    expect(textToSend('x'.repeat(300))).toHaveLength(200);
    expect(recapRange('2026-11-09', '2026-11-15')).toBe('Mon 9 Nov to Sun 15 Nov');
  });
});

describe('chat: tab variant', () => {
  it('empty thread: the line, the 4 starters, all 7 quick chips incl. Build a focus block, text box, privacy', () => {
    const { el, log } = mount();
    expect(el.getAttribute('data-chat')).toBe('');
    expect(el.getAttribute('data-variant')).toBe('tab');
    expect(el.oneByClass('chat-empty-line').textContent).toBe(EMPTY_LINE);
    const starters = attr(el, 'data-coach-starter');
    expect(starters.map((s) => s.textContent)).toEqual(STARTER_CHIPS.map((c) => c.label));
    expect(attr(el, 'data-coach-chip').map((c) => c.getAttribute('data-coach-chip'))).toEqual(
      CHAT_CHIPS.map((c) => c.id),
    );
    expect(one(el, 'data-coach-chip', 'focusBlock').textContent).toBe('Build a focus block');
    // M12 1b: core's 7 quick chips + "Short on time", next to "Lighter today".
    expect(CHAT_CHIPS).toHaveLength(8);
    expect(one(el, 'data-coach-chip', 'shortOnTime').textContent).toBe('Short on time');
    const ids = CHAT_CHIPS.map((c) => c.id);
    expect(ids.indexOf('shortOnTime')).toBe(ids.indexOf('lighter') + 1);
    expect(el.byTag('label')[0]?.textContent).toBe('Ask the coach');
    expect(btn(el, 'Send')).toBeTruthy();
    expect(el.oneByClass('cs-privacy').textContent).toBe(PRIVACY_LINE);
    // No Clear chat with nothing to clear; no Close on the tab.
    expect(attr(el, 'data-chat-clear')).toHaveLength(0);
    expect(texts(el)).not.toContain('Close');
    starters[0]?.click();
    one(el, 'data-coach-chip', 'focusBlock').click();
    expect(log).toEqual(["chip:week:How's my week?", 'chip:focusBlock:Build a focus block']);
  });

  it('M13: the empty thread is the shared empty state (spark icon, one line, the starters as its action)', () => {
    const { el } = mount();
    const empty = one(el, 'data-empty-state', 'coach-thread');
    expect(empty.classes).toEqual(expect.arrayContaining(['empty-state', 'chat-empty']));
    const art = empty.oneByClass('empty-state-art');
    expect(art.getAttribute('aria-hidden')).toBe('true');
    expect(art.byTag('svg').map((s) => s.getAttribute('data-icon'))).toEqual(['spark']);
    expect(empty.byTag('p').map((p) => p.textContent)).toEqual([EMPTY_LINE]);
    // The one action is the group of suggestions.
    const group = one(empty, 'role', 'group');
    expect(group.getAttribute('aria-label')).toBe('Suggestions');
    expect(attr(group, 'data-coach-starter')).toHaveLength(STARTER_CHIPS.length);
    // Gone once there is a message or the coach is typing.
    expect(attr(mount({ messages: [msg('user', 'Hi')] }).el, 'data-empty-state')).toHaveLength(0);
    expect(attr(mount({ typing: true }).el, 'data-empty-state')).toHaveLength(0);
  });

  it('starters from main carry their args (swap names today’s exercise)', () => {
    const { el, log } = mount({
      starters: [{ id: 'swap', label: "Swap today's Bench Press", args: { exerciseId: 'Bench' } }],
    });
    one(el, 'data-coach-starter', 'swap').click();
    expect(log).toEqual([`chip:swap:Swap today's Bench Press:{"exerciseId":"Bench"}`]);
  });

  it('bubbles: his on the right, the coach on the left, sr-only speaker, ≥ 20px class', () => {
    const { el } = mount({
      messages: [msg('user', "How's my week?"), msg('coach', '3 of 4 sessions done.')],
    });
    const items = el.byClass('chat-item');
    expect(items.map((i) => i.classes.find((c) => c.startsWith('chat-item-')))).toEqual([
      'chat-item-user',
      'chat-item-coach',
    ]);
    const bubbles = el.byClass('chat-bubble');
    expect(bubbles.map((b) => b.textContent)).toEqual([
      "You: How's my week?",
      'Coach: 3 of 4 sessions done.',
    ]);
    expect(bubbles.every((b) => b.byClass('sr-only').length === 1)).toBe(true);
    expect(bubbles.every((b) => b.classes.includes('cs-msg'))).toBe(true); // .cs-msg: var(--fs-body)
    expect(el.byClass('chat-empty')).toHaveLength(0);
    expect(one(el, 'role', 'log').getAttribute('aria-live')).toBe('polite');
  });

  it('sends typed text on Send and on Enter', () => {
    const { el, log } = mount();
    const box = input(el) as FakeEl;
    (box as unknown as { value: string }).value = '  what should I eat tonight ';
    btn(el, 'Send').click();
    const ev = { key: 'Enter', preventDefault: vi.fn() };
    box.dispatch('keydown', ev);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(log).toEqual(['text:what should I eat tonight', 'text:what should I eat tonight']);
  });

  it('keeps unsent typing across a re-render (a card posted while typing); Send clears it', () => {
    const first = mount();
    const box = input(first.el) as FakeEl & { value?: string };
    box.value = 'my gym has no';
    box.dispatch('input', {});
    // Main re-renders (e.g. the check-in card arrives): the new box still holds the words.
    const again = mount();
    const box2 = input(again.el) as FakeEl & { value?: string };
    expect(box2.value).toBe('my gym has no');
    // The sheet has its own draft.
    expect((input(mount({ variant: 'sheet' }).el) as FakeEl & { value?: string }).value ?? '').toBe(
      '',
    );
    box2.value = 'my gym has no leg press';
    box2.dispatch('input', {});
    btn(again.el, 'Send').click();
    expect(again.log).toEqual(['text:my gym has no leg press']);
    expect((input(mount().el) as FakeEl & { value?: string }).value ?? '').toBe('');
  });

  it('onInputFocus fires when the text box gets focus (main prewarms Apple’s model)', () => {
    const log: string[] = [];
    const { el } = mount({}, { onInputFocus: () => log.push('focus') });
    (input(el) as FakeEl).dispatch('focus', {});
    (input(el) as FakeEl).dispatch('focus', {});
    expect(log).toEqual(['focus', 'focus']);
    // Without the callback, focus is harmless.
    expect(() => (input(mount().el) as FakeEl).dispatch('focus', {})).not.toThrow();
  });

  it('pending proposal: Apply / Not now by message id; no quick chips or text box while it waits', () => {
    const m = msg('coach', "Here's what I'd change.", { card: proposalCard('pending') });
    const { el, log } = mount({
      messages: [msg('user', 'Not today'), m],
      followUps: [{ label: 'Push the week instead' }],
    });
    expect(one(el, 'data-proposal').getAttribute('aria-label')).toBe('Move Push A to Wed');
    btn(el, 'Apply').click();
    btn(el, 'Not now').click();
    expect(log).toEqual([`apply:${m.id}`, `dismiss:${m.id}`]);
    expect(attr(el, 'data-coach-chip')).toHaveLength(0);
    expect(input(el)).toBeUndefined();
    // Follow-ups stay next to a waiting proposal (they're alternatives to it).
    expect(one(el, 'data-coach-followup', '0').textContent).toBe('Push the week instead');
  });

  it.each([
    ['applied', 'Applied.', 'Undo'],
    ['dismissed', 'Not now. Nothing changed.', null],
    ['undone', 'Undone. Your plan is back.', null],
    ['expired', 'Your plan changed since. This is out of date.', 'Ask again'],
  ] as const)('old proposal %s: a status line, no Apply', (status, line, action) => {
    const m = msg('coach', "Here's what I'd change.", { card: proposalCard(status) });
    const { el, log } = mount({ messages: [m] });
    expect(texts(el)).not.toContain('Apply');
    expect(one(el, 'data-card-status', status).textContent).toBe(line);
    expect(one(el, 'data-proposal').getAttribute('data-proposal-status')).toBe(status);
    if (action) {
      btn(el, action).click();
      expect(log).toEqual([`${action === 'Undo' ? 'undo' : 'ask'}:${m.id}`]);
    }
    // The thread isn't waiting: chips and the text box are back.
    expect(attr(el, 'data-coach-chip').length).toBeGreaterThan(0);
    expect(input(el)).toBeDefined();
  });

  it('Undo only on applied cards that can still be undone', () => {
    const a = msg('coach', 'x', { card: proposalCard('applied') });
    const b = msg('coach', 'y', { card: proposalCard('applied') });
    const { el } = mount({ messages: [a, b], undoable: [b.id ?? 0] });
    const undos = el.byTag('button').filter((x) => x.textContent.trim() === 'Undo');
    expect(undos).toHaveLength(1);
    expect(
      el
        .find((e) => e.getAttribute('data-msg-id') === String(b.id))[0]
        ?.byTag('button')
        .map((x) => x.textContent.trim()),
    ).toContain('Undo');
  });

  it('focus-block card by id: weeks + Apply; Apply goes to that message', () => {
    const m = msg('coach', "Here's a 2-week chest block.", {
      card: { kind: 'focusBlock', blockId: 'b1', status: 'pending' },
    });
    const { el, log } = mount({
      messages: [m],
      focusBlocks: { b1: BLOCK },
      exerciseName: (id) => (id === 'Bench' ? 'Bench Press' : id),
      isFocusExercise: (id, block) => block.group === 'chest' && id === 'Bench',
    });
    expect(attr(el, 'data-fb-week').map((w) => w.textContent)).toEqual([
      'Week 1 · 1 day · chest 4 sets',
      'Week 2 · 1 day · chest 4 sets',
    ]);
    one(el, 'data-fb-week', '0').click();
    one(el, 'data-fb-day', '2026-11-16').click();
    expect(one(el, 'data-fb-ex', 'Bench').textContent).toBe('Bench Press4 × 8–12Focus');
    btn(el, 'Apply').click();
    expect(log).toEqual([`apply:${m.id}`]);
  });

  it('pending focus block: no quick chips, but the text box stays for edits ("only 4 days a week")', () => {
    const m = msg('coach', "Here's a 2-week chest block.", {
      card: { kind: 'focusBlock', blockId: 'b1', status: 'pending' },
    });
    const { el, log } = mount({ messages: [m], focusBlocks: { b1: BLOCK } });
    expect(attr(el, 'data-coach-chip')).toHaveLength(0);
    const box = input(el);
    expect(box).toBeDefined();
    (box as unknown as { value: string }).value = 'only 4 days a week';
    btn(el, 'Send').click();
    expect(log).toEqual(['text:only 4 days a week']);
    // A red flag still wins: nothing to type.
    const red = msg('coach', RED, { card: { kind: 'redFlag' } });
    expect(input(mount({ messages: [m, red] }).el)).toBeUndefined();
  });

  it('food card: Log by message id and row; logged rows marked', () => {
    const card: ChatCard = {
      kind: 'food',
      suggestions: [
        { label: 'Chicken rice', amount: { servings: 1 }, macros: { kcal: 600, proteinG: 35 } },
        { label: 'Greek yogurt', amount: { grams: 200 }, macros: { kcal: 150, proteinG: 20 } },
      ] as never,
      logged: [1],
    };
    const m = msg('coach', 'Ideas that fit today:', { card });
    const { el, log } = mount({ messages: [m] });
    one(el, 'data-food-log', '0').click();
    expect(attr(el, 'data-food-logged', '1')).toHaveLength(1);
    expect(log).toEqual([`log:${m.id}:0`]);
  });

  it('recap card: the period, its dates and the text', () => {
    const m = msg('coach', '4 of 5 sessions, 92% of planned sets.', {
      card: { kind: 'recap', period: 'week', from: '2026-11-09', to: '2026-11-15' },
    });
    const { el } = mount({ messages: [m] });
    const r = one(el, 'data-recap', 'week');
    expect(r.textContent).toBe(
      'Week recapMon 9 Nov to Sun 15 NovCoach: 4 of 5 sessions, 92% of planned sets.',
    );
    expect(el.byClass('chat-bubble')).toHaveLength(0);
  });

  it('red flag newest: only its buttons; no chips, starters, follow-ups or text box', () => {
    const red = msg('coach', RED, { card: { kind: 'redFlag' } });
    const { el, log } = mount({
      messages: [msg('user', 'chest pain'), red],
      followUps: [{ label: 'x' }],
      showAreas: true,
    });
    expect(one(el, 'data-redflag').getAttribute('role')).toBe('alert');
    expect(texts(el).filter((t) => t !== CLEAR_LABEL)).toEqual(['Not today']);
    expect(input(el)).toBeUndefined();
    btn(el, 'Not today').click();
    expect(log).toEqual(['chip:notToday:Not today']);
  });

  it('an older red flag keeps its words but no buttons', () => {
    const red = msg('coach', RED, { card: { kind: 'redFlag' } });
    const { el } = mount({ messages: [red, msg('user', 'Not today'), msg('coach', 'Moved.')] });
    expect(one(el, 'data-redflag').byTag('button')).toHaveLength(0);
    expect(input(el)).toBeDefined();
  });

  it('typing indicator: 3 dots and "Thinking…" in words; no starters meanwhile', () => {
    const { el } = mount({ typing: true });
    const t = one(el, 'data-chat-typing');
    expect(t.getAttribute('role')).toBe('status');
    expect(t.byClass('chat-dot')).toHaveLength(3);
    expect(t.byClass('chat-dot').every((d) => d.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(t.textContent).toBe(THINKING_LABEL);
    expect(attr(el, 'data-coach-starter')).toHaveLength(0);
  });

  it('area chips after Go easy on…, with aria-expanded on the chip', () => {
    const { el, log } = mount({
      showAreas: true,
      messages: [msg('coach', 'Which area should I go easy on?')],
    });
    expect(one(el, 'data-coach-chip', 'easyOn').getAttribute('aria-expanded')).toBe('true');
    one(el, 'data-coach-area', 'shoulders').click();
    expect(log).toEqual(['area:shoulders']);
  });

  it('a note under a reply (fallback line)', () => {
    const { el } = mount({
      messages: [msg('coach', 'OK.', { note: 'Answered by quick replies.' })],
    });
    const note = el.oneByClass('chat-note');
    expect(note.textContent).toBe('Answered by quick replies.');
    // A muted system line: an info icon + words, announced as a note.
    expect(note.getAttribute('role')).toBe('note');
    expect(note.find((e) => e.getAttribute('data-icon') === 'help')).toHaveLength(1);
  });

  it('new messages rise in; the first open shows the thread in place', () => {
    const a = msg('user', 'a');
    const b = msg('coach', 'b');
    expect(mount({ messages: [a, b] }).el.byClass('chat-rise')).toHaveLength(0);
    const risen = mount({ messages: [a, b], animateAfter: a.id }).el.byClass('chat-rise');
    expect(risen.map((r) => r.getAttribute('data-msg-id'))).toEqual([String(b.id)]);
  });

  describe('Clear chat (two taps)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('first tap arms it, the second clears; it disarms on its own', () => {
      const { el, log } = mount({ messages: [msg('coach', 'hi')] });
      const clear = one(el, 'data-chat-clear');
      expect(clear.textContent.trim()).toBe(CLEAR_LABEL);
      // M13d task 40f: a round button (word beside); armed it turns danger, with words.
      expect(clear.hasAttribute('data-icon-btn')).toBe(true);
      expect(clear.getAttribute('data-label-at')).toBe('beside');
      expect(clear.getAttribute('data-variant')).toBe('secondary');
      clear.click();
      expect(clear.getAttribute('data-armed')).toBe('true');
      expect(clear.textContent.trim()).toBe(CLEAR_CONFIRM);
      expect(clear.getAttribute('data-variant')).toBe('danger');
      expect(log).toEqual([]);
      vi.advanceTimersByTime(CLEAR_ARM_MS);
      expect(clear.getAttribute('data-armed')).toBe('false');
      expect(clear.textContent.trim()).toBe(CLEAR_LABEL);
      expect(clear.getAttribute('data-variant')).toBe('secondary');
      clear.click();
      clear.click();
      expect(log).toEqual(['clear']);
    });
  });

  it('coachTabScreen: the chat then the tab bar in a coach screen', () => {
    const bar = new FakeEl('nav');
    const el = asFake(
      coachTabScreen(
        { messages: [] },
        { onChip: () => {}, onArea: () => {}, onApply: () => {}, onDismiss: () => {} },
        bar as unknown as HTMLElement,
      ),
    );
    expect(el.classes).toEqual(expect.arrayContaining(['screen', 'has-tabbar', 'coach-screen']));
    expect(el.getAttribute('data-screen')).toBe('coach');
    expect(el.children[0]?.getAttribute('data-variant')).toBe('tab');
    expect(el.children[1]).toBe(bar);
  });
});

describe('chat: sheet variant (Pause sheet)', () => {
  const thread = [msg('user', 'Lighter today'), msg('coach', 'Done.', { phase: 'workout' })];

  it('a "Coach" dialog with Close, the same thread, workout chips only, no Clear chat', () => {
    const { el, log } = mount({ variant: 'sheet', messages: thread, inWorkout: true });
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-label')).toBe('Coach');
    expect(el.classes).toEqual(expect.arrayContaining(['overlay', 'coach-sheet']));
    expect(el.byClass('cs-panel')).toHaveLength(1);
    expect(el.byClass('chat-bubble').map((b) => b.textContent)).toEqual([
      'You: Lighter today',
      'Coach: Done.',
    ]);
    expect(attr(el, 'data-coach-chip').map((c) => c.getAttribute('data-coach-chip'))).toEqual([
      'easyOn',
      'lighter',
      'swap',
    ]);
    expect(attr(el, 'data-chat-clear')).toHaveLength(0);
    btn(el, 'Close').click();
    expect(log).toEqual(['close']);
  });

  it('red flag mid-workout offers End workout and Not today', () => {
    const red = msg('coach', RED, { card: { kind: 'redFlag' }, phase: 'workout' });
    const { el, log } = mount({ variant: 'sheet', messages: [red], inWorkout: true });
    expect(texts(el)).toEqual(['Close', 'End workout', 'Not today']);
    btn(el, 'End workout').click();
    expect(log).toEqual(['end']);
  });

  it('M13d task 40f: Close and Send are round buttons; their words stay their names', () => {
    const { el } = mount({ variant: 'sheet', messages: thread, allowTyping: true });
    const close = btn(el, 'Close');
    expect(close.hasAttribute('data-icon-btn')).toBe(true);
    expect(close.getAttribute('data-label-at')).toBe('beside');
    expect(close.getAttribute('aria-label')).toBeNull();
    const send = btn(el, 'Send');
    expect(send.hasAttribute('data-icon-btn')).toBe(true);
    expect(send.getAttribute('data-variant')).toBe('secondary');
    expect(send.getAttribute('data-label-at')).toBe('below');
    expect(send.oneByClass('icon-btn-circle').byTag('svg')[0]?.getAttribute('data-icon')).toBe(
      'arrow-right',
    );
  });

  it('Escape closes; Tab cycles the controls', () => {
    const { el, log } = mount({ variant: 'sheet', messages: thread });
    const doc = (globalThis as unknown as { document: { activeElement: unknown } }).document;
    const ev = (key: string, shiftKey = false) => ({ key, shiftKey, preventDefault: () => {} });
    el.dispatch('keydown', ev('Tab'));
    expect(asFake(doc.activeElement).textContent.trim()).toBe('Close');
    el.dispatch('keydown', ev('Tab', true));
    expect(asFake(doc.activeElement).textContent.trim()).toBe('Send');
    el.dispatch('keydown', ev('Escape'));
    expect(log).toEqual(['close']);
  });
});

// ---------- M12 slice 2 task 16: mic, source badge, brain note, thinking ----------

describe('chat: mic (slice 2)', () => {
  const g = globalThis as { window?: unknown };
  let saved: unknown;
  let winL: Map<string, ((ev: unknown) => void)[]>;
  beforeEach(() => {
    saved = g.window;
    winL = new Map();
    g.window = {
      addEventListener: (t: string, cb: (ev: unknown) => void) =>
        winL.set(t, [...(winL.get(t) ?? []), cb]),
      removeEventListener: (t: string, cb: (ev: unknown) => void) =>
        winL.set(
          t,
          (winL.get(t) ?? []).filter((x) => x !== cb),
        ),
    };
  });
  afterEach(() => {
    g.window = saved;
  });
  const micLog = (log: string[]) => ({
    micDown: () => log.push('micDown'),
    micUp: () => log.push('micUp'),
    micCancel: () => log.push('micCancel'),
  });
  const mountMic = (mic: ChatProps['mic'], p: Partial<ChatProps> = {}) => {
    const log: string[] = [];
    const r = mount(
      { mic, ...p },
      {
        ...micLog(log),
        onText: (t) => log.push(`text:${t}`),
        onClose: () => log.push('close'),
      },
    );
    return { ...r, log };
  };
  const hold = (el: FakeEl) => attr(el, 'data-mic-hold')[0];

  it('no mic prop / hidden → no mic (PWA, during a set)', () => {
    expect(attr(mount().el, 'data-mic')).toHaveLength(0);
    expect(attr(mountMic({ state: 'hidden' }).el, 'data-mic')).toHaveLength(0);
  });

  it('idle → "Talk" between the text box and Send, in that order', () => {
    const { el } = mountMic({ state: 'idle' });
    const row = el.oneByClass('cs-typing-row');
    expect(row.children.map((c) => c.tag)).toEqual(['input', 'span', 'button']);
    expect(row.children[1]?.getAttribute('data-mic-state')).toBe('idle');
    expect(hold(el)?.getAttribute('aria-label')).toBe('Hold to talk');
    expect(btn(el, 'Send').hasAttribute('disabled')).toBe(false);
  });

  it('idle without the callbacks → no button (nothing would listen)', () => {
    expect(attr(mount({ mic: { state: 'idle' } }).el, 'data-mic-hold')).toHaveLength(0);
  });

  it('hold: pointer down → micDown, release → micUp', () => {
    const { el, log } = mountMic({ state: 'idle' });
    hold(el)?.dispatch('pointerdown', { button: 0, preventDefault: () => {} });
    for (const cb of winL.get('pointerup') ?? []) cb({});
    expect(log).toEqual(['micDown', 'micUp']);
  });

  it('keyboard hold: Space down → micDown, Space up → micUp', () => {
    const { el, log } = mountMic({ state: 'idle' });
    hold(el)?.dispatch('keydown', { key: ' ', repeat: false, preventDefault: () => {} });
    for (const cb of winL.get('keyup') ?? []) cb({ key: ' ' });
    expect(log).toEqual(['micDown', 'micUp']);
  });

  it('listening → the live words in the text box (read-only), Send waits, the hint shows', () => {
    const { el, log } = mountMic({ state: 'listening', partial: 'move push to', level: 0.5 });
    const box = input(el) as FakeEl & { value?: string; readOnly?: boolean };
    expect(box.value).toBe('move push to');
    expect(box.readOnly).toBe(true);
    expect(box.getAttribute('placeholder')).toBe(LISTENING_PLACEHOLDER);
    expect(btn(el, 'Send').hasAttribute('disabled')).toBe(true);
    expect(btn(el, 'Send').hasAttribute('hidden')).toBe(true);
    btn(el, 'Send').click();
    box.dispatch('keydown', { key: 'Enter', preventDefault: () => {} });
    expect(log).toEqual([]);
    expect(one(el, 'data-mic-hint').textContent).toBe(MIC_HINT);
    expect(hold(el)?.getAttribute('aria-pressed')).toBe('true');
    // The hint sits above the text row: the dock is bottom-anchored, so a line under the row would
    // lift the held button out from under the finger (release = cancel).
    const typing = el.oneByClass('cs-typing');
    const kids = typing.children.map((c) =>
      c.hasAttribute('data-mic-hint') ? 'hint' : c.classes.includes('cs-typing-row') ? 'row' : '',
    );
    expect(kids.indexOf('hint')).toBeGreaterThanOrEqual(0);
    expect(kids.indexOf('hint')).toBeLessThan(kids.indexOf('row'));
  });

  it('listening → the live words also show whole, wrapping, above the text row', () => {
    const long = 'how is my week looking and can we move push to thursday';
    const { el } = mountMic({ state: 'listening', partial: long });
    const live = one(el, 'data-mic-live');
    expect(live.textContent).toBe(long);
    expect(live.hasAttribute('hidden')).toBe(false);
    const typing = el.oneByClass('cs-typing');
    const kids = typing.children.map((c) =>
      c.hasAttribute('data-mic-live') ? 'live' : c.classes.includes('cs-typing-row') ? 'row' : '',
    );
    expect(kids.indexOf('live')).toBeGreaterThanOrEqual(0);
    expect(kids.indexOf('live')).toBeLessThan(kids.indexOf('row'));
    // Patched in place, and gone (hidden) once he lets go.
    updateChatMic(el as unknown as HTMLElement, { state: 'listening', partial: 'how is' });
    expect(live.textContent).toBe('how is');
    updateChatMic(el as unknown as HTMLElement, { state: 'idle' });
    expect(live.hasAttribute('hidden')).toBe(true);
    // Nothing heard yet: no empty box.
    const quiet = mountMic({ state: 'listening', partial: '' });
    expect(one(quiet.el, 'data-mic-live').hasAttribute('hidden')).toBe(true);
    // Idle: hidden.
    expect(one(mountMic({ state: 'idle' }).el, 'data-mic-live').hasAttribute('hidden')).toBe(true);
  });

  it('updateChatMic patches words, level and state in place (no re-render)', () => {
    const { el } = mountMic({ state: 'listening', partial: 'mo' });
    const box = input(el) as FakeEl & { value?: string; readOnly?: boolean };
    expect(
      updateChatMic(el as unknown as HTMLElement, {
        state: 'listening',
        partial: 'move',
        level: 1,
      }),
    ).toBe(true);
    expect(box.value).toBe('move');
    expect(one(el, 'data-mic-ring').style.transform).toBe('scale(1.2)');
    updateChatMic(el as unknown as HTMLElement, { state: 'idle' });
    expect(box.readOnly).toBe(false);
    expect(btn(el, 'Send').hasAttribute('disabled')).toBe(false);
    expect(btn(el, 'Send').hasAttribute('hidden')).toBe(false);
    expect(hold(el)?.getAttribute('aria-pressed')).toBe('false');
    // To or from hidden / unavailable: re-render instead.
    expect(updateChatMic(el as unknown as HTMLElement, { state: 'hidden' })).toBe(false);
    expect(updateChatMic(mount().el as unknown as HTMLElement, { state: 'idle' })).toBe(false);
  });

  it('updateChatMic works on the Coach tab screen root too', () => {
    const log: string[] = [];
    const scr = asFake(
      coachTabScreen(
        { messages: [], allowTyping: true, mic: { state: 'idle' } },
        {
          onText: () => {},
          onChip: () => {},
          onArea: () => {},
          onApply: () => {},
          onDismiss: () => {},
          ...micLog(log),
        },
        document.createElement('nav'),
      ),
    );
    expect(
      updateChatMic(scr as unknown as HTMLElement, { state: 'listening', partial: 'hi' }),
    ).toBe(true);
    expect((input(scr) as FakeEl & { value?: string }).value).toBe('hi');
  });

  it('unavailable → the short line under the text box; typing and Send still work', () => {
    const { el, log } = mountMic({ state: 'unavailable', reason: 'permissionDenied' });
    expect(attr(el, 'data-mic-hold')).toHaveLength(0);
    expect(one(el, 'data-mic-unavailable').textContent).toBe(
      MIC_UNAVAILABLE_LINES.permissionDenied,
    );
    const box = input(el) as FakeEl & { value?: string };
    box.value = 'how was my week';
    btn(el, 'Send').click();
    expect(log).toEqual(['text:how was my week']);
  });

  it('modelNotInstalled → Download speech for the mic under the text box → micInstall', () => {
    const log: string[] = [];
    const { el } = mount(
      { mic: { state: 'unavailable', reason: 'modelNotInstalled' } },
      {
        ...micLog(log),
        micInstall: () => log.push('micInstall'),
        onText: (t) => log.push(`text:${t}`),
      },
    );
    expect(attr(el, 'data-mic-hold')).toHaveLength(0);
    const typing = el.oneByClass('cs-typing');
    const box = typing.find((e) => e.hasAttribute('data-mic-install'))[0];
    expect(box?.textContent).toBe(MIC_INSTALL_LABEL);
    box?.click();
    expect(log).toEqual(['micInstall']);
    // Typing still works.
    const t = input(el) as FakeEl & { value?: string };
    t.value = 'hi';
    btn(el, 'Send').click();
    expect(log).toEqual(['micInstall', 'text:hi']);
  });

  it('downloading → the status line; updateChatMic asks for a re-render to and from it', () => {
    const { el } = mountMic({ state: 'downloading' });
    expect(one(el, 'data-mic-downloading').textContent).toBe(MIC_DOWNLOADING);
    expect(attr(el, 'data-mic-install')).toHaveLength(0);
    expect(updateChatMic(el as unknown as HTMLElement, { state: 'idle' })).toBe(false);
    expect(updateChatMic(el as unknown as HTMLElement, { state: 'downloading' })).toBe(false);
  });

  it('no text box (a set, a red flag) → no mic either', () => {
    expect(attr(mountMic({ state: 'idle' }, { allowTyping: false }).el, 'data-mic')).toHaveLength(
      0,
    );
    const red = msg('coach', RED, { card: { kind: 'redFlag' } });
    expect(attr(mountMic({ state: 'idle' }, { messages: [red] }).el, 'data-mic')).toHaveLength(0);
  });

  it('sheet: Escape mid-hold cancels the mic, not the sheet', () => {
    const { el, log } = mountMic({ state: 'listening' }, { variant: 'sheet' });
    el.dispatch('keydown', { key: 'Escape', preventDefault: () => {} });
    expect(log).not.toContain('close');
    const idle = mountMic({ state: 'idle' }, { variant: 'sheet' });
    idle.el.dispatch('keydown', { key: 'Escape', preventDefault: () => {} });
    expect(idle.log).toContain('close');
  });
});

describe('chat: source badge (slice 2)', () => {
  it('words per brain: Apple → "On-device AI", rules / chip → "Quick replies"', () => {
    expect(sourceBadge('apple')).toBe('On-device AI');
    expect(sourceBadge('rules')).toBe('Quick replies');
    expect(sourceBadge('chip')).toBe('Quick replies');
    expect(sourceBadge('claude')).toBeNull();
  });

  it('with showSource: under coach bubbles only, as text with a screen-reader lead-in', () => {
    const { el } = mount({
      showSource: true,
      messages: [
        msg('user', 'How was my week?', { source: 'apple' }),
        msg('coach', 'Three of four sessions.', { source: 'apple' }),
        msg('coach', 'Moved.', { source: 'rules' }),
      ],
    });
    const badges = attr(el, 'data-chat-source');
    expect(badges.map((b) => b.getAttribute('data-chat-source'))).toEqual(['apple', 'rules']);
    expect(badges.map((b) => b.textContent)).toEqual([
      'Answered by On-device AI',
      'Answered by Quick replies',
    ]);
    expect(badges[0]?.oneByClass('sr-only').textContent).toBe('Answered by ');
  });

  it('without showSource (the PWA): no badges', () => {
    const { el } = mount({ messages: [msg('coach', 'Moved.', { source: 'rules' })] });
    expect(attr(el, 'data-chat-source')).toHaveLength(0);
  });

  it('the brain note sits under the reply with its badge', () => {
    const { el } = mount({
      showSource: true,
      messages: [
        msg('coach', 'Moved.', {
          source: 'rules',
          note: "Apple Intelligence is off, so I'm using quick replies.",
        }),
      ],
    });
    const item = el.oneByClass('chat-item-coach');
    expect(item.children.map((c) => c.classes[0] ?? c.classes.join(' '))).toEqual([
      'cs-msg',
      'chat-source',
      'chat-note',
    ]);
  });
});

describe('chat: check-in card (slice 2 task 17)', () => {
  const QS = [
    { id: 'energy', label: 'Energy this week', low: 'Low', high: 'High' },
    { id: 'sleep', label: 'Sleep this week', low: 'Low', high: 'High' },
    { id: 'soreness', label: 'Soreness this week', low: 'Low', high: 'High' },
  ] as const;
  const card = (status: 'pending' | 'done' | 'skipped') =>
    msg('coach', 'Quick check-in for last week.', {
      card: { kind: 'checkIn', weekStart: '2026-11-15', status },
    });

  it('draws the card with the questions; Done / Skip call back with the message id', () => {
    const m = card('pending');
    const log: string[] = [];
    const { el } = mount(
      { messages: [m], checkInQuestions: QS },
      {
        onCheckInDone: (id, a) => log.push(`done:${id}:${JSON.stringify(a)}`),
        onCheckInSkip: (id) => log.push(`skip:${id}`),
      },
    );
    expect(attr(el, 'data-checkin-q')).toHaveLength(3);
    one(el, 'data-checkin-pick', 'energy:2').click();
    one(el, 'data-checkin-done').click();
    one(el, 'data-checkin-skip').click();
    expect(log).toEqual([`done:${m.id}:{"energy":2}`, `skip:${m.id}`]);
  });

  it('done → the summary from checkIns', () => {
    const { el } = mount({
      messages: [card('done')],
      checkInQuestions: QS,
      checkIns: {
        '2026-11-15': { weekStart: '2026-11-15', energy: 4, sleep: 3, soreness: 2, at: 1 },
      },
    });
    expect(one(el, 'data-checkin-summary').textContent).toBe(
      'Saved: energy 4, sleep 3, soreness 2.',
    );
  });

  it('no questions → no card (just the coach line)', () => {
    const { el } = mount({ messages: [card('pending')] });
    expect(attr(el, 'data-checkin-card')).toHaveLength(0);
    expect(el.oneByClass('chat-bubble').textContent).toContain('Quick check-in');
  });

  it('pending without the callbacks → nothing to tap', () => {
    const { el } = mount({ messages: [card('pending')], checkInQuestions: QS });
    expect(attr(el, 'data-checkin-pick')).toHaveLength(0);
  });
});

describe('pinNewest (Checkpoint J: a new reply is never left behind the chip row)', () => {
  it('scrolls the box to the newest item and returns where it set it', () => {
    const box = { scrollTop: 0, scrollHeight: 1200, clientHeight: 400 };
    expect(pinNewest(box, { offsetTop: 1100, offsetHeight: 100 })).toBe(800);
    expect(box.scrollTop).toBe(800);
  });

  it('the thread box shrinking (keyboard, a new chip row) re-pins to the new bottom', () => {
    const box = { scrollTop: 800, scrollHeight: 1200, clientHeight: 400 };
    box.clientHeight = 250;
    pinNewest(box, { offsetTop: 1100, offsetHeight: 100 });
    expect(box.scrollTop).toBe(950);
  });

  it('a reply taller than the box shows from its top; no items → the bottom', () => {
    const box = { scrollTop: 0, scrollHeight: 1600, clientHeight: 300 };
    pinNewest(box, { offsetTop: 1000, offsetHeight: 600 });
    expect(box.scrollTop).toBe(992);
    pinNewest(box, null);
    expect(box.scrollTop).toBe(1300);
  });
});

describe('newestScrollTop (the thread opens on the newest message)', () => {
  it('a short newest message: the thread scrolls to the bottom', () => {
    expect(
      newestScrollTop({ scrollHeight: 1200, clientHeight: 400, itemTop: 1100, itemHeight: 100 }),
    ).toBe(800);
  });

  it('a newest card taller than the thread: its top shows (with a small gap), not its end', () => {
    expect(
      newestScrollTop({ scrollHeight: 1600, clientHeight: 400, itemTop: 900, itemHeight: 700 }),
    ).toBe(892);
  });

  it('a thread that fits: no scrolling', () => {
    expect(
      newestScrollTop({ scrollHeight: 300, clientHeight: 400, itemTop: 200, itemHeight: 100 }),
    ).toBe(0);
    expect(
      newestScrollTop({ scrollHeight: 300, clientHeight: 400, itemTop: 0, itemHeight: 900 }),
    ).toBe(0);
  });

  it('nothing in the thread: the bottom', () => {
    expect(newestScrollTop({ scrollHeight: 500, clientHeight: 400 })).toBe(100);
  });
});

describe('chat: a lead-in reply ("I can help with:") keeps its options under it', () => {
  const coachItems = (el: FakeEl) => el.find((e) => e.classes.includes('chat-item-coach'));
  const dock = (el: FakeEl) => el.oneByClass('chat-dock');
  const HELP_CHIPS = [
    { id: 'notToday', label: 'Not today' },
    { id: 'lighter', label: 'Lighter today' },
  ];

  it('newest: its chips sit right under its bubble, not in the dock; they still work', () => {
    const { el, log } = mount({
      messages: [msg('user', 'hello'), msg('coach', 'I can help with:', { chips: HELP_CHIPS })],
      chips: ['notToday', 'lighter'],
    });
    const item = coachItems(el)[0];
    if (!item) throw new Error('no coach item');
    const kids = item.children;
    expect(kids[0]?.classes).toContain('chat-bubble');
    expect(kids[1]?.getAttribute('data-chat-offers')).toBe('');
    expect(attr(item, 'data-coach-chip').map((c) => c.getAttribute('data-coach-chip'))).toEqual([
      'notToday',
      'lighter',
    ]);
    expect(attr(dock(el), 'data-coach-chip')).toHaveLength(0);
    one(item, 'data-coach-chip', 'lighter').click();
    expect(log).toEqual(['chip:lighter:Lighter today']);
  });

  it('newest with follow-ups: those sit under it too', () => {
    const { el, log } = mount({
      messages: [msg('coach', 'Pick one:', { chips: [{ id: 'swap', label: 'Try Hammer Curls' }] })],
      chips: [],
      followUps: [{ label: 'Try Hammer Curls' }],
    });
    const item = coachItems(el)[0];
    if (!item) throw new Error('no coach item');
    one(item, 'data-coach-followup', '0').click();
    expect(log).toEqual(['follow:0']);
    expect(attr(dock(el), 'data-coach-followup')).toHaveLength(0);
  });

  it('older: the bubble reads whole, its options as words', () => {
    const { el } = mount({
      messages: [
        msg('coach', 'I can help with:', { chips: HELP_CHIPS }),
        msg('user', 'lighter'),
        msg('coach', 'Lighter it is.'),
      ],
    });
    const first = coachItems(el)[0];
    expect(first?.oneByClass('chat-bubble').textContent).toBe(
      'Coach: I can help with: Not today, Lighter today.',
    );
    expect(attr(first as FakeEl, 'data-coach-chip')).toHaveLength(0);
    // The newest plain reply: chips stay in the dock as before.
    expect(attr(dock(el), 'data-coach-chip').length).toBeGreaterThan(0);
  });

  it('a plain reply keeps its chips in the dock', () => {
    const { el } = mount({
      messages: [msg('coach', 'Lighter it is.', { chips: HELP_CHIPS })],
      chips: ['notToday', 'lighter'],
    });
    expect(attr(coachItems(el)[0] as FakeEl, 'data-coach-chip')).toHaveLength(0);
    expect(attr(dock(el), 'data-coach-chip')).toHaveLength(2);
  });
});

// ---------- M13c task 12b: revealMessage (search → Coach at that message) ----------

const at = <T>(list: readonly T[], i: number): T => {
  const v = list[i];
  if (v === undefined) throw new Error(`nothing at ${i}`);
  return v;
};
const idAt = (list: readonly ChatMessage[], i: number): number => at(list, i).id ?? -1;

type Box = FakeEl & {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  scrollTo?: (o: { top: number; behavior: string }) => void;
};
type Item = FakeEl & { offsetTop: number; offsetHeight: number };

/** Gives the mounted thread a layout: a 400px box over 2000px of messages, 100px each. */
function layout(el: FakeEl): { box: Box; items: Item[] } {
  const box = el.oneByClass('chat-scroll') as Box;
  box.scrollHeight = 2000;
  box.clientHeight = 400;
  box.scrollTop = 1600;
  const items = attr(el, 'data-msg-id') as Item[];
  items.forEach((it, i) => {
    it.offsetTop = 200 * i;
    it.offsetHeight = 100;
  });
  return { box, items };
}

describe('revealScrollTop', () => {
  it('centres a message in the box', () => {
    expect(
      revealScrollTop({ itemTop: 1000, itemHeight: 100, clientHeight: 400, scrollHeight: 2000 }),
    ).toBe(850);
  });

  it('a message taller than the box shows from its top (small gap)', () => {
    expect(
      revealScrollTop({ itemTop: 1000, itemHeight: 600, clientHeight: 400, scrollHeight: 2000 }),
    ).toBe(992);
  });

  it('clamps to the top and the bottom of the thread', () => {
    expect(
      revealScrollTop({ itemTop: 50, itemHeight: 100, clientHeight: 400, scrollHeight: 2000 }),
    ).toBe(0);
    expect(
      revealScrollTop({ itemTop: 1950, itemHeight: 50, clientHeight: 400, scrollHeight: 2000 }),
    ).toBe(1600);
  });
});

describe('revealMessage (M13c task 12b)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const thread = () => [
    msg('user', 'How heavy should my bench be?'),
    msg('coach', 'Start with a weight you can lift 10 times.'),
    msg('user', 'Thanks'),
    msg('coach', 'Any time.'),
  ];

  it('scrolls smoothly to the message, outlines it (fading), focuses it, then clears', () => {
    vi.useFakeTimers();
    const messages = thread();
    const { el } = mount({ messages });
    const { box, items } = layout(el);
    const calls: { top: number; behavior: string }[] = [];
    box.scrollTo = (o) => {
      calls.push(o);
      box.scrollTop = o.top;
    };
    const target = at(messages, 1);
    expect(
      revealMessage(el as unknown as HTMLElement, target.id ?? -1, { reducedMotion: false }),
    ).toBe(true);
    // Item 1 sits at 200..300: centred → 200 - 150 = 50.
    expect(calls).toEqual([{ top: 50, behavior: 'smooth' }]);
    const item = at(items, 1);
    expect(item.getAttribute('data-msg-id')).toBe(String(target.id));
    expect(item.getAttribute('data-chat-reveal')).toBe('fade');
    expect(item.getAttribute('tabindex')).toBe('-1');
    expect(
      (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement,
    ).toBe(item);
    // Only that message is marked.
    expect(attr(el, 'data-chat-reveal')).toEqual([item]);
    vi.advanceTimersByTime(REVEAL_MS - 1);
    expect(item.hasAttribute('data-chat-reveal')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(item.hasAttribute('data-chat-reveal')).toBe(false);
  });

  it('reduced motion: an instant jump and a static outline (also read from matchMedia)', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q === '(prefers-reduced-motion: reduce)',
    }));
    const messages = thread();
    const { el } = mount({ messages });
    const { box, items } = layout(el);
    const calls: { top: number; behavior: string }[] = [];
    box.scrollTo = (o) => calls.push(o);
    // Search hands the id over as a string.
    expect(revealMessage(el as unknown as HTMLElement, String(at(messages, 2).id))).toBe(true);
    expect(calls).toEqual([{ top: 250, behavior: 'auto' }]);
    expect(at(items, 2).getAttribute('data-chat-reveal')).toBe('static');
    vi.advanceTimersByTime(REVEAL_MS);
    expect(at(items, 2).hasAttribute('data-chat-reveal')).toBe(false);
  });

  it('without scrollTo it sets scrollTop; a second reveal restarts the outline timer', () => {
    vi.useFakeTimers();
    const messages = thread();
    const { el } = mount({ messages });
    const { box, items } = layout(el);
    const root = el as unknown as HTMLElement;
    revealMessage(root, idAt(messages, 3), { reducedMotion: true });
    expect(box.scrollTop).toBe(450);
    vi.advanceTimersByTime(REVEAL_MS - 100);
    revealMessage(root, idAt(messages, 3), { reducedMotion: true });
    vi.advanceTimersByTime(200);
    expect(at(items, 3).getAttribute('data-chat-reveal')).toBe('static');
    vi.advanceTimersByTime(REVEAL_MS);
    expect(at(items, 3).hasAttribute('data-chat-reveal')).toBe(false);
  });

  it('works on the Coach tab screen root too', () => {
    vi.useFakeTimers();
    const messages = thread();
    const screen = asFake(
      coachTabScreen(
        { messages, allowTyping: true },
        {
          onText() {},
          onChip() {},
          onArea() {},
          onFollowUp() {},
          onApply() {},
          onDismiss() {},
        },
        document.createElement('nav'),
      ),
    );
    const { items } = layout(screen);
    expect(
      revealMessage(screen as unknown as HTMLElement, idAt(messages, 0), { reducedMotion: true }),
    ).toBe(true);
    expect(at(items, 0).getAttribute('data-chat-reveal')).toBe('static');
  });

  it('false when the message is gone, the chat is unknown or not mounted', () => {
    const messages = thread();
    const { el } = mount({ messages });
    layout(el);
    const root = el as unknown as HTMLElement;
    expect(revealMessage(root, 9999, { reducedMotion: true })).toBe(false);
    expect(revealMessage(asFake(document.createElement('div')) as unknown as HTMLElement, 1)).toBe(
      false,
    );
    el.oneByClass('chat-scroll').isConnected = false;
    expect(revealMessage(root, idAt(messages, 0), { reducedMotion: true })).toBe(false);
    expect(attr(el, 'data-chat-reveal')).toHaveLength(0);
  });

  it("the newest-pin after mount doesn't undo a reveal (it does pin without one)", () => {
    const frames: (() => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => frames.push(cb));
    const messages = thread();

    const plain = mount({ messages });
    const p = layout(plain.el);
    p.box.scrollTop = 0;
    frames.splice(0).forEach((f) => f());
    expect(p.box.scrollTop).toBe(1600);

    const revealed = mount({ messages });
    const r = layout(revealed.el);
    revealMessage(revealed.el as unknown as HTMLElement, idAt(messages, 1), {
      reducedMotion: true,
    });
    expect(r.box.scrollTop).toBe(50);
    frames.splice(0).forEach((f) => f());
    expect(r.box.scrollTop).toBe(50);
  });
});
