// M13 task 22: one shape for every empty state (SPEC M13 Goal 5 "Empty states"): one small
// original icon in a round badge, one line, one action. Props in, callbacks out; no copy of its
// own (each screen passes its line, all passing `checkCopy`).
//
// The action is either one button or an element the screen builds itself (the Coach thread's
// starter chips, one group of suggestions). Omitted: no action.
// M13d task 40a (SPEC M13d Goal 7): the button is the shared round icon button. `primary` makes
// it the screen's one main action (72px orange circle, the word beside it, on the shared pill
// track, chromeButtons.css);
// otherwise a secondary 56px circle with the word under it. Either way the whole row stays its
// tap area (as wide as the bar it replaced). No icon given: the forward arrow.
//
// e2e hooks: `[data-empty-state=<kind>]`, `.empty-state-line`, `.empty-state-btn`.
import { h } from './dom';
import { iconButton } from './iconButton';
import { icon, type IconName } from './icons';
import './chromeButtons.css';
import './emptyState.css';

type Hooks = Record<string, string | boolean>;

export type EmptyStateAction = {
  label: string;
  onClick: () => void;
  /** The screen's one main action (72px orange circle). Default: a secondary circle. */
  primary?: boolean;
  /** The circle's icon (decorative). Default: the forward arrow. */
  icon?: IconName;
  /** Extra attributes on the button (e2e hooks such as `data-setup`). */
  hooks?: Hooks;
};

export type EmptyStateProps = {
  /** `data-empty-state` value. */
  kind: string;
  icon: IconName;
  /** The one line. */
  line: string;
  action?: EmptyStateAction | HTMLElement | null;
  /** Extra class(es) on the root (a screen's own layout hook). */
  class?: string;
  /** Extra class(es) on the line. */
  lineClass?: string;
  /** Extra attributes on the root (older e2e hooks). Keep live-region roles off the root when
   * it holds a button: put them on the line (`lineHooks`). */
  hooks?: Hooks;
  /** Extra attributes on the line (e.g. role="status"). */
  lineHooks?: Hooks;
};

function actionButton(a: EmptyStateAction): HTMLElement {
  return iconButton({
    icon: a.icon ?? 'arrow-right',
    label: a.label,
    variant: a.primary ? 'main' : 'secondary',
    wideHit: true,
    class: a.primary ? 'empty-state-btn chrome-pill' : 'empty-state-btn',
    ...(a.hooks ? { hooks: a.hooks } : {}),
    onClick: () => a.onClick(),
  });
}

export function emptyState(p: EmptyStateProps): HTMLElement {
  const action = p.action
    ? 'onClick' in p.action
      ? actionButton(p.action)
      : (p.action as HTMLElement)
    : null;
  return h(
    'div',
    {
      ...p.hooks,
      class: ['empty-state', p.class].filter(Boolean).join(' '),
      'data-empty-state': p.kind,
    },
    h('span', { class: 'empty-state-art', 'aria-hidden': 'true' }, icon(p.icon, 'lg')),
    h(
      'p',
      { ...p.lineHooks, class: ['empty-state-line', p.lineClass].filter(Boolean).join(' ') },
      p.line,
    ),
    action,
  );
}
