// M13 task 12: one first-launch permission page (camera / Apple Health / microphone / reminders).
// Pure render from PERMISSION_PAGES (src/data/onboarding.ts): explain first, then the one button.
// The page never asks the system itself: the action button calls onAllow(permission) and the
// caller does what the action kind says (Decision "M13 Published look"):
//   ask      → camera: the system prompt, on this tap
//   connect  → Apple Health: the M11 connect flow
//   reminder → switch the session reminder on (that switch asks for notifications)
//   none     → mic: no button; the phone asks on the first hold of the mic
// The shell (welcome.ts) places `allow` as the primary button and `notNow` next to Back.
import type { OnboardingPermission } from '../../core/onboarding';
import { PERMISSION_PAGES } from '../../data/onboarding';
import { doneMark } from '../backButton';
import { h } from '../dom';
import { icon, type IconName } from '../icons';

/** Decorative icon per page (from the project's own set). */
export const PERMISSION_ICON: Record<OnboardingPermission, IconName> = {
  camera: 'camera',
  health: 'trend',
  mic: 'chat',
  notifications: 'clock',
};

export type PermissionPageProps = {
  permission: OnboardingPermission;
  /** Already allowed / connected / switched on: shows "Allowed", no ask. */
  granted?: boolean | undefined;
  /** id for the title (the dialog's aria-labelledby). */
  titleId: string;
};

export type PermissionPageActions = {
  onAllow: (permission: OnboardingPermission) => void;
  onNotNow: (permission: OnboardingPermission) => void;
};

export type PermissionPageParts = {
  /** Icon, title, why, and the mic note or the "Allowed" mark. */
  body: HTMLElement;
  /** The action button; null for the mic page and once allowed. */
  allow: HTMLElement | null;
  /** "Not now"; null whenever `allow` is. */
  notNow: HTMLElement | null;
};

export function permissionPage(
  props: PermissionPageProps,
  actions: PermissionPageActions,
): PermissionPageParts {
  const { permission } = props;
  const copy = PERMISSION_PAGES[permission];
  const action = copy.action;
  const granted = props.granted === true;

  const body = h(
    'section',
    { class: 'ob-perm', 'data-permission': permission },
    h('div', { class: 'ob-icon' }, icon(PERMISSION_ICON[permission], 'lg')),
    h('h2', { class: 'ob-title', id: props.titleId, 'data-ob': 'title' }, copy.title),
    h('p', { class: 'ob-text', 'data-ob': 'why' }, copy.why),
    action.kind === 'none' ? h('p', { class: 'ob-note', 'data-ob': 'note' }, action.note) : null,
    granted && action.kind !== 'none'
      ? h('div', { class: 'ob-granted', 'data-ob': 'granted' }, doneMark('Allowed'))
      : null,
  );

  if (action.kind === 'none' || granted) return { body, allow: null, notNow: null };

  const allow = h(
    'button',
    {
      type: 'button',
      class: 'ob-primary cta-btn',
      'data-ob': 'primary',
      'data-action-kind': action.kind,
      onclick: () => actions.onAllow(permission),
    },
    action.label,
  );
  const notNow = h(
    'button',
    {
      type: 'button',
      class: 'ob-not-now',
      'data-ob': 'not-now',
      onclick: () => actions.onNotNow(permission),
    },
    copy.notNow,
  );
  return { body, allow, notNow };
}
