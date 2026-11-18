import { describe, expect, it } from 'vitest';
import { SAFE_LINE, sanitizeReply } from './sanitize';
import { checkCopy, RED_FLAG_LINE, REFERRAL_LINE } from '../replies';
import { wordCount } from '../../advice';

describe('sanitizeReply', () => {
  it('passes a clean reply through', () => {
    const r = sanitizeReply('Push A is today. Bench first, then incline.', 'none');
    expect(r).toEqual({
      text: 'Push A is today. Bench first, then incline.',
      replaced: false,
      hits: [],
    });
  });

  it('the safe line passes the copy check', () => {
    expect(checkCopy(SAFE_LINE).ok).toBe(true);
  });

  const bad = [
    'That sounds like tendinitis, rest it for a week.',
    'You may have a rotator cuff strain.',
    'Ice it and take a painkiller.',
    'This exercise is totally safe for you.',
    'Lifting this way can cause injury.',
    'It is probably inflammation, take some medication.',
    'Your knee pain will go away.',
    'I guarantee you will add 10 kg in a month.',
    'This plan will definitely get you results.',
    'Rest 3 days and it will heal.',
    'You might have a herniated disc.',
    'คุณอาจมีอาการอักเสบ',
  ];
  for (const text of bad)
    it(`replaces: ${text}`, () => {
      const r = sanitizeReply(text, 'none');
      expect(r.replaced).toBe(true);
      expect(r.text).toBe(SAFE_LINE);
      expect(r.hits.length).toBeGreaterThan(0);
    });

  it('adds the referral line on discomfort (once, first)', () => {
    const r = sanitizeReply('Here is a lighter day for your shoulders.', 'discomfort');
    expect(r.text).toBe(`${REFERRAL_LINE} Here is a lighter day for your shoulders.`);
    const again = sanitizeReply(`${REFERRAL_LINE} Lighter day it is.`, 'discomfort');
    expect(again.text).toBe(`${REFERRAL_LINE} Lighter day it is.`);
    const replaced = sanitizeReply('Sounds like a sprain.', 'discomfort');
    expect(replaced.text).toBe(`${REFERRAL_LINE} ${SAFE_LINE}`);
  });

  it('a red flag always gets only the red-flag line', () => {
    const r = sanitizeReply('Let us do a lighter session instead.', 'redFlag');
    expect(r.text).toBe(RED_FLAG_LINE);
  });

  it('caps at 4 sentences (referral line included)', () => {
    const long = 'One. Two is here. Three now. Four too. Five extra. Six more.';
    expect(sanitizeReply(long, 'none').text).toBe('One. Two is here. Three now. Four too.');
    expect(sanitizeReply(long, 'discomfort').text).toBe(
      `${REFERRAL_LINE} One. Two is here. Three now.`,
    );
  });

  it('does not split on decimals', () => {
    expect(sanitizeReply('Bench went up to 22.5 kg. Nice.', 'none').text).toBe(
      'Bench went up to 22.5 kg. Nice.',
    );
  });

  it('turns exercise ids into names', () => {
    expect(sanitizeReply('Swap Dumbbell_Bench_Press for Pushups.', 'none').text).toBe(
      'Swap Dumbbell Bench Press for Pushups.',
    );
  });

  it('a reply in another script is replaced (English only)', () => {
    expect(sanitizeReply('วันนี้เล่นขา', 'none').text).toBe(SAFE_LINE);
  });

  it('an empty reply stays empty (a tool call may carry the answer)', () => {
    expect(sanitizeReply('   ', 'none').text).toBe('');
    expect(sanitizeReply('', 'discomfort').text).toBe(REFERRAL_LINE);
  });

  it('caps say at 12 words, 8 mid-workout, and drops a bad say', () => {
    const say = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    const today = sanitizeReply('Fine.', 'none', { say, phase: 'today' });
    expect(wordCount(today.say ?? '')).toBe(12);
    const workout = sanitizeReply('Fine.', 'none', { say, phase: 'workout' });
    expect(wordCount(workout.say ?? '')).toBe(8);
    expect(sanitizeReply('Fine.', 'none', { say: 'This is safe.' }).say).toBeUndefined();
    expect(sanitizeReply('Fine.', 'redFlag', { say: 'Keep going.' }).say).toBeUndefined();
  });
});
