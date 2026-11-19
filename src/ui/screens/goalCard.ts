// M12 slice 1b task 25: the Goal card on Today (SPEC M12 trainer kit item 3).
// 1–2 goals, each with its words, a progress bar (percent in words too), on track / behind, and
// the due date. No goal yet → a "Set your goal" prompt that opens the intake.
//
// Pure render: goals + their progress (core `goalProgress`) and callbacks in, element out. No
// DB, no speech (Today only, never in a workout). Status is words + an icon, never colour alone.
//
// e2e hooks: `[data-goal-card]` = goals / prompt, `[data-goal=<id>]`, `[data-goal-pct]`,
// `[data-goal-status]` = onTrack / behind / done, `[data-goal-due]`, `[data-goal-open]`,
// `[data-goal-set]`.
// M13d task 40c: Set your goal / Change are round iconButtons, the word beside the circle on a
// full-width row (Set your goal ringed orange as the card's suggested action; only Start is filled).
import type { Goal } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { iconButton } from '../iconButton';
import '../intake/intake.css';
import './mainPill.css';
import './goalCard.css';

export type GoalStatus = 'onTrack' | 'behind' | 'done';

export type GoalCardItem = {
  goal: Goal;
  /** 0–100 (clamped here). */
  pct: number;
  status: GoalStatus;
  /** Where it stands now in plain words, e.g. "Now: 52.5 kg × 8". Optional. */
  now?: string | undefined;
};

export type GoalCardProps = {
  /** Open goals with progress; only the first GOAL_CARD_MAX are shown. */
  goals: readonly GoalCardItem[];
  /** Local date YYYY-MM-DD. */
  today: string;
};

export type GoalCardActions = {
  /** "Set your goal" (no goal yet): opens the intake. */
  onSetGoal: () => void;
  /** "Change" on the card: opens Settings → Your goal. */
  onOpen: () => void;
};

export const GOAL_CARD_MAX = 2;
export const GOAL_PROMPT_TITLE = 'Set your goal';
export const GOAL_PROMPT_BODY =
  'Five quick questions. The coach builds your plan around the answers.';

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  onTrack: 'On track',
  behind: 'Behind',
  done: 'Reached',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Days from `from` to `to` (both YYYY-MM-DD), or null if either is not a date. */
export function daysBetween(from: string, to: string): number | null {
  const parse = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const a = parse(from);
  const b = parse(to);
  return a === null || b === null ? null : Math.round((b - a) / 86_400_000);
}

/** "2027-02-01" → "1 Feb 2027" (the raw text if it is not a date). */
export function dueDate(due: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : due;
}

/** "Due 1 Feb 2027 · 11 weeks left" / "· 5 days left" / "· today" / "· 3 days over". */
export function dueText(due: string, today: string): string {
  const base = `Due ${dueDate(due)}`;
  const d = daysBetween(today, due);
  if (d === null) return base;
  if (d === 0) return `${base} · today`;
  const n = Math.abs(d);
  const span = n >= 14 ? `${Math.round(n / 7)} weeks` : n === 1 ? '1 day' : `${n} days`;
  return `${base} · ${span} ${d > 0 ? 'left' : 'over'}`;
}

const clampPct = (pct: number): number =>
  Number.isFinite(pct) ? Math.round(Math.min(100, Math.max(0, pct))) : 0;

function goalRow(item: GoalCardItem, today: string): HTMLElement {
  const pct = clampPct(item.pct);
  const nameId = `goal-${item.goal.id}-name`;
  const fill = h('span', { class: 'goal-bar-fill' });
  fill.style.width = `${pct}%`;
  return h(
    'li',
    { class: 'goal-row', 'data-goal': item.goal.id },
    h('p', { class: 'goal-text', id: nameId }, item.goal.text),
    h(
      'div',
      {
        class: 'goal-bar',
        role: 'progressbar',
        'aria-labelledby': nameId,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': pct,
      },
      fill,
    ),
    h(
      'p',
      { class: 'goal-meta' },
      h('span', { class: 'goal-pct', 'data-goal-pct': true }, `${pct}%`),
      h(
        'span',
        { class: `goal-status ${item.status}`, 'data-goal-status': item.status },
        icon(
          item.status === 'behind' ? 'clock' : item.status === 'done' ? 'trophy' : 'check',
          'sm',
        ),
        h('span', {}, GOAL_STATUS_LABEL[item.status]),
      ),
    ),
    item.now ? h('p', { class: 'goal-now' }, item.now) : null,
    h('p', { class: 'muted goal-due', 'data-goal-due': true }, dueText(item.goal.due, today)),
  );
}

export function goalCard(props: GoalCardProps, actions: GoalCardActions): HTMLElement {
  const goals = props.goals.slice(0, GOAL_CARD_MAX);
  if (goals.length === 0)
    return h(
      'section',
      { class: 'goal-card prompt', 'data-goal-card': 'prompt', 'aria-labelledby': 'goal-card-h' },
      h(
        'h2',
        { class: 'goal-card-title', id: 'goal-card-h' },
        icon('flag', 'md'),
        h('span', {}, GOAL_PROMPT_TITLE),
      ),
      h('p', { class: 'goal-prompt-body' }, GOAL_PROMPT_BODY),
      iconButton({
        icon: 'arrow-right',
        label: GOAL_PROMPT_TITLE,
        labelAt: 'beside',
        wideHit: true,
        class: 'goal-card-act card-cta',
        hooks: { 'data-goal-set': true },
        onClick: () => actions.onSetGoal(),
      }),
    );
  return h(
    'section',
    { class: 'goal-card', 'data-goal-card': 'goals', 'aria-labelledby': 'goal-card-h' },
    h(
      'h2',
      { class: 'goal-card-title', id: 'goal-card-h' },
      icon('flag', 'md'),
      h('span', {}, goals.length === 1 ? 'Your goal' : 'Your goals'),
    ),
    h('ul', { class: 'goal-list' }, ...goals.map((g) => goalRow(g, props.today))),
    iconButton({
      icon: 'pencil',
      label: 'Change',
      labelAt: 'beside',
      wideHit: true,
      ariaLabel: goals.length === 1 ? 'Change your goal' : 'Change your goals',
      class: 'goal-card-act',
      hooks: { 'data-goal-open': true },
      onClick: () => actions.onOpen(),
    }),
  );
}
