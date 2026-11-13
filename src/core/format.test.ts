import { describe, expect, it } from 'vitest';
import { formatDuration, formatKg, formatRest } from './format';

describe('formatRest', () => {
  it('counts down in m:ss, rounding up partial seconds', () => {
    expect(formatRest(90_000)).toBe('1:30');
    expect(formatRest(9_001)).toBe('0:10');
    expect(formatRest(0)).toBe('0:00');
  });
  it('shows overtime with a plus sign', () => {
    expect(formatRest(-500)).toBe('+0:00');
    expect(formatRest(-65_000)).toBe('+1:05');
  });
});

describe('formatKg', () => {
  it('drops trailing zeros', () => {
    expect(formatKg(20)).toBe('20');
    expect(formatKg(22.5)).toBe('22.5');
    expect(formatKg(1234.5)).toBe('1,234.5');
  });
});

describe('formatDuration', () => {
  it('shows minutes, and hours when needed', () => {
    expect(formatDuration(59)).toBe('1 min');
    expect(formatDuration(42 * 60)).toBe('42 min');
    expect(formatDuration(65 * 60)).toBe('1 h 5 min');
  });
});
