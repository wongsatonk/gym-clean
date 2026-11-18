import { describe, expect, it } from 'vitest';
import { wordCount } from '../advice';
import { SAY_MAX_WORDS, SPOKEN_MAX_WORDS } from './replies';
import { micAllowed, sayFor, shouldSpeak, type MicScreen } from './speakRules';

type Speak = 'mic' | 'always' | 'off' | undefined;
const PHASES = ['today', 'preview', 'workout'] as const;

describe('shouldSpeak', () => {
  const cases: [Speak, boolean | undefined, boolean][] = [
    [undefined, true, true],
    [undefined, false, false],
    [undefined, undefined, false],
    ['mic', true, true],
    ['mic', false, false],
    ['mic', undefined, false],
    ['always', true, true],
    ['always', false, true],
    ['always', undefined, true],
    ['off', true, false],
    ['off', false, false],
    ['off', undefined, false],
  ];
  for (const phase of PHASES)
    for (const [speakReplies, viaMic, want] of cases)
      it(`${String(speakReplies)} / viaMic ${String(viaMic)} / ${phase} → ${String(want)}`, () => {
        expect(shouldSpeak({ speakReplies, viaMic, phase, inSet: false })).toBe(want);
      });

  it('never speaks during a set, whatever the setting', () => {
    for (const phase of PHASES)
      for (const [speakReplies, viaMic] of cases)
        expect(shouldSpeak({ speakReplies, viaMic, phase, inSet: true })).toBe(false);
  });

  it("an unknown stored value acts like the default 'mic'", () => {
    const junk = 'loud' as unknown as 'mic';
    expect(shouldSpeak({ speakReplies: junk, viaMic: true, phase: 'today', inSet: false })).toBe(
      true,
    );
    expect(shouldSpeak({ speakReplies: junk, phase: 'today', inSet: false })).toBe(false);
  });
});

describe('micAllowed', () => {
  const screens: MicScreen[] = ['coach', 'pause', 'camera', 'other'];
  for (const native of [true, false])
    for (const inSet of [true, false])
      for (const screen of screens) {
        const want = native && !inSet && (screen === 'coach' || screen === 'pause');
        it(`native ${native} / inSet ${inSet} / ${screen} → ${want}`, () => {
          expect(micAllowed({ native, inSet, screen })).toBe(want);
        });
      }
});

describe('sayFor', () => {
  it("uses the reply's own say when it passes the copy check", () => {
    expect(sayFor({ reply: 'Long text here. More text.', say: 'Moved to Thursday' }, 'today')).toBe(
      'Moved to Thursday.',
    );
  });

  it("falls back to the reply's first sentence without a say", () => {
    expect(sayFor({ reply: 'Push A is next. Five exercises, about an hour.' }, 'today')).toBe(
      'Push A is next.',
    );
    expect(sayFor({ reply: 'Rest day today! Enjoy it.' }, 'today')).toBe('Rest day today!');
    expect(sayFor({ reply: 'Ready when you are' }, 'today')).toBe('Ready when you are.');
  });

  it('falls back to the reply when the say fails the copy check or is blank', () => {
    expect(sayFor({ reply: 'Go lighter today.', say: 'That might hurt' }, 'today')).toBe(
      'Go lighter today.',
    );
    expect(sayFor({ reply: 'Go lighter today.', say: '   ' }, 'today')).toBe('Go lighter today.');
  });

  it('caps at 12 words outside a workout and 8 during one', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
    const out = sayFor({ reply: long }, 'today');
    expect(out).toBe('one two three four five six seven eight nine ten eleven twelve.');
    expect(wordCount(out ?? '')).toBe(SPOKEN_MAX_WORDS);
    expect(sayFor({ reply: long }, 'preview')).toBe(out);
    const mid = sayFor({ reply: long }, 'workout');
    expect(mid).toBe('one two three four five six seven eight.');
    expect(wordCount(mid ?? '')).toBe(SAY_MAX_WORDS);
    expect(sayFor({ reply: 'x', say: long }, 'workout')).toBe(mid);
  });

  it('strips a trailing comma or dash at the cut and ends with a full stop', () => {
    const r = 'Squat first, then press, then rows, then curls, then the rest of it all';
    expect(sayFor({ reply: r }, 'workout')).toBe('Squat first, then press, then rows, then curls.');
    expect(sayFor({ reply: 'Nice work today one two three four - and more' }, 'workout')).toBe(
      'Nice work today one two three four.',
    );
    expect(sayFor({ reply: 'Nice work today one two three four — and more' }, 'workout')).toBe(
      'Nice work today one two three four.',
    );
    expect(sayFor({ reply: 'Short and sweet,' }, 'today')).toBe('Short and sweet.');
  });

  it('undefined when there is nothing to say or the copy check fails', () => {
    expect(sayFor({ reply: '' }, 'today')).toBeUndefined();
    expect(sayFor({ reply: '   ' }, 'today')).toBeUndefined();
    expect(sayFor({ reply: 'This could cause pain.' }, 'today')).toBeUndefined();
    expect(sayFor({ reply: 'Fine.', say: '...' }, 'today')).toBe('Fine.');
    expect(sayFor({ reply: '...' }, 'today')).toBeUndefined();
  });

  it('a long first sentence is capped (no dangling joining word), later ones are dropped', () => {
    expect(
      sayFor(
        { reply: 'You did all four sessions last week and every planned set. Great.' },
        'workout',
      ),
    ).toBe('You did all four sessions last week.');
  });
});
