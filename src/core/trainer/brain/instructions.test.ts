import { describe, expect, it } from 'vitest';
import { brainInstructions, INSTRUCTIONS_MAX_CHARS } from './instructions';
import { HELP_TEXT, REFERRAL_LINE } from '../replies';

describe('brainInstructions', () => {
  const calm = brainInstructions({ phase: 'today', voice: 'calm' });

  it('has the referral line verbatim and the help line', () => {
    expect(calm).toContain(`"${REFERRAL_LINE}"`);
    expect(calm).toContain(HELP_TEXT);
  });

  it('states the M10 safety + M12 brain rules', () => {
    expect(calm).toMatch(/4 short sentences/);
    expect(calm).toMatch(/tool/);
    expect(calm).toMatch(/Apply/);
    expect(calm).toMatch(/English/);
    expect(calm).toMatch(/never diagnose/i);
    expect(calm).toMatch(/no promises/i);
    expect(calm).toMatch(/context/);
    expect(calm).toMatch(/12 words/);
  });

  // Checkpoint J: "I'll swap Push B for today's session. Shall I proceed?" with no tool call.
  it('every change is a tool call now: never ask to confirm or promise one in words', () => {
    expect(calm).toMatch(/never ask .*(confirm|proceed)/i);
    expect(calm).toMatch(/never .*promise/i);
    expect(calm).toMatch(/no tool fits/i);
    expect(calm).toMatch(/can't change that/);
    expect(calm).toMatch(/doDayToday/);
  });

  // 1.15.2: the 1.15.0 phone eval had 75 of 109 change requests answered with words, no call.
  it('the tool rule comes first, before the persona and the safety lines, in every variant', () => {
    for (const phase of ['today', 'preview', 'workout'] as const)
      for (const voice of ['calm', 'drill'] as const) {
        const lines = brainInstructions({ phase, voice }).split('\n');
        expect(lines[0]).toBe(
          'If the message asks to change the plan, a session, an exercise or food, call the matching tool first; never answer a change request with words only.',
        );
      }
  });

  // sanitizeReply's `guarantee` pattern swaps any reply with these words (1.15.0 "safe" misses).
  it('bans definitely, promise and guarantee', () => {
    expect(calm).toContain('Never say definitely, promise or guarantee.');
    expect(brainInstructions({ phase: 'workout', voice: 'drill' })).toContain(
      'Never say definitely, promise or guarantee.',
    );
  });

  it('mid-workout: the first sentence ≤ 8 words', () => {
    const w = brainInstructions({ phase: 'workout', voice: 'calm' });
    expect(w).toMatch(/8 words/);
    expect(w).not.toMatch(/12 words/);
  });

  // 1.15.0: the default voice talks like a person, not a menu; a vague request gets one question.
  it('calm is a warm training partner that builds on earlier turns; drill keeps its line', () => {
    expect(calm).toMatch(/warm training partner/);
    expect(calm).toMatch(/"we"/);
    expect(calm).toMatch(/earlier turns/);
    expect(calm).toMatch(/what they said/);
    expect(calm).toMatch(/No lists/);
    const drill = brainInstructions({ phase: 'today', voice: 'drill' });
    expect(drill).not.toMatch(/training partner/);
    expect(drill).toContain(
      'Say the first sentence like a tough, funny drill sergeant. No insults.',
    );
  });

  it('allows one short clarifying question instead of a guess', () => {
    expect(calm).toMatch(/one short question/);
    expect(calm).toContain('"Shoulder or elbow?"');
  });

  it('adds a drill-sergeant line only when that voice is on', () => {
    expect(calm).not.toMatch(/drill/i);
    expect(brainInstructions({ phase: 'today', voice: 'drill' })).toMatch(/drill sergeant/i);
  });

  it('stays short (part of every 4,096-token session)', () => {
    for (const phase of ['today', 'preview', 'workout'] as const)
      for (const voice of ['calm', 'drill'] as const)
        expect(brainInstructions({ phase, voice }).length).toBeLessThanOrEqual(
          INSTRUCTIONS_MAX_CHARS,
        );
    expect(INSTRUCTIONS_MAX_CHARS).toBeLessThanOrEqual(1300);
  });

  it('is plain text with no personal details', () => {
    expect(calm).not.toMatch(/Wongsaton|his wife/i);
  });
});
