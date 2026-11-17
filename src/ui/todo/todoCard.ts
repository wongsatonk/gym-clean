// M12 slice 1c task 9: the Today to-do card (SPEC M12 "To-do guides" goal 2).
// "To-dos: 6 of 12 done", the next topic's title, and "Re-sign in N days" when the iPhone app's
// free 7-day signing has ≤ 2 days left. The whole card is one ≥ 56px button that opens the
// to-do list. Today places it below the hero (Start), so it never pushes Start down.
//
// Props in (core `todoSummary(...)` + the next open topic + `resignDaysLeft(...)`), one callback
// out. Returns null when `visible` is false (every topic for this platform done or skipped), so
// Today simply leaves it out. Shown, never spoken; Today is never on screen mid-set.
//
// e2e hooks: `[data-todo-card]` (the button), `[data-todo-count]`, `[data-todo-next]`,
// `[data-todo-resign]`.
import { h } from '../dom';
import { icon } from '../icons';
import './todos.css';

/** Re-sign line shows at this many days left or fewer (SPEC: "when ≤ 2 days are left"). */
export const RESIGN_WARN_DAYS = 2;

export type TodoCardProps = {
  /** Topics done or skipped on this platform. */
  done: number;
  /** Topics on this platform (native-only topics are left out on the web). */
  total: number;
  /** Core `todoSummary(...).visible`: false when everything is done → no card. */
  visible: boolean;
  /** Title of the next open topic, e.g. "Coach tab + Calendar". */
  nextTitle?: string | null | undefined;
  /** Whole days left before the 7-day re-sign (iPhone app only); null/undefined on the web. */
  resignDaysLeft?: number | null | undefined;
};

export type TodoCardActions = { onOpen: () => void };

/** "To-dos: 6 of 12 done". */
export function todoCountText(done: number, total: number): string {
  return `To-dos: ${done} of ${total} done`;
}

/** "Re-sign in 2 days" / "Re-sign in 1 day" / "Re-sign today", or null when not due yet. */
export function resignText(daysLeft: number | null | undefined): string | null {
  if (daysLeft === null || daysLeft === undefined || daysLeft > RESIGN_WARN_DAYS) return null;
  if (daysLeft <= 0) return 'Re-sign today';
  return `Re-sign in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
}

export function todoCard(
  props: TodoCardProps | null | undefined,
  actions: TodoCardActions,
): HTMLElement | null {
  if (!props?.visible) return null;
  const resign = resignText(props.resignDaysLeft);
  return h(
    'button',
    {
      type: 'button',
      class: resign ? 'todo-card todo-card-warn' : 'todo-card',
      'data-todo-card': true,
      onclick: () => actions.onOpen(),
    },
    h('span', { class: 'todo-card-icon', 'aria-hidden': 'true' }, icon('list', 'md')),
    h(
      'span',
      { class: 'todo-card-text' },
      h(
        'strong',
        { class: 'todo-card-count', 'data-todo-count': true },
        todoCountText(props.done, props.total),
      ),
      props.nextTitle
        ? h('span', { class: 'todo-card-next', 'data-todo-next': true }, `Next: ${props.nextTitle}`)
        : null,
      resign
        ? h(
            'span',
            { class: 'todo-card-resign', 'data-todo-resign': true },
            icon('clock', 'sm'),
            h('span', {}, resign),
          )
        : null,
    ),
    h('span', { class: 'todo-card-go', 'aria-hidden': 'true' }, icon('arrow-right', 'md')),
  );
}
