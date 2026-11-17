import { describe, expect, it } from 'vitest';
import { checkCopy } from '../trainer/replies';
import type { CheckIn } from '../types';
import {
  CHECK_IN_QUESTIONS,
  CHECK_IN_SCALE,
  checkInDue,
  checkInLine,
  checkInStatus,
  checkInWeek,
} from './checkIn';

// Made-up answers only (the repo is public).
const row = (over: Partial<CheckIn> = {}): CheckIn => ({ weekStart: '2026-11-16', at: 1, ...over });

describe('questions as data', () => {
  it('energy, sleep, soreness; 1–5 chips labelled Low … High', () => {
    expect(CHECK_IN_QUESTIONS.map((q) => q.id)).toEqual(['energy', 'sleep', 'soreness']);
    expect(CHECK_IN_SCALE).toEqual({ values: [1, 2, 3, 4, 5], low: 'Low', high: 'High' });
    for (const q of CHECK_IN_QUESTIONS) {
      expect(q.label.length).toBeGreaterThan(0);
      expect(checkCopy(q.label).ok, q.label).toBe(true);
    }
  });
});

describe('checkInWeek', () => {
  it('opens on Sunday for that Mon–Sun week and stays open through Saturday', () => {
    // Sun 2026-11-22 closes the week of Mon 2026-11-16.
    expect(checkInWeek('2026-11-22')).toBe('2026-11-16');
    for (const d of ['2026-11-23', '2026-11-24', '2026-11-27', '2026-11-28'])
      expect(checkInWeek(d), d).toBe('2026-11-16');
    expect(checkInWeek('2026-11-29')).toBe('2026-11-23');
    // Saturday before: the previous week's Sunday (2026-11-15) is the latest.
    expect(checkInWeek('2026-11-21')).toBe('2026-11-09');
  });

  it('across a month and a year end', () => {
    expect(checkInWeek('2027-01-03')).toBe('2026-12-28');
    expect(checkInWeek('2027-01-01')).toBe('2026-12-21');
  });
});

describe('checkInDue', () => {
  it("the open week's Monday when there's no row for it", () => {
    expect(checkInDue('2026-11-22', [])).toBe('2026-11-16');
    expect(checkInDue('2026-11-25', [row({ weekStart: '2026-11-09', energy: 3 })])).toBe(
      '2026-11-16',
    );
  });

  it('once per week: answered, partly answered or skipped → null', () => {
    for (const r of [
      row({ energy: 4, sleep: 3, soreness: 2 }),
      row({ sleep: 2 }),
      row({ skipped: true }),
    ])
      for (const d of ['2026-11-22', '2026-11-23', '2026-11-28'])
        expect(checkInDue(d, [r]), d).toBeNull();
  });

  it('the next Sunday opens the next week', () => {
    const done = [row({ energy: 4 })];
    expect(checkInDue('2026-11-28', done)).toBeNull();
    expect(checkInDue('2026-11-29', done)).toBe('2026-11-23');
  });
});

describe('checkInStatus', () => {
  it('none / skipped / answered', () => {
    expect(checkInStatus(undefined)).toBe('none');
    expect(checkInStatus(row())).toBe('none');
    expect(checkInStatus(row({ skipped: true }))).toBe('skipped');
    expect(checkInStatus(row({ soreness: 1 }))).toBe('answered');
  });
});

describe('checkInLine', () => {
  it('the recap line from the answers given', () => {
    expect(checkInLine(row({ energy: 4, sleep: 3, soreness: 2 }))).toBe(
      'You rated energy 4, sleep 3, soreness 2.',
    );
    expect(checkInLine(row({ energy: 5, soreness: 1 }))).toBe('You rated energy 5, soreness 1.');
    expect(checkInLine(row({ sleep: 2 }))).toBe('You rated sleep 2.');
  });

  it('null when skipped, empty or missing', () => {
    expect(checkInLine(undefined)).toBeNull();
    expect(checkInLine(row())).toBeNull();
    expect(checkInLine(row({ skipped: true }))).toBeNull();
  });

  it('passes checkCopy', () => {
    expect(checkCopy(checkInLine(row({ energy: 1, sleep: 1, soreness: 5 })) ?? '').ok).toBe(true);
  });
});
