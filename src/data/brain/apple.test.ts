import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import programJson from '../program.json';
import facts from '../../core/trainer/evals/facts.json';
import { trainerCatalog } from '../../core/testkit/trainerCatalog';
import {
  factsInput,
  readToolResults,
  type FactsScenario,
} from '../../core/trainer/brain/readTools';
import { serializeContext, type BrainInput } from '../../core/trainer/brain/context';
import { brainInstructions } from '../../core/trainer/brain/instructions';
import { SAFE_LINE } from '../../core/trainer/brain/sanitize';
import { RED_FLAG_LINE, REFERRAL_LINE, checkCopy } from '../../core/trainer/replies';
import { MID_WORKOUT_REASON } from '../../core/trainer/tools';
import { HELP_TEXT } from '../../core/trainer/replies';
import { MID_SESSION_REPLY, handle } from '../../core/trainer/coach';
import { effectiveDay } from '../../core/trainer/plan';
import { cueFor, howToFor } from '../catalog';
import type {
  BrainContext,
  BrainErrorCode,
  BrainUnavailableReason,
  ChatMessage,
  Food,
  GymBrainRequest,
  GymBrainResponse,
  Program,
} from '../../core/types';
import {
  COULDNT_DO,
  TRY_THESE,
  MESSAGE_MAX_CHARS,
  appleBrain,
  askApple,
  capMessage,
  type AppleExtras,
  type GymBrainBridge,
} from './apple';
import { BrainError, UNAVAILABLE_COPY } from './notes';

// Made-up scenario (evals/facts.json): the default program, no personal data.
const base: BrainInput = factsInput(
  facts.scenario as FactsScenario,
  programJson as Program,
  trainerCatalog(),
);
const coach = base.coach;
const ctx = (turns: ChatMessage[] = [], over: Partial<typeof coach> = {}): BrainContext => ({
  coach: { ...coach, ...over },
  turns,
});

const turn = (i: number, text: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: i,
  createdAt: 1000 + i,
  role: i % 2 ? 'coach' : 'user',
  text,
  source: 'rules',
  phase: 'today',
  ...over,
});

type FakeBridge = GymBrainBridge & { reqs: GymBrainRequest[] };

function bridge(
  respond: (req: GymBrainRequest) => Promise<GymBrainResponse> = () =>
    Promise.resolve({ text: 'Rows today, keep the elbows close.', toolCalls: [], latencyMs: 900 }),
  avail: () => Promise<
    { available: true } | { available: false; reason: BrainUnavailableReason }
  > = () => Promise.resolve({ available: true }),
): FakeBridge {
  const b: FakeBridge = {
    reqs: [],
    availability: avail,
    respond: (req) => {
      b.reqs.push(req);
      return respond(req);
    },
  };
  return b;
}

const says = (text: string, toolCalls: GymBrainResponse['toolCalls'] = [], latencyMs = 1200) =>
  bridge(() => Promise.resolve({ text, toolCalls, latencyMs }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('appleBrain.status (availability → reason)', () => {
  it('available', async () => {
    expect(await appleBrain(bridge()).status()).toEqual({ available: true });
  });

  const reasons: BrainUnavailableReason[] = [
    'deviceNotEligible',
    'appleIntelligenceNotEnabled',
    'modelNotReady',
    'unsupported',
    'notNative',
  ];
  for (const r of reasons)
    it(`${r} → unavailable with its status text and id`, async () => {
      const b = bridge(undefined, () => Promise.resolve({ available: false, reason: r }));
      expect(await appleBrain(b).status()).toEqual({
        available: false,
        reason: UNAVAILABLE_COPY[r].status,
        reasonId: r,
      });
    });

  it('a junk availability answer is unavailable with no reason id (nothing to remember)', async () => {
    for (const junk of [null, {}, { available: 'yes' }, { available: false, reason: 'nope' }]) {
      const b = bridge(undefined, () => Promise.resolve(junk as never));
      const s = await appleBrain(b).status();
      expect(s).toEqual({ available: false, reason: "Apple Intelligence isn't available" });
    }
  });

  it('has id apple', () => {
    expect(appleBrain(bridge()).id).toBe('apple');
  });
});

describe('the request (instructions, context, one message, read results)', () => {
  it('sends the instructions, the context, only the new message, and the read results', async () => {
    const b = bridge();
    const turns = [turn(0, 'made-up question about rows'), turn(1, 'made-up answer about rows')];
    await appleBrain(b).ask('Any thoughts on staying motivated?', ctx(turns));
    const req = b.reqs[0] as GymBrainRequest;
    expect(req.instructions).toBe(brainInstructions({ phase: 'today', voice: 'calm' }));
    const input: BrainInput = { coach, turns, howTo: howToFor, cue: cueFor };
    expect(req.context).toBe(serializeContext(input, { brain: 'apple' }).text);
    expect(req.context).toContain('User: made-up question about rows');
    expect(req.messages).toEqual([{ role: 'user', text: 'Any thoughts on staying motivated?' }]);
    expect(req.toolResults).toEqual(readToolResults(input));
  });

  it('drops a last turn that is this same user message (the app may have saved it first)', async () => {
    const b = bridge();
    const turns = [turn(1, 'made-up coach line'), turn(2, 'Is today heavy?')];
    await appleBrain(b).ask('Is today heavy?', ctx(turns));
    expect(b.reqs[0]?.context).not.toContain('User: Is today heavy?');
    expect(b.reqs[0]?.context).toContain('Coach: made-up coach line');
  });

  it('caps the message at ~400 characters on a word boundary', async () => {
    const long = 'word '.repeat(200);
    expect(capMessage(long).length).toBeLessThanOrEqual(MESSAGE_MAX_CHARS);
    expect(capMessage(long).endsWith('…')).toBe(true);
    expect(capMessage('  short one  ')).toBe('short one');
    const b = bridge();
    await appleBrain(b).ask(long, ctx());
    expect(b.reqs[0]?.messages).toHaveLength(1);
    expect(b.reqs[0]?.messages[0]?.text.length).toBeLessThanOrEqual(MESSAGE_MAX_CHARS);
  });

  it('uses the workout phase and the drill voice from the extras', async () => {
    const b = bridge();
    await appleBrain(b, { extras: () => ({ voice: 'drill' }) }).ask(
      'any words for the last sets?',
      ctx([], { phase: 'workout' }),
    );
    expect(b.reqs[0]?.instructions).toBe(brainInstructions({ phase: 'workout', voice: 'drill' }));
  });

  it('passes goal fields from the extras into the context', async () => {
    const b = bridge();
    await appleBrain(b, {
      extras: () => ({ goalKind: 'muscle', goalText: 'made-up goal words' }),
    }).ask('how am I doing', ctx());
    expect(b.reqs[0]?.context).toContain('Goal: build muscle: made-up goal words.');
  });
});

describe('Lighter today? reasons (appleCardReasons, read at runtime)', () => {
  const card = { signals: ['sleepShort' as const], reasons: ['made-up reason 6 h'] };

  it('includes reasons and sets usedHealth when appleCardReasons is true or unset', async () => {
    for (const appleCardReasons of [true, undefined]) {
      const b = says('Take it a bit easier today.');
      const r = await appleBrain(b, {
        extras: () => ({
          lighterCard: card,
          ...(appleCardReasons !== undefined && { appleCardReasons }),
        }),
      }).ask('how do I look today?', ctx());
      expect(b.reqs[0]?.context).toContain('Sleep was shorter than usual.');
      expect(r.usedHealth).toBe(true);
    }
  });

  it('leaves reasons out and usedHealth unset when appleCardReasons is false', async () => {
    const b = says('Take it a bit easier today.');
    const r = await appleBrain(b, {
      extras: () => ({ lighterCard: card, appleCardReasons: false }),
    }).ask('how do I look today?', ctx());
    expect(b.reqs[0]?.context).not.toContain('Sleep was shorter');
    expect(r).not.toHaveProperty('usedHealth');
  });

  it('no card → no usedHealth', async () => {
    const r = await appleBrain(says('Fine.')).ask('should I go light?', ctx());
    expect(r).not.toHaveProperty('usedHealth');
  });

  it('reads the extras on every ask, so a changed decision changes the next answer', async () => {
    let extras: AppleExtras = { lighterCard: card, appleCardReasons: true };
    const b = says('Okay.');
    const brain = appleBrain(b, { extras: () => Promise.resolve(extras) });
    expect((await brain.ask('light?', ctx())).usedHealth).toBe(true);
    extras = { lighterCard: card, appleCardReasons: false };
    expect(await brain.ask('light?', ctx())).not.toHaveProperty('usedHealth');
    expect(b.reqs[1]?.context).not.toContain('Sleep was shorter');
  });
});

describe('the reply (sanitize always, tool calls → proposals)', () => {
  it('a plain answer: sanitized text, source apple, no proposal, spoken line from it', async () => {
    const r = await appleBrain(
      says('Rows today. Keep your elbows close and pause at the top.'),
    ).ask('any thoughts on pacing?', ctx());
    expect(r.source).toBe('apple');
    expect(r.reply).toBe('Rows today. Keep your elbows close and pause at the top.');
    expect(r.proposal).toBeUndefined();
    expect(r.chips).toEqual([]);
    expect(r.safety).toBe('none');
    expect(r.say).toBe('Rows today.');
  });

  it('replaces a reply with medical words by the safe line', async () => {
    const r = await appleBrain(says('That sounds like tendinitis, ice it for a week.')).ask(
      'my elbow feels odd after curls',
      ctx(),
    );
    expect(r.reply).not.toMatch(/tendinitis|ice/i);
    expect(r.reply).toContain(SAFE_LINE);
  });

  it('adds the referral line first on discomfort', async () => {
    const r = await appleBrain(says('Go easy on arms today.')).ask(
      'my shoulder hurts a bit',
      ctx(),
    );
    expect(r.safety).toBe('discomfort');
    expect(r.reply.startsWith(REFERRAL_LINE)).toBe(true);
  });

  it('caps a long reply at 4 sentences and turns exercise ids into names', async () => {
    const r = await appleBrain(
      says('One. Two. Three. Four. Five. Do Dumbbell_Bench_Press first.'),
    ).ask('what now?', ctx());
    expect(r.reply).toBe('One. Two. Three. Four.');
    const r2 = await appleBrain(says('Do Dumbbell_Bench_Press first.')).ask('what now?', ctx());
    expect(r2.reply).toBe('Do Dumbbell Bench Press first.');
  });

  it('a red flag never reaches the model: the rules answer with only the red-flag line', async () => {
    const b = says('Just push through it.');
    const r = await appleBrain(b).ask('I have chest pain and feel dizzy', ctx());
    expect(b.reqs).toHaveLength(0);
    expect(r.safety).toBe('redFlag');
    expect(r.reply).toBe(RED_FLAG_LINE);
    expect(r.proposal).toBeUndefined();
  });

  it('a valid tool call → the Proposal (never a state), with the model text', async () => {
    const r = await appleBrain(
      says("Let's make today lighter.", [{ name: 'lighterToday', args: {} }]),
    ).ask('made-up open question', ctx());
    expect(r.proposal?.action).toBe('lighter');
    expect(r.intent).toBe('lighter');
    expect(r.reply).toBe("Let's make today lighter.");
    expect(r).not.toHaveProperty('state');
  });

  it('a tool call with no text uses the tool reply', async () => {
    const r = await appleBrain(says('', [{ name: 'avoidBodyArea', args: { area: 'chest' } }])).ask(
      'made-up open question',
      ctx(),
    );
    expect(r.proposal?.action).toBe('avoidArea');
    expect(r.reply).toBe("Here's what I'd change.");
  });

  it('suggestFood gives food ideas (no proposal)', async () => {
    const shake: Food = {
      id: 'made-up-shake',
      name: 'Made-up shake',
      source: 'custom',
      basis: { servingLabel: '1 scoop' },
      kcal: 120,
      proteinG: 24,
    };
    const fuel = {
      ...(coach.fuel as NonNullable<typeof coach.fuel>),
      favorites: [{ id: 'fav', ref: { foodId: shake.id }, amount: { servings: 1 }, createdAt: 1 }],
      foods: [shake],
    };
    const r = await appleBrain(says('Some ideas.', [{ name: 'suggestFood', args: {} }])).ask(
      'made-up open question',
      ctx([], { fuel }),
    );
    expect(r.intent).toBe('food');
    expect(r.proposal).toBeUndefined();
    expect(r.foods?.map((f) => f.label)).toContain('Made-up shake');
  });

  it('an action refusal → its plain reason + "Try one of these:" + quick chips', async () => {
    const r = await appleBrain(
      says('Swapped it.', [{ name: 'swapExercise', args: { exerciseId: 'Made_Up_Lift' } }]),
    ).ask('made-up open question', ctx());
    expect(r.reply).toBe(`I don't know that exercise. ${TRY_THESE}`);
    expect(r.reply).not.toContain('Swapped it');
    expect(r.proposal).toBeUndefined();
    expect(r.chips.length).toBeGreaterThan(0);
    expect(r.intent).toBe('help');
  });

  // Checkpoint J: "Yes goahead" → "I couldn't do that. Bad told." (postponeSession { to: 'banana'-like }).
  it('an invalid call never shows the validation reason; the chips lead with the closest options', async () => {
    const out = await askApple(
      says('On it.', [{ name: 'postponeSession', args: { to: 'next push day' } }]),
      'yes go ahead',
      ctx(),
    );
    expect(out.reply.reply).toBe(`${COULDNT_DO} ${TRY_THESE}`);
    expect(out.reply.reply).not.toMatch(/bad|argument|\bto\b\./i);
    expect(out.reply.chips.slice(0, 2).map((c) => c.id)).toEqual(['doToday', 'notToday']);
    expect(new Set(out.reply.chips.map((c) => c.id)).size).toBe(out.reply.chips.length);
    expect(out.trace.calls).toEqual([
      { name: 'postponeSession', ok: false, fail: 'invalidArgs', arg: 'to' },
    ]);
    const unknown = await askApple(says('', [{ name: 'deleteEverything', args: {} }]), 'x', ctx());
    expect(unknown.reply.reply).toBe(`${COULDNT_DO} ${TRY_THESE}`);
    expect(unknown.trace.calls).toEqual([
      { name: 'deleteEverything', ok: false, fail: 'unknownTool' },
    ]);
  });

  it('the trace keeps only an id-shaped arg name', async () => {
    const out = await askApple(
      says('', [{ name: 'lighterToday', args: { 'how many sets?': 1 } }]),
      'x',
      ctx(),
    );
    expect(out.trace.calls).toEqual([
      { name: 'lighterToday', ok: false, fail: 'invalidArgs', arg: '?' },
    ]);
  });

  it('"do push today" through doDayToday or postponeSession { to: today } → a doToday card', async () => {
    const today = coach.today;
    const current = effectiveDay(coach.state, coach.sessions, today).day?.id;
    const other = coach.state.plan.days.find((d) => d.id !== current);
    if (!other) throw new Error('no other day');
    for (const call of [
      { name: 'doDayToday', args: { day: other.name } },
      { name: 'postponeSession', args: { from: other.id, to: 'today' } },
    ]) {
      // Open-chat wording: "do <day> today" itself goes to the rules (route.ts).
      const r = await appleBrain(says('', [call])).ask('made-up open question', ctx());
      expect(r.source).toBe('apple');
      expect(r.proposal?.action, call.name).toBe('doToday');
      expect(r.proposal?.title).toBe(`Do ${other.name} today`);
      expect(r.intent).toBe('doToday');
    }
  });

  it('mid-workout a call that is not allowed says so, with only the workout chips', async () => {
    const r = await appleBrain(says('', [{ name: 'deloadWeek', args: {} }])).ask(
      'made-up open question',
      ctx([], { phase: 'workout' }),
    );
    expect(r.reply).toBe(`${MID_WORKOUT_REASON} ${TRY_THESE}`);
    expect(r.chips.map((c) => c.id)).toEqual(['easyOn', 'lighter', 'swap']);
  });

  it('two tool calls → the first as the proposal, the second as a chip', async () => {
    const r = await appleBrain(
      says('Two ideas.', [
        { name: 'lighterToday', args: {} },
        { name: 'avoidBodyArea', args: { area: 'chest' } },
      ]),
    ).ask('made-up open question', ctx());
    expect(r.proposal?.action).toBe('lighter');
    expect(r.chips).toEqual([{ id: 'chest', label: 'Go easy on chest' }]);
  });

  it('a second plateau call is a chip worded "plateau", never "stalled" (M13)', async () => {
    const r = await appleBrain(
      says('Two ideas.', [
        { name: 'lighterToday', args: {} },
        { name: 'adjustStalledExercise', args: {} },
      ]),
    ).ask('made-up open question', ctx());
    expect(r.proposal?.action).toBe('lighter');
    const labels = r.chips.map((c) => c.label);
    expect(labels).toEqual(['Get past a plateau']);
  });

  it('a second call that fails validation is not offered', async () => {
    const r = await appleBrain(
      says('Two ideas.', [
        { name: 'lighterToday', args: {} },
        { name: 'swapExercise', args: { exerciseId: 'Nope_Nope' } },
      ]),
    ).ask('x', ctx());
    expect(r.proposal?.action).toBe('lighter');
    expect(r.chips).toEqual([]);
  });

  it('read-only tool calls are ignored (the results were passed in)', async () => {
    const r = await appleBrain(says('You did 2 of 6.', [{ name: 'weekSummary', args: {} }])).ask(
      'How am I doing?',
      ctx(),
    );
    expect(r.proposal).toBeUndefined();
    expect(r.reply).toBe('You did 2 of 6.');
  });

  it('every reply passes the copy check', async () => {
    const cases: [string, GymBrainResponse['toolCalls']][] = [
      ['Fine.', []],
      ['', [{ name: 'swapExercise', args: { exerciseId: 'Nope' } }]],
      ['We could rest it for two weeks and take ibuprofen.', []],
    ];
    for (const [text, calls] of cases) {
      const r = await appleBrain(says(text, calls)).ask('anything', ctx());
      expect(checkCopy(r.reply).ok, r.reply).toBe(true);
    }
  });
});

describe('errors (code convention)', () => {
  const codes: BrainErrorCode[] = [
    'guardrail',
    'contextTooLong',
    'unsupportedLanguage',
    'timeout',
    'other',
  ];
  for (const code of codes)
    it(`a rejection with code ${code} → BrainError(${code})`, async () => {
      const b = bridge(() => Promise.reject(Object.assign(new Error('native'), { code })));
      await expect(appleBrain(b).ask('hi', ctx())).rejects.toMatchObject({ code });
      await expect(appleBrain(b).ask('hi', ctx())).rejects.toBeInstanceOf(BrainError);
    });

  it('a rejection without a known code → other', async () => {
    const b = bridge(() => Promise.reject(new Error('boom')));
    await expect(appleBrain(b).ask('hi', ctx())).rejects.toMatchObject({ code: 'other' });
  });

  it('a junk or empty response → other', async () => {
    for (const junk of [
      null,
      { text: 3, toolCalls: [] },
      { text: '', toolCalls: [] },
      { text: '   ', toolCalls: 'x' },
    ]) {
      const b = bridge(() => Promise.resolve(junk as never));
      await expect(appleBrain(b).ask('hi', ctx())).rejects.toMatchObject({ code: 'other' });
    }
  });

  it('a respond that throws synchronously → other', async () => {
    const b: GymBrainBridge = {
      availability: () => Promise.resolve({ available: true }),
      respond: () => {
        throw new Error('sync');
      },
    };
    await expect(appleBrain(b).ask('hi', ctx())).rejects.toMatchObject({ code: 'other' });
  });
});

describe('trace (dev log / eval: ids and numbers only)', () => {
  it('reports latency, the calls and the action, no text', async () => {
    const out = await askApple(
      says(
        'Lighter it is.',
        [
          { name: 'lighterToday', args: {} },
          { name: 'nope', args: {} },
        ],
        1234,
      ),
      'made-up open question',
      ctx(),
    );
    expect(out.trace).toEqual({
      latencyMs: 1234,
      action: 'lighterToday',
      calls: [
        { name: 'lighterToday', ok: true },
        { name: 'nope', ok: false, fail: 'unknownTool' },
      ],
      replaced: false,
      hits: [],
      usedHealth: false,
      redFlag: false,
      route: 'model',
    });
    expect(out.call).toEqual({ name: 'lighterToday', args: {} });
  });

  it('marks a replaced reply and a red flag', async () => {
    const a = await askApple(says('Ice it.'), 'hi', ctx());
    expect(a.trace.replaced).toBe(true);
    expect(a.trace.action).toBe('none');
    const b = await askApple(says('x'), 'I have chest pain and feel dizzy', ctx());
    expect(b.trace.redFlag).toBe(true);
    expect(b.trace.latencyMs).toBe(0);
  });
});

describe('no network', () => {
  it('never calls fetch', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('no network allowed');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const brain = appleBrain(says('Fine.', [{ name: 'lighterToday', args: {} }]));
    await brain.status();
    await brain.ask('go lighter', ctx());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no brain file mentions fetch, XMLHttpRequest, WebSocket or sendBeacon', () => {
    for (const f of ['apple.ts', 'router.ts', 'notes.ts', 'evalRunner.ts']) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
    }
  });
});

// 1.15.2 "Coach acts": what the rules read as a change never waits on the model.
describe('rules route (brain/route.ts)', () => {
  it('a change request → the rules proposal, no model call, source rules', async () => {
    const b = says('Model words.', [{ name: 'suggestFood', args: {} }]);
    const out = await askApple(b, 'go lighter today', ctx());
    expect(b.reqs).toHaveLength(0);
    const rules = handle({ text: 'go lighter today' }, coach);
    expect(out.reply.source).toBe('rules');
    expect(out.reply.proposal).toEqual(rules.proposal);
    expect(out.reply.reply).toBe(rules.reply);
    expect(out.reply.intent).toBe('lighter');
    expect(out.call).toEqual({ name: 'lighterToday', args: {} });
    expect(out.trace).toEqual({
      latencyMs: 0,
      action: 'lighterToday',
      calls: [],
      replaced: false,
      hits: [],
      usedHealth: false,
      redFlag: false,
      route: 'rules',
      why: 'action',
    });
  });

  it('keeps the rules chips, clarifying questions and spoken line', async () => {
    const b = bridge();
    const out = await askApple(b, 'swap an exercise', ctx());
    expect(b.reqs).toHaveLength(0);
    const rules = handle({ text: 'swap an exercise' }, coach);
    expect(out.reply.reply).toBe(rules.reply);
    expect(out.reply.chips).toEqual(rules.chips);
    expect(out.reply.say).toBeDefined();
  });

  it('a doToday request carries the day as the call arg', async () => {
    const out = await askApple(bridge(), 'do push b today', ctx());
    expect(out.call).toEqual({ name: 'doDayToday', args: { day: 'Push B' } });
    expect(out.reply.proposal?.action).toBe('doToday');
  });

  it('discomfort: the referral line first, once', async () => {
    const out = await askApple(bridge(), 'my knee hurts, go easy on legs', ctx());
    expect(out.trace.route).toBe('rules');
    expect(out.reply.reply.startsWith(REFERRAL_LINE)).toBe(true);
    expect(out.reply.reply.indexOf(REFERRAL_LINE, 1)).toBe(-1);
    expect(out.reply.safety).toBe('discomfort');
  });

  it('mid-workout the rules block what is not allowed (no proposal)', async () => {
    const b = bridge();
    const out = await askApple(b, 'deload this week', ctx([], { phase: 'workout' }));
    expect(b.reqs).toHaveLength(0);
    expect(out.reply.reply).toBe(MID_SESSION_REPLY);
    expect(out.reply.proposal).toBeUndefined();
  });

  it('empty text never reaches the model (phone eval req-073)', async () => {
    const b = bridge();
    const out = await askApple(b, '   ', ctx());
    expect(b.reqs).toHaveLength(0);
    expect(out.reply.reply).toBe(HELP_TEXT);
    expect(out.trace).toMatchObject({ route: 'rules', why: 'empty', action: 'none' });
    expect(out).not.toHaveProperty('call');
  });

  it('Thai never reaches the model: the rules answer in English', async () => {
    const b = bridge();
    const out = await askApple(b, 'งดวันนี้นะ', ctx());
    expect(b.reqs).toHaveLength(0);
    expect(out.trace).toMatchObject({ route: 'rules', why: 'thai', action: 'postponeSession' });
    expect(out.call?.name).toBe('postponeSession');
    expect(checkCopy(out.reply.reply).ok).toBe(true);
    const hi = await askApple(b, 'สวัสดี', ctx());
    expect(b.reqs).toHaveLength(0);
    expect(hi.reply.reply).toBe(HELP_TEXT);
  });

  it('a red flag: route rules, why redFlag, still the red-flag line only', async () => {
    const b = bridge();
    const out = await askApple(b, 'I have chest pain and feel dizzy', ctx());
    expect(b.reqs).toHaveLength(0);
    expect(out.trace).toMatchObject({ route: 'rules', why: 'redFlag', redFlag: true });
    expect(out.reply.reply).toBe(RED_FLAG_LINE);
    expect(out).not.toHaveProperty('call');
  });

  it('open chat goes to the model with trace.route model', async () => {
    const b = bridge();
    const out = await askApple(b, 'Any thoughts on staying motivated?', ctx());
    expect(b.reqs).toHaveLength(1);
    expect(out.trace.route).toBe('model');
    expect(out.trace).not.toHaveProperty('why');
    expect(out.reply.source).toBe('apple');
  });
});

// 1.16.2 "Coach facts": own-number questions are answered in code from saved data.
describe('facts route (brain/facts.ts)', () => {
  const extras = (): AppleExtras => ({
    ...(base.goalKind && { goalKind: base.goalKind }),
    ...(base.goalText && { goalText: base.goalText }),
    ...(base.goals && { goals: base.goals }),
  });

  it('answers from saved data: no model call, source rules, latency 0, no tool call', async () => {
    const b = says('You have 1,000 kcal left.', [{ name: 'suggestFood', args: {} }]);
    const out = await askApple(b, 'How many calories do I have left today?', ctx());
    expect(b.reqs).toHaveLength(0);
    expect(out.reply.reply).toBe('You have 950 kcal left today (1450 of 2400 kcal).');
    expect(out.reply.source).toBe('rules');
    expect(out.reply.proposal).toBeUndefined();
    expect(out.reply.foods).toBeUndefined();
    expect(out).not.toHaveProperty('call');
    expect(out.trace).toEqual({
      latencyMs: 0,
      action: 'none',
      calls: [],
      replaced: false,
      hits: [],
      usedHealth: false,
      redFlag: false,
      route: 'rules',
      why: 'facts',
    });
  });

  it('reads goals and cues the way the model request does (extras, howTo, cue)', async () => {
    const b = bridge();
    const goal = await askApple(b, 'How close am I to my bench goal?', ctx(), { extras });
    expect(goal.reply.reply).toBe('Dumbbell bench 30 kg for 5: 33% of the way, on track.');
    const tip = await askApple(b, 'Any tip for the one-arm dumbbell row?', ctx(), {
      cue: () => 'Made-up cue, elbow in.',
    });
    expect(tip.reply.reply).toBe('One-Arm Dumbbell Row: Made-up cue, elbow in.');
    expect(b.reqs).toHaveLength(0);
  });

  it('no data → the model answers, as before (trace route model)', async () => {
    const b = bridge();
    const out = await askApple(b, 'How close am I to my bench goal?', ctx());
    expect(b.reqs).toHaveLength(1);
    expect(out.trace.route).toBe('model');
    expect(out.reply.source).toBe('apple');
  });

  it('the trace holds ids only, never the answer text', async () => {
    const out = await askApple(bridge(), 'What did I goblet squat last time?', ctx());
    expect(out.reply.reply).toContain('24 kg for 12 reps');
    expect(JSON.stringify(out.trace)).not.toMatch(/Goblet|24 kg/);
  });

  it('mid-workout "what is next?" is the next exercise: the model answers it', async () => {
    const b = bridge();
    const out = await askApple(b, 'what is next?', ctx([], { phase: 'workout' }));
    expect(b.reqs).toHaveLength(1);
    expect(out.trace.route).toBe('model');
  });

  it('speaks the first sentence, short (sayFor)', async () => {
    const out = await askApple(bridge(), "What's my next workout?", ctx());
    expect(out.reply.say).toBe('Your next workout is Push A, today.');
  });
});

describe('context window (1.15.2 lever 3)', () => {
  it('reads windowTokens on every ask; 8,192 tokens → the bigger context budget', async () => {
    let win: number | undefined = undefined;
    const turns = Array.from({ length: 12 }, (_, i) =>
      turn(
        i,
        `made-up turn ${i} about training and how the week went, padded with words to fill space and more.`,
      ),
    );
    const b = bridge();
    const brain = appleBrain(b, { windowTokens: () => win });
    await brain.ask('Any thoughts on staying motivated?', ctx(turns));
    win = 8192;
    await brain.ask('Any thoughts on staying motivated?', ctx(turns));
    const input: BrainInput = { coach, turns, howTo: howToFor, cue: cueFor };
    expect(b.reqs[0]?.context).toBe(serializeContext(input, { brain: 'apple' }).text);
    expect(b.reqs[1]?.context).toBe(
      serializeContext(input, { brain: 'apple', windowTokens: 8192 }).text,
    );
    expect(b.reqs[1]?.context.length ?? 0).toBeGreaterThan(b.reqs[0]?.context.length ?? 0);
  });
});
