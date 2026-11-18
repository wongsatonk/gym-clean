import { describe, expect, it } from 'vitest';
import { wordCount } from '../advice';
import { SPOKEN_MAX_WORDS, checkCopy } from '../trainer/replies';
import { REMINDER_COPY, REMINDER_TITLE, reminderText } from './copy';

/** Digits, or a body / Health / weight / food unit word. */
const NUMBERS =
  /\d|\b(kg|lbs?|kcal|cal(orie)?s?|grams?|protein|carbs?|fat|bpm|hrv|sleep|weight|steps)\b/i;

describe('reminder copy', () => {
  it('every template passes checkCopy, has no numbers or units and is short', () => {
    const lines = [REMINDER_TITLE, ...Object.values(REMINDER_COPY)];
    for (const line of lines) {
      expect(checkCopy(line).ok, line).toBe(true);
      expect(NUMBERS.test(line), line).toBe(false);
      expect(wordCount(line), line).toBeLessThanOrEqual(SPOKEN_MAX_WORDS);
    }
  });

  it('fills the day name, title "Gym Clean"', () => {
    expect(reminderText('session', 'Pull A')).toEqual({
      title: 'Gym Clean',
      body: 'Pull A today. Ready when you are.',
    });
    expect(reminderText('missedDay', 'Legs')).toEqual({
      title: 'Gym Clean',
      body: "Missed Legs yesterday? Pick it up when you're ready.",
    });
    expect(reminderText('sundayRecap')).toEqual({
      title: 'Gym Clean',
      body: 'Sunday check-in: how did this week feel?',
    });
  });

  it('a missing, blank or failing day name uses the generic line', () => {
    for (const name of [undefined, '', '   ', 'Painful legs'])
      expect(reminderText('session', name).body).toBe('Training day today. Ready when you are.');
    expect(reminderText('missedDay').body).toBe(
      "Missed yesterday's session? Pick it up when you're ready.",
    );
  });

  it('every filled text still passes the rules', () => {
    for (const kind of ['session', 'missedDay', 'sundayRecap'] as const)
      for (const name of [undefined, 'Push A', 'Upper']) {
        const { title, body } = reminderText(kind, name);
        expect(checkCopy(`${title} ${body}`).ok).toBe(true);
        expect(NUMBERS.test(body), body).toBe(false);
      }
  });
});
