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
  PRIVACY_LINE,
  awaitingAnswer,
  chat,
  coachTabScreen,
  recapRange,
  redFlagUp,
  splitReplyChips,
  textToSend,
  visibleChatChips,
  type ChatActions,
  type ChatChip,
  type ChatProps,
} from './chat';
import { resetFocusCardMemory } from './focusBlockCard';

useFakeDom();
beforeEach(() => resetFocusCardMemory());

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
    expect(CHAT_CHIPS).toHaveLength(7);
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

  it('typing indicator: 3 dots with words for screen readers; no starters meanwhile', () => {
    const { el } = mount({ typing: true });
    const t = one(el, 'data-chat-typing');
    expect(t.getAttribute('role')).toBe('status');
    expect(t.byClass('chat-dot')).toHaveLength(3);
    expect(t.oneByClass('sr-only').textContent).toBe('The coach is typing');
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
    expect(el.oneByClass('chat-note').textContent).toBe('Answered by quick replies.');
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
      clear.click();
      expect(clear.getAttribute('data-armed')).toBe('true');
      expect(clear.textContent.trim()).toBe(CLEAR_CONFIRM);
      expect(log).toEqual([]);
      vi.advanceTimersByTime(CLEAR_ARM_MS);
      expect(clear.getAttribute('data-armed')).toBe('false');
      expect(clear.textContent.trim()).toBe(CLEAR_LABEL);
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
