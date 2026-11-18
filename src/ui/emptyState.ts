// M13 task 22: one shape for every empty state (SPEC M13 Goal 5 "Empty states"): one small
// original icon in a round badge, one line, one action. Props in, callbacks out; no copy of its
// own (each screen passes its line, all passing `checkCopy`).
//
// The action is either one button (`primary` makes it the screen's filled CTA, e.g. Fuel's
// "Set up targets" until targets exist; otherwise the quiet outline look) or an element the screen
// builds itself (the Coach thread's starter chips, one group of suggestions). Omitted: no action.
//
// e2e hooks: `[data-empty-state=<kind>]`, `.empty-state-line`, `.empty-state-btn`.
import { h } from './dom';
import { icon, type IconName } from './icons';
import './emptyState.css';

type Hooks = Record<string, string | boolean>;

export type EmptyStateAction = {
  label: string;
  onClick: () => void;
  /** The screen's one filled CTA (72px orange). Default: the outline secondary look. */
  primary?: boolean;
  /** An icon before the words (decorative). */
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
  const look = a.primary ? 'primary-btn cta-btn' : 'ghost-btn wide-btn';
  return h(
    'button',
    {
      type: 'button',
      ...a.hooks,
      class: `${look} empty-state-btn`,
      onclick: () => a.onClick(),
    },
    a.icon ? icon(a.icon, a.primary ? 'lg' : 'md') : null,
    h('span', {}, a.label),
  );
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
