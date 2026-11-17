import { afterEach, describe, expect, it, vi } from 'vitest';
import programJson from '../../data/program.json';
import { trainerCatalog } from '../../core/testkit/trainerCatalog';
import { handle, type CoachContext } from '../../core/trainer/coach';
import { checkCopy } from '../../core/trainer/replies';
import { seedPlan } from '../../core/trainer/plan';
import type {
  BrainContext,
  BrainReply,
  BrainSource,
  ChatMessage,
  CoachBrain,
  Program,
} from '../../core/types';
import { BRAIN_ORDER, MAX_TURNS, createRouter, turnsFor } from './router';
import { rulesBrain } from './rules';

// Made-up context: the repo's default program, no history, no personal numbers.
const coach: CoachContext = {
  phase: 'today',
  state: { ...seedPlan(programJson as Program), version: 1 },
  sessions: [],
  today: '2030-01-09',
  unit: 'kg',
  lastWeightKg: {},
  logged: [],
  catalog: trainerCatalog(),
  m7Available: false,
};

const turn = (i: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: i,
  createdAt: 1000 + i,
  role: i % 2 ? 'coach' : 'user',
  text: `made-up turn ${i}`,
  source: 'rules',
  phase: 'today',
  ...over,
});

const ctx = (turns: ChatMessage[] = []): BrainContext => ({ coach, turns });

type Fake = CoachBrain & { asked: { text: string; ctx: BrainContext }[]; checked: number };

/** A fake model brain (apple / claude) with a scripted status and answer. */
function fake(
  id: BrainSource,
  opts: {
    available?: boolean;
    reason?: string;
    statusThrows?: boolean;
    statusHangs?: boolean;
    answer?: (text: string, ctx: BrainContext) => Promise<BrainReply>;
  } = {},
): Fake {
  const b: Fake = {
    id,
    asked: [],
    checked: 0,
    status: () => {
      b.checked++;
      if (opts.statusThrows) return Promise.reject(new Error('bridge down'));
      if (opts.statusHangs) return new Promise(() => {});
      return Promise.resolve({
        available: opts.available ?? true,
        ...(opts.reason !== undefined && { reason: opts.reason }),
      });
    },
    ask: (text, c) => {
      b.asked.push({ text, ctx: c });
      return (
        opts.answer?.(text, c) ??
        Promise.resolve({
          reply: `${id} says hi`,
          chips: [],
          safety: 'none',
          intent: 'help',
          source: id,
        })
      );
    },
  };
  return b;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('brain router (M12)', () => {
  it('orders brains apple → claude → rules', () => {
    expect(BRAIN_ORDER).toEqual(['apple', 'claude', 'rules']);
  });

  it('sends chips straight to the rules, skipping every model brain', async () => {
    const apple = fake('apple');
    const router = createRouter([apple, rulesBrain]);
    const reply = await router.ask({ chip: 'lighter' }, ctx());
    expect(reply).toEqual({ ...handle({ chip: 'lighter' }, coach), source: 'chip' });
    expect(apple.asked).toHaveLength(0);
    expect(apple.checked).toBe(0);
    expect(reply.note).toBeUndefined();
  });

  it('answers free text with the rules when only rules are registered (slice 1), no note', async () => {
    const router = createRouter([rulesBrain]);
    const reply = await router.ask({ text: 'lighter today please' }, ctx());
    expect(reply).toEqual({ ...handle({ text: 'lighter today please' }, coach), source: 'rules' });
    expect(reply.note).toBeUndefined();
  });

  it('always ends at the rules, even when the list leaves them out', async () => {
    const reply = await createRouter([]).ask({ text: 'lighter today' }, ctx());
    expect(reply.source).toBe('rules');
    expect(reply.proposal?.action).toBe('lighter');
  });

  it('asks the first available brain in order, whatever order they were registered in', async () => {
    const apple = fake('apple');
    const claude = fake('claude');
    const reply = await createRouter([rulesBrain, claude, apple]).ask({ text: 'hi' }, ctx());
    expect(reply.source).toBe('apple');
    expect(reply.reply).toBe('apple says hi');
    expect(claude.asked).toHaveLength(0);
  });

  it('skips an unavailable brain, with its reason in a one-line note', async () => {
    const apple = fake('apple', { available: false, reason: 'Apple Intelligence is off' });
    const reply = await createRouter([apple, rulesBrain]).ask({ text: 'lighter today' }, ctx());
    expect(apple.asked).toHaveLength(0);
    expect(reply.source).toBe('rules');
    expect(reply.proposal?.action).toBe('lighter');
    expect(reply.note).toBe('Answered by quick replies: Apple Intelligence is off.');
  });

  it('gives a default reason when an unavailable brain gives none, and when status() throws', async () => {
    const apple = fake('apple', { available: false });
    const claude = fake('claude', { statusThrows: true });
    const reply = await createRouter([apple, claude]).ask({ text: 'hi' }, ctx());
    expect(reply.source).toBe('rules');
    expect(reply.note).toBe(
      "Answered by quick replies: Apple Intelligence isn't available; Claude isn't available.",
    );
  });

  it('falls to the next brain when one fails, with a note, and the reply keeps its source', async () => {
    const apple = fake('apple', { answer: () => Promise.reject(new Error('model crashed')) });
    const claude = fake('claude');
    const reply = await createRouter([apple, claude, rulesBrain]).ask({ text: 'hi' }, ctx());
    expect(apple.asked).toHaveLength(1);
    expect(reply.source).toBe('claude');
    expect(reply.reply).toBe('claude says hi');
    expect(reply.note).toBe("Answered by Claude: Apple Intelligence didn't answer.");
  });

  it('a failing brain → rules + note; never throws', async () => {
    const apple = fake('apple', { answer: () => Promise.reject(new Error('boom')) });
    const reply = await createRouter([apple, rulesBrain]).ask({ text: 'lighter today' }, ctx());
    expect(reply.source).toBe('rules');
    expect(reply.proposal?.action).toBe('lighter');
    expect(reply.note).toBe("Answered by quick replies: Apple Intelligence didn't answer.");
  });

  it('treats a brain that throws synchronously or returns an empty reply as failed', async () => {
    const apple: CoachBrain = {
      id: 'apple',
      status: () => Promise.resolve({ available: true }),
      ask: () => {
        throw new Error('sync boom');
      },
    };
    const claude = fake('claude', {
      answer: () =>
        Promise.resolve({ reply: '  ', chips: [], safety: 'none', intent: 'help', source: 'claude' }),
    });
    const reply = await createRouter([apple, claude]).ask({ text: 'hi' }, ctx());
    expect(reply.source).toBe('rules');
    expect(reply.note).toBe(
      "Answered by quick replies: Apple Intelligence didn't answer; Claude didn't answer.",
    );
  });

  it('times out a brain that hangs and moves on', async () => {
    vi.useFakeTimers();
    const apple = fake('apple', { answer: () => new Promise(() => {}) });
    const p = createRouter([apple], { askTimeoutMs: 1000 }).ask({ text: 'hi' }, ctx());
    await vi.advanceTimersByTimeAsync(1001);
    const reply = await p;
    expect(reply.source).toBe('rules');
    expect(reply.note).toBe('Answered by quick replies: Apple Intelligence took too long.');
  });

  it('times out a status check that hangs', async () => {
    vi.useFakeTimers();
    const apple = fake('apple', { statusHangs: true });
    const p = createRouter([apple], { statusTimeoutMs: 500 }).ask({ text: 'hi' }, ctx());
    await vi.advanceTimersByTimeAsync(501);
    const reply = await p;
    expect(apple.asked).toHaveLength(0);
    expect(reply.source).toBe('rules');
    expect(reply.note).toBe("Answered by quick replies: Apple Intelligence isn't available.");
  });

  it('stamps the answering brain as source, whatever the brain claimed', async () => {
    const apple = fake('apple', {
      answer: () =>
        Promise.resolve({ reply: 'ok', chips: [], safety: 'none', intent: 'help', source: 'claude' }),
    });
    const reply = await createRouter([apple]).ask({ text: 'hi' }, ctx());
    expect(reply.source).toBe('apple');
  });

  it('keeps usedHealth from Apple’s reply but never on a Claude reply', async () => {
    const reply = (id: BrainSource) => () =>
      Promise.resolve({
        reply: 'ok',
        chips: [],
        safety: 'none' as const,
        intent: 'help' as const,
        source: id,
        usedHealth: true,
      });
    const a = await createRouter([fake('apple', { answer: reply('apple') })]).ask(
      { text: 'hi' },
      ctx(),
    );
    expect(a.usedHealth).toBe(true);
    const c = await createRouter([fake('claude', { answer: reply('claude') })]).ask(
      { text: 'hi' },
      ctx(),
    );
    expect(c.usedHealth).toBeUndefined();
  });

  it('never throws even when the rules themselves throw: a help reply with chips', async () => {
    const bad = { ...coach, state: undefined } as unknown as CoachContext;
    const router = createRouter([]);
    for (const input of [{ text: 'lighter today' }, { chip: 'lighter' as const }]) {
      const reply = await router.ask(input, { coach: bad, turns: [] });
      expect(reply.reply.length).toBeGreaterThan(0);
      expect(reply.chips.length).toBeGreaterThan(0);
      expect(reply.intent).toBe('help');
      expect(reply.source).toBe('chip' in input ? 'chip' : 'rules');
    }
  });

  it('the help fallback mid-workout offers only the workout chips', async () => {
    const bad = { ...coach, phase: 'workout', state: undefined } as unknown as CoachContext;
    const reply = await createRouter([]).ask({ text: 'x' }, { coach: bad, turns: [] });
    expect(reply.chips.map((c) => c.id)).toEqual(['easyOn', 'lighter', 'swap']);
  });
});

describe('turn selection (Health never reaches Claude)', () => {
  const turns = [
    turn(1),
    turn(2, { usedHealth: true }),
    turn(3),
    turn(4, { usedHealth: true }),
    ...Array.from({ length: 9 }, (_, i) => turn(5 + i)),
  ];

  it('keeps the last 8 turns for Apple and the rules, Health turns included', () => {
    expect(MAX_TURNS).toBe(8);
    const few = [turn(1), turn(2, { usedHealth: true })];
    expect(turnsFor('apple', few)).toEqual(few);
    expect(turnsFor('apple', turns).map((t) => t.id)).toEqual([6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('drops every usedHealth turn for Claude before taking the last 8', () => {
    const got = turnsFor('claude', [turn(1), turn(2, { usedHealth: true }), turn(3)]);
    expect(got.map((t) => t.id)).toEqual([1, 3]);
    expect(turnsFor('claude', turns).every((t) => t.usedHealth !== true)).toBe(true);
  });

  it('the router never sends Claude a usedHealth turn (request check)', async () => {
    const claude = fake('claude');
    const apple = fake('apple');
    await createRouter([claude]).ask({ text: 'hi' }, ctx(turns));
    await createRouter([apple]).ask({ text: 'hi' }, ctx(turns));
    const sent = claude.asked[0]?.ctx;
    expect(sent?.turns.length).toBeGreaterThan(0);
    expect(sent?.turns.some((t) => t.usedHealth)).toBe(false);
    expect(JSON.stringify(sent?.turns)).not.toMatch(/made-up turn (2|4)"/);
    expect(apple.asked[0]?.ctx.turns).toHaveLength(8);
  });

  it('strips Health / readiness fields from the coach context sent to Claude', async () => {
    const claude = fake('claude');
    const withHealth = {
      ...coach,
      health: { sleepMin: 400 },
      readiness: { signals: ['sleepShort'] },
    } as unknown as CoachContext;
    await createRouter([claude]).ask({ text: 'hi' }, { coach: withHealth, turns: [] });
    const sent = claude.asked[0]?.ctx.coach as unknown as Record<string, unknown>;
    expect(sent.health).toBeUndefined();
    expect(sent.readiness).toBeUndefined();
    expect(sent.today).toBe(coach.today);
  });

  it('after Apple fails, Claude still gets only the Health-free turns', async () => {
    const apple = fake('apple', { answer: () => Promise.reject(new Error('x')) });
    const claude = fake('claude');
    const short = [turn(1), turn(2, { usedHealth: true }), turn(3)];
    await createRouter([apple, claude]).ask({ text: 'hi' }, ctx(short));
    expect(apple.asked[0]?.ctx.turns.some((t) => t.usedHealth)).toBe(true);
    expect(claude.asked[0]?.ctx.turns.map((t) => t.id)).toEqual([1, 3]);
    expect(claude.asked[0]?.ctx.turns.some((t) => t.usedHealth)).toBe(false);
  });
});

describe('router status (Settings line)', () => {
  it('slice 1: quick replies answer', async () => {
    const s = await createRouter([rulesBrain]).status();
    expect(s).toEqual({
      answering: 'rules',
      line: 'Quick replies answer your messages.',
      brains: [{ id: 'rules', label: 'Quick replies', available: true }],
    });
  });

  it('lists each brain in order with its reason, and who answers', async () => {
    const apple = fake('apple', { available: false, reason: 'Apple Intelligence is off' });
    const claude = fake('claude', { available: false, reason: 'Claude is off in Settings' });
    const s = await createRouter([claude, apple]).status();
    expect(s.answering).toBe('rules');
    expect(s.brains).toEqual([
      { id: 'apple', label: 'Apple Intelligence', available: false, reason: 'Apple Intelligence is off' },
      { id: 'claude', label: 'Claude', available: false, reason: 'Claude is off in Settings' },
      { id: 'rules', label: 'Quick replies', available: true },
    ]);
    expect(s.line).toBe('Quick replies answer your messages: Apple Intelligence is off.');
  });

  it('names the model when one is available', async () => {
    const s = await createRouter([fake('apple'), fake('claude')]).status();
    expect(s.answering).toBe('apple');
    expect(s.line).toBe('Apple Intelligence answers your messages.');
  });

  it('every status line and note passes the copy check', async () => {
    const lines = [
      (await createRouter([]).status()).line,
      (await createRouter([fake('claude')]).status()).line,
      (await createRouter([fake('apple', { available: false })]).status()).line,
      (await createRouter([fake('apple', { statusThrows: true })]).ask({ text: 'hi' }, ctx())).note,
    ];
    for (const l of lines) expect(checkCopy(l ?? '').ok).toBe(true);
  });
});
