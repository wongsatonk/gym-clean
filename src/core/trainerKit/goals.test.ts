import { describe, expect, it } from 'vitest';
import { checkCopy } from '../trainer/replies';
import type { Goal, GoalKind, Intake, Measurement, SetLog, WeighIn } from '../types';
import { GOAL_KIND_LABELS, GOAL_RULES, GOAL_WEEKS, MAX_GOALS } from './goalRules';
import { goalProgress, goalProgressText, suggestGoals, type GoalHistory } from './goals';

// Made-up person, lifts and numbers only.
const DAY = 86_400_000;
const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).getTime();
const TODAY = '2026-06-15';
const NOW = at(2026, 6, 15, 9);
const DUE = '2026-09-07'; // 12 weeks after TODAY

let seq = 0;
function set(sessionId: string, exerciseId: string, weightKg: number, reps: number, startedAt: number, extra: Partial<SetLog> = {}): SetLog {
  seq += 1;
  return { sessionId, exerciseId, setIndex: seq, reps, weightKg, restTakenSec: 90, startedAt: startedAt + seq, endedAt: startedAt + seq + 1, ...extra };
}

const sessions = [
  { sessionId: 's1', startedAt: at(2026, 6, 1), endedAt: at(2026, 6, 1, 19) },
  { sessionId: 's2', startedAt: at(2026, 6, 5), endedAt: at(2026, 6, 5, 19) },
  { sessionId: 's3', startedAt: at(2026, 6, 9), endedAt: at(2026, 6, 9, 19) },
];
const sets: SetLog[] = [
  set('s1', 'bench', 57.5, 8, at(2026, 6, 1)),
  set('s1', 'squat', 80, 5, at(2026, 6, 1)),
  set('s2', 'bench', 60, 8, at(2026, 6, 5)),
  set('s2', 'curl', 12, 12, at(2026, 6, 5)),
  set('s3', 'bench', 60, 6, at(2026, 6, 9)),
  set('s3', 'bench', 90, 5, at(2026, 6, 9), { warmup: true }),
  set('s3', 'squat', 82.5, 5, at(2026, 6, 9)),
];
const measurements: Measurement[] = [
  { date: '2026-06-01', site: 'leftArm', cm: 33 },
  { date: '2026-06-01', site: 'waist', cm: 80 },
];
const weighIns: WeighIn[] = [{ date: '2026-06-14', kg: 70 }];

const history: GoalHistory = {
  today: TODAY,
  now: NOW,
  sets,
  sessions,
  measurements,
  weighIns,
  exerciseNames: { bench: 'Bench Press', squat: 'Barbell Squat', curl: 'Dumbbell Curl' },
  unit: 'kg',
  sites: ['leftArm', 'rightArm', 'chest', 'waist', 'hips', 'leftThigh', 'rightThigh'],
  preferLifts: ['bench', 'squat'],
};

const intake = (goalKind: GoalKind, extra: Partial<Intake> = {}): Intake => ({
  goalKind,
  days: 3,
  sessionMin: 60,
  experience: 'some',
  easyOn: [],
  at: NOW,
  ...extra,
});

describe('goal rules (data)', () => {
  it('every goal kind has a label and 1–2 target templates', () => {
    for (const kind of ['muscle', 'fat', 'strength', 'general'] as const) {
      expect(GOAL_KIND_LABELS[kind]).toBeTruthy();
      expect(checkCopy(GOAL_KIND_LABELS[kind]).ok).toBe(true);
      const n = GOAL_RULES[kind].targets.length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(MAX_GOALS);
    }
    expect(GOAL_WEEKS).toBe(12);
  });
});

describe('suggestGoals', () => {
  it('muscle: a lift target from the estimated max, and an arm measurement', () => {
    const { goals, needs } = suggestGoals(intake('muscle'), history);
    expect(needs).toEqual([]);
    expect(goals).toHaveLength(2);
    // Best estimate 60 × 8 = 76 kg; +5% → 79.8 → 63.0 kg × 8 → nearest 2.5 kg step.
    expect(goals[0]).toMatchObject({
      text: `Bench Press 62.5 kg × 8 by ${DUE}`,
      target: { kind: 'lift', ref: 'bench', value: 62.5, reps: 8 },
      due: DUE,
      createdAt: NOW,
    });
    expect(goals[1]).toMatchObject({
      text: `Left arm +1 cm by ${DUE}`,
      target: { kind: 'measurement', ref: 'leftArm', value: 34 },
      due: DUE,
    });
    expect(goals[0]?.doneAt).toBeUndefined();
    expect(new Set(goals.map((g) => g.id)).size).toBe(2);
  });

  it('strength: two lifts at 5 reps', () => {
    const { goals } = suggestGoals(intake('strength'), history);
    expect(goals.map((g) => g.target)).toEqual([
      { kind: 'lift', ref: 'bench', value: 70, reps: 5 }, // 76 × 1.075 = 81.7 → 70.0 × 5
      { kind: 'lift', ref: 'squat', value: 87.5, reps: 5 }, // 96.25 × 1.075 = 103.5 → 88.7 → 87.5
    ]);
    expect(goals[1]?.text).toBe(`Barbell Squat 87.5 kg × 5 by ${DUE}`);
  });

  it('fat: a body-weight target and a waist measurement', () => {
    const { goals, needs } = suggestGoals(intake('fat'), history);
    expect(needs).toEqual([]);
    expect(goals.map((g) => g.target)).toEqual([
      { kind: 'weight', value: 65.8 }, // 70 kg, 0.5% a week for 12 weeks
      { kind: 'measurement', ref: 'waist', value: 77 },
    ]);
    expect(goals.map((g) => g.text)).toEqual([`Body weight 65.8 kg by ${DUE}`, `Waist −3 cm by ${DUE}`]);
  });

  it('general: one lift target at 10 reps', () => {
    const { goals } = suggestGoals(intake('general'), history);
    expect(goals.map((g) => g.target)).toEqual([{ kind: 'lift', ref: 'bench', value: 60, reps: 10 }]);
  });

  it('experience scales the lift gain (data)', () => {
    expect(suggestGoals(intake('muscle', { experience: 'new' }), history).goals[0]?.target.value).toBe(65);
    expect(suggestGoals(intake('muscle', { experience: 'years' }), history).goals[0]?.target.value).toBe(62.5);
  });

  it('a lift target is always above today’s estimate, even after snapping', () => {
    const tiny: GoalHistory = {
      ...history,
      sets: [set('s1', 'curl', 5.5, 10, at(2026, 6, 1))],
      preferLifts: [],
    };
    const goal = suggestGoals(intake('general'), tiny).goals[0];
    // 5.5 kg × 10; +5% is 5.8 kg, which snaps back to 5 kg × 10, so it steps up to 7.5 kg.
    expect(goal?.target).toEqual({ kind: 'lift', ref: 'curl', value: 7.5, reps: 10 });
  });

  it('pounds: snapped to 5 lb and written in lb; stored in kg', () => {
    const goal = suggestGoals(intake('muscle'), { ...history, unit: 'lb' }).goals[0];
    expect(goal?.text).toBe(`Bench Press 140 lb × 8 by ${DUE}`);
    expect(goal?.target.value).toBeCloseTo(63.503, 2);
    const arm = suggestGoals(intake('muscle'), { ...history, unit: 'lb' }).goals[1];
    expect(arm?.text).toBe(`Left arm +0.4 in by ${DUE}`);
  });

  it('without preferred lifts, the lift done in the most sessions is used', () => {
    const { goals } = suggestGoals(intake('general'), { ...history, preferLifts: [] });
    expect(goals[0]?.target.ref).toBe('bench');
  });

  it('measurement sites follow the setting: a site that is not listed is not suggested', () => {
    const { goals, needs } = suggestGoals(intake('fat'), { ...history, sites: ['leftArm'] });
    expect(goals.map((g) => g.target.kind)).toEqual(['weight']);
    expect(needs).toEqual(['measurement']);
  });

  it('nothing logged yet (a fresh install): no made-up numbers, it says what to log first', () => {
    const empty: GoalHistory = { ...history, sets: [], sessions: [], measurements: [], weighIns: [] };
    expect(suggestGoals(intake('muscle'), empty)).toEqual({ goals: [], needs: ['lift', 'measurement'] });
    expect(suggestGoals(intake('fat'), empty)).toEqual({ goals: [], needs: ['weighIn', 'measurement'] });
    expect(suggestGoals(intake('strength'), empty)).toEqual({ goals: [], needs: ['lift'] });
  });

  it('same input → same goals; warm-ups and unfinished sessions never set the baseline', () => {
    expect(suggestGoals(intake('muscle'), history)).toEqual(suggestGoals(intake('muscle'), history));
    const open: GoalHistory = {
      ...history,
      sets: [...sets, set('open', 'bench', 100, 5, at(2026, 6, 12))],
      sessions: [...sessions, { sessionId: 'open', startedAt: at(2026, 6, 12) }],
    };
    expect(suggestGoals(intake('muscle'), open).goals[0]?.target.value).toBe(62.5);
  });

  it('every goal text passes the copy check', () => {
    for (const kind of ['muscle', 'fat', 'strength', 'general'] as const) {
      for (const unit of ['kg', 'lb'] as const) {
        for (const g of suggestGoals(intake(kind), { ...history, unit }).goals) {
          expect(checkCopy(g.text)).toEqual({ ok: true, hits: [] });
        }
      }
    }
  });
});

describe('goalProgress', () => {
  const created = at(2026, 6, 1, 9);
  const base = { id: 'g', due: '2026-08-24', createdAt: created }; // 84 days
  const lift: Goal = { ...base, text: 'Bench Press 65 kg × 8 by 2026-08-24', target: { kind: 'lift', ref: 'bench', value: 65, reps: 8 } };
  const before = [set('a', 'bench', 60, 8, created - 2 * DAY)];

  it('lift: % of the way from the estimate at the start to the target’s estimate', () => {
    // start 76, target 82.33, now 62.5 × 8 = 79.17 → 50%
    const logs = [...before, set('b', 'bench', 62.5, 8, created + 20 * DAY)];
    const p = goalProgress(lift, logs, [], [], '2026-07-13'); // day 42 of 84
    expect(p).toMatchObject({ goalId: 'g', pct: 50, status: 'onTrack', daysLeft: 42, overdue: false });
    expect(p.startValue).toBeCloseTo(76, 6);
    expect(p.targetValue).toBeCloseTo(82.3333, 3);
    expect(p.currentValue).toBeCloseTo(79.1667, 3);
  });

  it('lift: behind when the progress trails the calendar by more than the slack', () => {
    const logs = [...before, set('b', 'bench', 61, 8, created + 20 * DAY)]; // 77.27 → 20%
    expect(goalProgress(lift, logs, [], [], '2026-07-13')).toMatchObject({ pct: 20, status: 'behind' });
    // Early on, 20% is still on track (day 21 of 84 = 25%, within 10 points).
    expect(goalProgress(lift, logs, [], [], '2026-06-22')).toMatchObject({ pct: 20, status: 'onTrack' });
  });

  it('lift: reaching the target is done; warm-ups, other lifts and later dates do not count', () => {
    const logs = [
      ...before,
      set('b', 'bench', 100, 5, created + 5 * DAY, { warmup: true }),
      set('b', 'squat', 100, 8, created + 5 * DAY),
      set('c', 'bench', 65, 8, created + 30 * DAY),
    ];
    // Day 7 of 84 (8%): no gain yet is still within the 10-point slack.
    expect(goalProgress(lift, logs, [], [], '2026-06-08')).toMatchObject({ pct: 0, status: 'onTrack' });
    expect(goalProgress(lift, logs, [], [], '2026-07-13')).toMatchObject({ pct: 100, status: 'done' });
  });

  it('lift: nothing logged → noData', () => {
    expect(goalProgress(lift, [], [], [], '2026-07-13')).toMatchObject({ pct: null, status: 'noData', currentValue: null });
  });

  it('measurement: works for a target above and below the start', () => {
    const arm: Goal = { ...base, text: 'Left arm +1 cm by 2026-08-24', target: { kind: 'measurement', ref: 'leftArm', value: 34 } };
    const waist: Goal = { ...base, text: 'Waist −3 cm by 2026-08-24', target: { kind: 'measurement', ref: 'waist', value: 77 } };
    const rows: Measurement[] = [
      { date: '2026-06-01', site: 'leftArm', cm: 33 },
      { date: '2026-06-29', site: 'leftArm', cm: 33.4 },
      { date: '2026-06-01', site: 'waist', cm: 80 },
      { date: '2026-06-29', site: 'waist', cm: 79.4 },
      { date: '2026-08-30', site: 'waist', cm: 70 },
    ];
    expect(goalProgress(arm, [], rows, [], '2026-06-29')).toMatchObject({ pct: 40, status: 'onTrack', startValue: 33, currentValue: 33.4 });
    expect(goalProgress(waist, [], rows, [], '2026-07-13')).toMatchObject({ pct: 20, status: 'behind' });
    // A step the wrong way is 0%, never negative.
    expect(goalProgress(arm, [], [{ date: '2026-06-01', site: 'leftArm', cm: 33 }, { date: '2026-06-29', site: 'leftArm', cm: 32.5 }], [], '2026-06-29').pct).toBe(0);
  });

  it('weight: from the weight at the start towards the target', () => {
    const goal: Goal = { ...base, text: 'Body weight 66 kg by 2026-08-24', target: { kind: 'weight', value: 66 } };
    const rows: WeighIn[] = [
      { date: '2026-05-31', kg: 70 },
      { date: '2026-07-12', kg: 68 },
    ];
    expect(goalProgress(goal, [], [], rows, '2026-07-13')).toMatchObject({ pct: 50, status: 'onTrack', startValue: 70, currentValue: 68 });
    expect(goalProgress(goal, [], [], [], '2026-07-13').status).toBe('noData');
  });

  it('past the date and not there → behind and overdue; marked done stays done', () => {
    const logs = [...before, set('b', 'bench', 64, 8, created + 60 * DAY)];
    expect(goalProgress(lift, logs, [], [], '2026-08-25')).toMatchObject({ status: 'behind', overdue: true, daysLeft: 0 });
    expect(goalProgress({ ...lift, doneAt: created + 70 * DAY }, logs, [], [], '2026-08-25')).toMatchObject({ status: 'done', overdue: false });
  });

  it('progress text for each status passes the copy check', () => {
    const texts = [
      goalProgressText({ goalId: 'g', pct: 50, status: 'onTrack', startValue: 1, currentValue: 2, targetValue: 3, daysLeft: 10, overdue: false }),
      goalProgressText({ goalId: 'g', pct: 20, status: 'behind', startValue: 1, currentValue: 2, targetValue: 3, daysLeft: 10, overdue: false }),
      goalProgressText({ goalId: 'g', pct: 80, status: 'behind', startValue: 1, currentValue: 2, targetValue: 3, daysLeft: 0, overdue: true }),
      goalProgressText({ goalId: 'g', pct: 100, status: 'done', startValue: 1, currentValue: 3, targetValue: 3, daysLeft: 10, overdue: false }),
      goalProgressText({ goalId: 'g', pct: null, status: 'noData', startValue: null, currentValue: null, targetValue: 3, daysLeft: 10, overdue: false }),
    ];
    expect(texts).toEqual([
      '50% of the way, on track.',
      '20% of the way, behind the date.',
      '80% of the way, past the date.',
      'Reached.',
      'Nothing logged for it yet.',
    ]);
    for (const t of texts) expect(checkCopy(t)).toEqual({ ok: true, hits: [] });
  });
});
