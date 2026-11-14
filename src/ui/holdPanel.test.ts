import { describe, expect, it } from 'vitest';
import {
  holdClockText,
  holdNextLabel,
  holdPartialsLine,
  holdStatusText,
  holdTitle,
} from './holdPanel';

describe('hold panel helpers', () => {
  it('break clock counts up in whole seconds, never negative', () => {
    expect(holdClockText(0)).toBe('0:00');
    expect(holdClockText(999)).toBe('0:00');
    expect(holdClockText(1000)).toBe('0:01');
    expect(holdClockText(16_400)).toBe('0:16');
    expect(holdClockText(65_000)).toBe('1:05');
    expect(holdClockText(720_000)).toBe('12:00');
    expect(holdClockText(-500)).toBe('0:00');
    expect(holdClockText(Number.NaN)).toBe('0:00');
    expect(holdClockText(Number.POSITIVE_INFINITY)).toBe('0:00');
  });

  it('title and partials line', () => {
    expect(holdTitle(6)).toBe('On hold · 6 reps');
    expect(holdTitle(1)).toBe('On hold · 1 rep');
    expect(holdPartialsLine(0)).toBe('');
    expect(holdPartialsLine(1)).toBe('+ 1 partial');
    expect(holdPartialsLine(3)).toBe('+ 3 partials');
  });

  it('second button reads Save set on the last set', () => {
    expect(holdNextLabel(false)).toBe('Start next set');
    expect(holdNextLabel(true)).toBe('Save set');
  });

  it('one status sentence for screen readers', () => {
    expect(holdStatusText(6, 0, false)).toBe(
      'Set on hold, 6 reps. Tap Continue set or Start next set.',
    );
    expect(holdStatusText(1, 2, true)).toBe(
      'Set on hold, 1 rep, 2 partials. Tap Continue set or Save set.',
    );
  });
});
