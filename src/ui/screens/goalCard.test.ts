import { describe, expect, it } from 'vitest';
import type { Goal } from '../../core/types';
import { checkCopy } from '../../core/trainer/replies';
import {
  GOAL_PROMPT_BODY,
  GOAL_PROMPT_TITLE,
  GOAL_STATUS_LABEL,
  daysBetween,
  dueDate,
  dueText,
  goalCard,
  type GoalCardItem,
  type GoalCardProps,
} from './goalCard';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

const goal = (id: string, text: string, due: string): Goal => ({
  id,
  text,
  target: { kind: 'lift', ref: 'x', value: 40, reps: 8 },
  due,
  createdAt: 1,
});

const LIFT: GoalCardItem = {
  goal: goal('g1', 'Goblet squat 20 kg × 8', '2027-02-01'),
  pct: 62.4,
  status: 'onTrack',
  now: 'Now: 16 kg × 8',
};
const WAIST: GoalCardItem = {
  goal: goal('g2', 'Waist 78 cm', '2026-11-20'),
  pct: 30,
  status: 'behind',
};

function render(over: Partial<GoalCardProps> = {}) {
  const calls = { set: 0, open: 0 };
  const el = asFake(
    goalCard(
      { goals: [LIFT, WAIST], today: '2026-11-17', ...over },
      { onSetGoal: () => calls.set++, onOpen: () => calls.open++ },
    ),
  );
  return { el, calls };
}
const by = (el: FakeEl, attr: string, value?: string) =>
  el.find((e) => (value === undefined ? e.hasAttribute(attr) : e.getAttribute(attr) === value));

describe('Goal card', () => {
  it('no goal → the "Set your goal" prompt with one button', () => {
    const { el, calls } = render({ goals: [] });
    expect(el.getAttribute('data-goal-card')).toBe('prompt');
    expect(el.byTag('h2')[0]?.textContent).toBe(GOAL_PROMPT_TITLE);
    expect(el.textContent).toContain(GOAL_PROMPT_BODY);
    const buttons = el.byTag('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.hasAttribute('data-goal-set')).toBe(true);
    // M13: the forward mark is the shared arrow icon, not a typed "›".
    expect(buttons[0]?.textContent).toBe(GOAL_PROMPT_TITLE);
    expect(buttons[0]?.byTag('svg').map((s) => s.getAttribute('data-icon'))).toEqual([
      'arrow-right',
    ]);
    buttons[0]?.click();
    expect(calls).toEqual({ set: 1, open: 0 });
    expect(by(el, 'data-goal')).toHaveLength(0);
  });

  it('shows each goal: words, percent, status in words + icon, where it stands, due date', () => {
    const { el } = render();
    expect(el.getAttribute('data-goal-card')).toBe('goals');
    expect(el.byTag('h2')[0]?.textContent).toBe('Your goals');
    const rows = by(el, 'data-goal');
    expect(rows.map((r) => r.getAttribute('data-goal'))).toEqual(['g1', 'g2']);
    const [a, b] = rows as [FakeEl, FakeEl];
    expect(a.oneByClass('goal-text').textContent).toBe('Goblet squat 20 kg × 8');
    expect(by(a, 'data-goal-pct')[0]?.textContent).toBe('62%');
    expect(by(a, 'data-goal-status')[0]?.getAttribute('data-goal-status')).toBe('onTrack');
    expect(by(a, 'data-goal-status')[0]?.textContent).toBe('On track');
    expect(by(a, 'data-goal-status')[0]?.byTag('svg')).toHaveLength(1);
    expect(a.oneByClass('goal-now').textContent).toBe('Now: 16 kg × 8');
    expect(by(a, 'data-goal-due')[0]?.textContent).toBe('Due 1 Feb 2027 · 11 weeks left');
    expect(by(b, 'data-goal-status')[0]?.textContent).toBe('Behind');
    expect(by(b, 'data-goal-due')[0]?.textContent).toBe('Due 20 Nov 2026 · 3 days left');
    expect(b.byClass('goal-now')).toHaveLength(0);
  });

  it('the bar is a labelled progressbar whose fill matches the percent', () => {
    const { el } = render();
    const bar = el.find((e) => e.getAttribute('role') === 'progressbar')[0];
    expect(bar?.getAttribute('aria-valuenow')).toBe('62');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
    const name = el.find((e) => e.getAttribute('id') === bar?.getAttribute('aria-labelledby'))[0];
    expect(name?.textContent).toBe('Goblet squat 20 kg × 8');
    expect(bar?.oneByClass('goal-bar-fill').style.width).toBe('62%');
  });

  it('clamps the percent and shows at most two goals', () => {
    const { el } = render({
      goals: [
        { ...LIFT, pct: 140, status: 'done' },
        { ...WAIST, pct: -5 },
        { ...WAIST, goal: goal('g3', 'Third', '2027-01-01') },
      ],
    });
    expect(by(el, 'data-goal')).toHaveLength(2);
    expect(by(el, 'data-goal-pct').map((p) => p.textContent)).toEqual(['100%', '0%']);
    expect(by(el, 'data-goal-status')[0]?.textContent).toBe('Reached');
    const { el: nan } = render({ goals: [{ ...LIFT, pct: Number.NaN }] });
    expect(by(nan, 'data-goal-pct')[0]?.textContent).toBe('0%');
    expect(nan.byTag('h2')[0]?.textContent).toBe('Your goal');
  });

  it('Change opens the goal settings', () => {
    const { el, calls } = render();
    const btn = by(el, 'data-goal-open')[0];
    expect(btn?.textContent).toBe('Change');
    expect(btn?.getAttribute('aria-label')).toBe('Change your goals');
    btn?.click();
    expect(calls).toEqual({ set: 0, open: 1 });
  });

  it('date words', () => {
    expect(dueDate('2027-02-01')).toBe('1 Feb 2027');
    expect(dueDate('soon')).toBe('soon');
    expect(daysBetween('2026-11-17', '2026-11-20')).toBe(3);
    expect(daysBetween('2026-11-17', 'x')).toBeNull();
    expect(dueText('2026-11-17', '2026-11-17')).toBe('Due 17 Nov 2026 · today');
    expect(dueText('2026-11-18', '2026-11-17')).toBe('Due 18 Nov 2026 · 1 day left');
    expect(dueText('2026-11-14', '2026-11-17')).toBe('Due 14 Nov 2026 · 3 days over');
    expect(dueText('2026-12-01', '2026-11-17')).toBe('Due 1 Dec 2026 · 2 weeks left');
    expect(dueText('bad', '2026-11-17')).toBe('Due bad');
  });

  it('copy passes the coaching-words check', () => {
    for (const s of [GOAL_PROMPT_TITLE, GOAL_PROMPT_BODY, ...Object.values(GOAL_STATUS_LABEL)])
      expect(checkCopy(s), s).toEqual({ ok: true, hits: [] });
  });
});
