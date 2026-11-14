import { describe, expect, it } from 'vitest';
import {
  autoStopStatusText,
  partialsLine,
  repWord,
  undoAriaLabel,
  undoFraction,
  undoSecondsLeft,
} from './autoStopBanner';
import { camRestClock } from './cameraRestPanel';

describe('auto-stop banner helpers', () => {
  it('counts whole seconds down 5 → 1, then 0, never negative', () => {
    expect(undoSecondsLeft(5000)).toBe(5);
    expect(undoSecondsLeft(4001)).toBe(5);
    expect(undoSecondsLeft(4000)).toBe(4);
    expect(undoSecondsLeft(1)).toBe(1);
    expect(undoSecondsLeft(0)).toBe(0);
    expect(undoSecondsLeft(-300)).toBe(0);
    expect(undoSecondsLeft(Number.NaN)).toBe(0);
  });

  it('ring fraction is clamped to 0..1', () => {
    expect(undoFraction(5000, 5)).toBe(1);
    expect(undoFraction(2500, 5)).toBe(0.5);
    expect(undoFraction(9000, 5)).toBe(1);
    expect(undoFraction(-1, 5)).toBe(0);
    expect(undoFraction(1000, 0)).toBe(0);
  });

  it('words and the status sentence', () => {
    expect(repWord(1)).toBe('rep');
    expect(repWord(8)).toBe('reps');
    expect(repWord(0)).toBe('reps');
    expect(partialsLine(0)).toBe('');
    expect(partialsLine(1)).toBe('+ 1 partial');
    expect(partialsLine(2)).toBe('+ 2 partials');
    expect(autoStopStatusText(8, 0)).toBe('Set done, 8 reps.');
    expect(autoStopStatusText(1, 1)).toBe('Set done, 1 rep, 1 partial.');
    expect(undoAriaLabel(4)).toBe('Undo. Saving in 4 seconds');
    expect(undoAriaLabel(1)).toBe('Undo. Saving in 1 second');
    expect(undoAriaLabel(0)).toBe('Undo. Saving now');
  });
});

describe('camera rest clock', () => {
  it('formats like the Rest screen and flags overtime', () => {
    expect(camRestClock(90_000)).toEqual({ text: '1:30', overtime: false });
    expect(camRestClock(0)).toEqual({ text: '0:00', overtime: false });
    expect(camRestClock(-12_000)).toEqual({ text: '+0:12', overtime: true });
    expect(camRestClock(5_000, true)).toEqual({ text: '0:05', overtime: true });
    expect(camRestClock(Number.NaN)).toEqual({ text: '0:00', overtime: false });
  });
});
