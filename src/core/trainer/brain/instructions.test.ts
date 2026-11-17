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

  it('mid-workout: the first sentence ≤ 8 words', () => {
    const w = brainInstructions({ phase: 'workout', voice: 'calm' });
    expect(w).toMatch(/8 words/);
    expect(w).not.toMatch(/12 words/);
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
