import { describe, expect, it } from 'vitest';
import { HELP_TEXT, checkCopy } from '../replies';
import {
  CLAUDE_OFFER,
  claudeOfferFor,
  claudeOfferShown,
  claudeOutcomeOf,
  type ClaudeOfferInput,
  type ClaudeOfferOutcome,
} from './offer';

const TODAY = '2026-11-18';
const base = (over: Partial<ClaudeOfferInput> = {}): ClaudeOfferInput => ({
  outcome: 'helpFallback',
  claudeWanted: undefined,
  offer: undefined,
  today: TODAY,
  phase: 'today',
  ...over,
});
const GENDERED = /\b(he|she|his|her|him|hers)\b/i;

describe('claudeOfferFor (M13c task 6c: when the explain card shows)', () => {
  for (const outcome of ['helpFallback', 'couldntDo', 'unavailable'] as const)
    it(`shows after a can't-answer outcome: ${outcome}`, () => {
      expect(claudeOfferFor(base({ outcome }))).toEqual({ show: true });
    });

  it('never after a real answer', () => {
    expect(claudeOfferFor(base({ outcome: 'answered' }))).toEqual({
      show: false,
      why: 'answered',
    });
  });

  it('never after a red flag, even when everything else would show it', () => {
    expect(claudeOfferFor(base({ outcome: 'redFlag' }))).toEqual({ show: false, why: 'redFlag' });
    expect(claudeOfferFor(base({ outcome: 'redFlag', phase: 'workout' }))).toEqual({
      show: false,
      why: 'redFlag',
    });
  });

  it('never mid-workout', () => {
    expect(claudeOfferFor(base({ phase: 'workout' }))).toEqual({
      show: false,
      why: 'midWorkout',
    });
    expect(claudeOfferFor(base({ phase: 'preview' }))).toEqual({ show: true });
  });

  it("never when the answer is 'no'; 'yes', 'later' and unanswered still see it", () => {
    expect(claudeOfferFor(base({ claudeWanted: 'no' }))).toEqual({
      show: false,
      why: 'declined',
    });
    for (const claudeWanted of ['yes', 'later', undefined] as const)
      expect(claudeOfferFor(base({ claudeWanted })), String(claudeWanted)).toEqual({
        show: true,
      });
  });

  it('once a day: not again on the day it last showed, again the next day', () => {
    const offer = claudeOfferShown(TODAY);
    expect(offer).toEqual({ lastShownDate: TODAY });
    expect(claudeOfferFor(base({ offer }))).toEqual({ show: false, why: 'shownToday' });
    expect(claudeOfferFor(base({ offer, today: '2026-11-19' }))).toEqual({ show: true });
    // A date from the future (clock change) also counts as shown: never twice in a row.
    expect(claudeOfferFor(base({ offer: { lastShownDate: '2026-11-20' } }))).toEqual({
      show: false,
      why: 'shownToday',
    });
    expect(claudeOfferFor(base({ offer: {} }))).toEqual({ show: true });
  });

  it('rejects a malformed day', () => {
    expect(() => claudeOfferFor(base({ today: '18/11/2026' }))).toThrow(RangeError);
    expect(() => claudeOfferShown('2026-11-1')).toThrow(RangeError);
  });

  it('red flag beats every other reason, then the answer, then mid-workout, then no, then today', () => {
    const all = base({
      outcome: 'answered',
      phase: 'workout',
      claudeWanted: 'no',
      offer: { lastShownDate: TODAY },
    });
    expect(claudeOfferFor(all)).toEqual({ show: false, why: 'answered' });
    expect(claudeOfferFor({ ...all, outcome: 'couldntDo' })).toEqual({
      show: false,
      why: 'midWorkout',
    });
    expect(claudeOfferFor({ ...all, outcome: 'couldntDo', phase: 'today' })).toEqual({
      show: false,
      why: 'declined',
    });
    expect(
      claudeOfferFor({ ...all, outcome: 'couldntDo', phase: 'today', claudeWanted: 'later' }),
    ).toEqual({ show: false, why: 'shownToday' });
  });
});

describe('claudeOutcomeOf (a coach reply → outcome)', () => {
  const reply = (over: Partial<Parameters<typeof claudeOutcomeOf>[0]> = {}) => ({
    reply: 'Here is your week.',
    source: 'rules' as const,
    safety: 'none' as const,
    ...over,
  });
  const COULDNT = "I couldn't make that change. Try one of these:";

  const cases: [string, Parameters<typeof claudeOutcomeOf>[0], ClaudeOfferOutcome][] = [
    ['a plain answer', reply(), 'answered'],
    ['the rules help fallback', reply({ reply: `${HELP_TEXT}` }), 'helpFallback'],
    [
      'the help fallback after a skipped model brain',
      reply({ reply: HELP_TEXT, note: 'Answered by Quick replies: Apple Intelligence is off.' }),
      'unavailable',
    ],
    ['Apple could not make the change', reply({ reply: COULDNT, source: 'apple' }), 'couldntDo'],
    ['a red flag', reply({ reply: 'Stop.', safety: 'redFlag' }), 'redFlag'],
    ['a red flag that reads like help', reply({ reply: HELP_TEXT, safety: 'redFlag' }), 'redFlag'],
    ['a chip tap, even on the help line', reply({ reply: HELP_TEXT, source: 'chip' }), 'answered'],
    ['a proposal is an answer', reply({ reply: HELP_TEXT, proposal: {} as never }), 'answered'],
    ['food ideas are an answer', reply({ reply: HELP_TEXT, foods: [] }), 'answered'],
  ];
  for (const [name, r, want] of cases)
    it(name, () => {
      expect(claudeOutcomeOf(r, { couldntDo: ["I couldn't make that change."] })).toBe(want);
    });

  it('without the couldntDo lines a failed-call reply reads as an answer (the caller passes them)', () => {
    expect(claudeOutcomeOf(reply({ reply: COULDNT, source: 'apple' }))).toBe('answered');
  });
});

describe('CLAUDE_OFFER copy', () => {
  it('has the title, the why line, the key note and the two actions', () => {
    expect(CLAUDE_OFFER.title).toBe('Claude could help with this');
    expect(CLAUDE_OFFER.keyNote).toBe("Your key isn't set up yet.");
    expect(CLAUDE_OFFER.sendsHead).toBe('What would be sent');
    expect(CLAUDE_OFFER.neverHead).toBe('Never sent');
    expect(CLAUDE_OFFER.wanted).toBe("Tell me when it's ready");
    expect(CLAUDE_OFFER.dismiss).toBe('Not now');
    expect(CLAUDE_OFFER.why).toMatch(/Anthropic/);
    expect(CLAUDE_OFFER.why).toMatch(/Nothing is sent/);
  });

  it('every string passes checkCopy and the anyone-scan', () => {
    for (const [k, v] of Object.entries(CLAUDE_OFFER)) {
      expect(checkCopy(v).hits, k).toEqual([]);
      expect(v, k).not.toMatch(GENDERED);
    }
    expect(Object.isFrozen(CLAUDE_OFFER)).toBe(true);
  });
});
