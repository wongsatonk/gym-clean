import { describe, expect, it } from 'vitest';
import { wordCount } from '../advice';
import { checkCopy } from '../trainer/replies';
import type { Goal } from '../types';
import type { GoalProgress } from './goals';
import { REVIEW_WEEKS_DEFAULT } from './goalRules';
import { reviewDue, reviewWeeksOf } from './review';

// Made-up goals only.
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).getTime();
const CREATED = at(2026, 6, 1);
const goal = (id: string, text: string, extra: Partial<Goal> = {}): Goal => ({
  id,
  text,
  target: { kind: 'lift', ref: 'bench', value: 65, reps: 8 },
  due: '2026-08-24',
  createdAt: CREATED,
  ...extra,
});
const bench = goal('g1', 'Bench Press 65 kg × 8 by 2026-08-24');
const arm = goal('g2', 'Left arm +1 cm by 2026-08-24', { target: { kind: 'measurement', ref: 'leftArm', value: 34 } });
const progress = (goalId: string, status: GoalProgress['status'], pct: number | null, extra: Partial<GoalProgress> = {}): GoalProgress => ({
  goalId,
  pct,
  status,
  startValue: 1,
  currentValue: 2,
  targetValue: 3,
  daysLeft: 40,
  overdue: false,
  ...extra,
});

describe('reviewWeeksOf', () => {
  it('uses the setting within 4–6 weeks, else the default', () => {
    expect(REVIEW_WEEKS_DEFAULT).toBe(5);
    expect(reviewWeeksOf(4)).toBe(4);
    expect(reviewWeeksOf(5)).toBe(5);
    expect(reviewWeeksOf(6)).toBe(6);
    expect(reviewWeeksOf(2)).toBe(4);
    expect(reviewWeeksOf(12)).toBe(6);
    expect(reviewWeeksOf(Number.NaN)).toBe(5);
    expect(reviewWeeksOf(4.6)).toBe(5);
  });
});

describe('reviewDue', () => {
  it('first review: 5 weeks after the first goal was set, not a day earlier', () => {
    expect(reviewDue([bench], undefined, 5, '2026-07-05')).toBeNull();
    const r = reviewDue([bench], undefined, 5, '2026-07-06');
    expect(r).toMatchObject({ weeks: 5, dueSince: '2026-07-06' });
  });

  it('once per period: after it is posted, the next one is 5 weeks later', () => {
    const posted = at(2026, 7, 8, 20);
    expect(reviewDue([bench], posted, 5, '2026-07-09')).toBeNull();
    expect(reviewDue([bench], posted, 5, '2026-08-11')).toBeNull();
    expect(reviewDue([bench], posted, 5, '2026-08-12')).toMatchObject({ dueSince: '2026-08-12' });
    // Missed periods are not backfilled: one review, however late.
    expect(reviewDue([bench], posted, 5, '2026-12-01')).toMatchObject({ dueSince: '2026-08-12' });
  });

  it('every 4 or 6 weeks when the setting says so', () => {
    expect(reviewDue([bench], undefined, 4, '2026-06-28')).toBeNull();
    expect(reviewDue([bench], undefined, 4, '2026-06-29')).toMatchObject({ weeks: 4 });
    expect(reviewDue([bench], undefined, 6, '2026-07-12')).toBeNull();
    expect(reviewDue([bench], undefined, 6, '2026-07-13')).toMatchObject({ weeks: 6 });
  });

  it('no goals: counts from `since` (the intake), and offers to set a goal; nothing to count from → no review', () => {
    expect(reviewDue([], undefined, 5, '2026-12-01')).toBeNull();
    expect(reviewDue([], undefined, 5, '2026-07-05', { since: CREATED })).toBeNull();
    const r = reviewDue([], undefined, 5, '2026-07-06', { since: CREATED });
    expect(r).toMatchObject({ offer: 'goalEdit' });
    expect(r?.text).toBe('5-week review. You have no goal set. Want to set one?');
    expect(r?.chips[0]).toEqual({ id: 'goalEdit', label: 'Set a goal' });
  });

  it('on track → recap of each goal, then a focus block offer', () => {
    const r = reviewDue([bench, arm], undefined, 5, '2026-07-06', {
      progress: [progress('g1', 'onTrack', 50), progress('g2', 'onTrack', 40)],
    });
    expect(r?.text).toBe(
      '5-week review. Bench Press 65 kg × 8 by 2026-08-24: 50% of the way, on track. ' +
        'Left arm +1 cm by 2026-08-24: 40% of the way, on track. ' +
        'Want a focus block for the next weeks?',
    );
    expect(r?.offer).toBe('focusBlock');
    expect(r?.chips).toEqual([
      { id: 'focusBlock', label: 'Plan a focus block' },
      { id: 'goalEdit', label: 'Change my goal' },
    ]);
    expect(r?.lines).toHaveLength(2);
  });

  it('behind → offers to change the goal (date or target) first', () => {
    const r = reviewDue([bench, arm], undefined, 5, '2026-07-06', {
      progress: [progress('g1', 'behind', 10), progress('g2', 'onTrack', 40)],
    });
    expect(r?.offer).toBe('goalEdit');
    expect(r?.text.endsWith('Want to move the date or the target?')).toBe(true);
    expect(r?.chips.map((c) => c.id)).toEqual(['goalEdit', 'focusBlock']);
  });

  it('all reached → offers the next goal', () => {
    const r = reviewDue([{ ...bench, doneAt: at(2026, 7, 1) }], undefined, 5, '2026-07-06', {
      progress: [progress('g1', 'done', 100)],
    });
    expect(r?.offer).toBe('goalEdit');
    expect(r?.text).toBe('5-week review. Bench Press 65 kg × 8 by 2026-08-24: Reached. Want to set the next goal?');
    expect(r?.chips[0]).toEqual({ id: 'goalEdit', label: 'Set the next goal' });
  });

  it('without progress numbers it still lists the goals', () => {
    const r = reviewDue([bench], undefined, 5, '2026-07-06');
    expect(r?.text).toBe('5-week review. Your goal: Bench Press 65 kg × 8 by 2026-08-24. Want a focus block for the next weeks?');
  });

  it('counts from the earliest goal; a junk setting falls back into 4–6 weeks', () => {
    const later = goal('g3', 'Waist −3 cm by 2026-09-30', { createdAt: at(2026, 6, 20) });
    expect(reviewDue([later, bench], undefined, 5, '2026-07-06')).not.toBeNull();
    expect(reviewDue([bench], undefined, 0, '2026-06-29')).toMatchObject({ weeks: 4 });
  });

  it('every text passes the copy check; the spoken line is short', () => {
    const cases = [
      reviewDue([], undefined, 5, '2026-07-06', { since: CREATED }),
      reviewDue([bench], undefined, 4, '2026-07-06'),
      reviewDue([bench, arm], undefined, 6, '2026-08-06', { progress: [progress('g1', 'behind', 10, { overdue: true }), progress('g2', 'noData', null)] }),
      reviewDue([bench], undefined, 5, '2026-07-06', { progress: [progress('g1', 'done', 100)] }),
    ];
    for (const r of cases) {
      expect(r).not.toBeNull();
      if (!r) continue;
      for (const t of [r.text, r.say, ...r.lines, ...r.chips.map((c) => c.label)]) {
        expect(checkCopy(t)).toEqual({ ok: true, hits: [] });
      }
      expect(wordCount(r.say)).toBeLessThanOrEqual(12);
    }
  });
});
