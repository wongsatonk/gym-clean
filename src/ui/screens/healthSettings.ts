// M11 task 9: Settings → Health (Pro mood, like My gym). Pure render: the health settings, whether
// the native bridge is there, and callbacks in; element out. No DB, no plugin calls: app.ts
// connects (GymHealth `requestRead`), saves each switch, runs "Read now" and deletes a type.
//
// Read-only (SPEC M11, route A): the copy says what the coach reads and what it does with it,
// never that the app writes to Health. Nothing here is spoken (it's a settings page).
//
// PWA (no native bridge): only the line "Health data works in the iPhone app." (SPEC M11).
//
// Turning a type off deletes what the app kept of it, so it is a deliberate two-step: tapping an
// "On" switch opens an inline "Turn off and delete" / "Keep it" choice in that row (no dialog),
// and only "Turn off and delete" calls back. Turning a type on is one tap.
//
// e2e hooks: `main[data-screen="health-settings"]`, `[data-health-pwa]`, `[data-health-connect]`,
// `[data-health-type="<type>"]` (role="switch", aria-checked), `[data-health-delete="<type>"]`,
// `[data-health-keep="<type>"]`, `[data-health-read-now]`, `[data-health-last-read]`.
import { HEALTH_TYPES, type HealthSettings, type HealthType } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { dateLabel } from './today';
import './healthSettings.css';

export type HealthSettingsProps = {
  /** True inside the iPhone app (Capacitor bridge + GymHealth plugin present). */
  native: boolean;
  /** He has gone through the Health permission sheet at least once. */
  connected: boolean;
  settings: HealthSettings;
  /** Current time (ms), for the "Last read" line. */
  now: number;
  /** A read (Connect or Read now) is running: the buttons are disabled and say so. */
  reading?: boolean | undefined;
};

export type HealthSettingsActions = {
  onBack: () => void;
  /** Connect: ask iOS for read access to the switched-on types, then read. */
  onConnect: () => void;
  /** A type was switched on. */
  onEnable: (type: HealthType) => void;
  /** "Turn off and delete" on a type: stop reading it and delete what the app kept of it. */
  onTurnOffAndDelete: (type: HealthType) => void;
  onReadNow: () => void;
};

export const HEALTH_PWA_LINE = 'Health data works in the iPhone app.';
export const HEALTH_INTRO =
  'The coach reads these from Apple Health to plan your training. Read only. Stays on this phone.';
export const HEALTH_CONNECT_NOTE =
  'iPhone asks which of these Gym Clean may read. You can change that later in the Health app.';
export const HEALTH_DELETE_NOTE = 'Stops reading it and deletes what Gym Clean kept of it.';

/** The row label and one line on what the coach does with it. */
export const HEALTH_TYPE_COPY: Record<HealthType, { label: string; explainer: string }> = {
  bodyMass: {
    label: 'Weight',
    explainer: 'Uses your weight from Health, like a scale app. It replaces a typed weigh-in.',
  },
  workouts: {
    label: 'Other workouts',
    explainer: 'Counts runs and sports from other apps in your weekly load.',
  },
  activeEnergy: {
    label: 'Active energy',
    explainer: 'Checks your Fuel activity level each week. It asks before changing it.',
  },
  sleep: {
    label: 'Sleep',
    explainer: 'A shorter night than usual can suggest a lighter day.',
  },
  restingHr: {
    label: 'Resting heart rate',
    explainer: 'Higher than your usual can suggest a lighter day.',
  },
  hrv: {
    label: 'Heart rate variability',
    explainer: 'Lower than your usual can suggest a lighter day.',
  },
  bodyFat: {
    label: 'Body fat',
    explainer: 'Shows your body fat trend next to your weight in Fuel.',
  },
  leanMass: {
    label: 'Lean mass',
    explainer: 'Shows your lean mass trend next to your weight in Fuel.',
  },
};

const p2 = (n: number) => String(n).padStart(2, '0');

/** "Last read: today 07:42" / "Last read: Fri 13 Nov 07:42" / "Not read yet". */
export function lastReadText(lastReadAt: number | undefined, now: number): string {
  if (lastReadAt === undefined) return 'Not read yet';
  const d = new Date(lastReadAt);
  const time = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return `Last read: ${sameDay ? 'today' : dateLabel(lastReadAt)} ${time}`;
}

/** Every string the screen can show (for the copy test). */
export function healthSettingsCopy(): string[] {
  return [
    HEALTH_PWA_LINE,
    HEALTH_INTRO,
    HEALTH_CONNECT_NOTE,
    HEALTH_DELETE_NOTE,
    'Health',
    'Connect to Apple Health',
    'Connecting…',
    'Read now',
    'Reading…',
    'Turn off and delete',
    'Keep it',
    'On',
    'Off',
    ...Object.values(HEALTH_TYPE_COPY).flatMap((c) => [c.label, c.explainer]),
  ];
}

function header(onBack: () => void): HTMLElement[] {
  return [
    h(
      'header',
      { class: 'top-bar' },
      h('button', { class: 'ghost-btn', type: 'button', onclick: onBack }, '‹ Back'),
    ),
    h('h1', { class: 'page-title' }, 'Health'),
  ];
}

function typeRow(
  type: HealthType,
  on: boolean,
  disabled: boolean,
  actions: HealthSettingsActions,
): HTMLElement {
  const copy = HEALTH_TYPE_COPY[type];
  const descId = `health-desc-${type}`;
  const confirm = h('div', { class: 'health-confirm', 'data-health-confirm': type, hidden: true });
  const sw = h(
    'button',
    {
      type: 'button',
      class: on ? 'switch-btn health-switch on' : 'switch-btn health-switch',
      role: 'switch',
      'aria-checked': on ? 'true' : 'false',
      'aria-describedby': descId,
      'data-health-type': type,
      disabled: disabled || undefined,
    },
    h('span', { class: 'switch-label' }, copy.label),
    h('span', { class: 'switch-state', 'aria-hidden': 'true' }, on ? 'On' : 'Off'),
  );
  let open = false;
  const close = () => {
    open = false;
    confirm.setAttribute('hidden', '');
    confirm.replaceChildren();
    sw.setAttribute('aria-expanded', 'false');
  };
  sw.addEventListener('click', () => {
    if (!on) {
      actions.onEnable(type);
      return;
    }
    // On → ask in place first: turning off deletes what was kept.
    if (open) return close();
    open = true;
    confirm.removeAttribute('hidden');
    sw.setAttribute('aria-expanded', 'true');
    const del = h(
      'button',
      {
        type: 'button',
        class: 'health-btn health-delete',
        'data-health-delete': type,
        onclick: () => actions.onTurnOffAndDelete(type),
      },
      icon('close', 'sm'),
      h('span', {}, 'Turn off and delete'),
    );
    confirm.replaceChildren(
      h('p', { class: 'health-confirm-note' }, HEALTH_DELETE_NOTE),
      h(
        'div',
        { class: 'health-confirm-actions' },
        del,
        h(
          'button',
          {
            type: 'button',
            class: 'health-btn',
            'data-health-keep': type,
            onclick: () => {
              close();
              sw.focus();
            },
          },
          'Keep it',
        ),
      ),
    );
    del.focus();
  });
  if (on) sw.setAttribute('aria-expanded', 'false');
  return h(
    'li',
    { class: 'health-row', 'data-health-row': type },
    sw,
    h('p', { class: 'health-explainer', id: descId }, copy.explainer),
    confirm,
  );
}

export function healthSettingsScreen(
  props: HealthSettingsProps,
  actions: HealthSettingsActions,
): HTMLElement {
  const screen = (...kids: (HTMLElement | null)[]) =>
    h(
      'main',
      {
        class: `screen health-settings ${moodClass('pro')}`,
        'data-screen': 'health-settings',
      },
      ...header(actions.onBack),
      ...kids,
    );

  if (!props.native) {
    return screen(
      h(
        'p',
        { class: 'set-note health-pwa', 'data-health-pwa': true },
        icon('help', 'sm'),
        h('span', {}, HEALTH_PWA_LINE),
      ),
    );
  }

  const reading = props.reading === true;
  const top = props.connected
    ? h(
        'section',
        { class: 'health-read', 'aria-label': 'Reading' },
        h(
          'p',
          { class: 'health-last-read', 'data-health-last-read': true, role: 'status' },
          reading ? 'Reading…' : lastReadText(props.settings.lastReadAt, props.now),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'health-btn health-read-now',
            'data-health-read-now': true,
            disabled: reading || undefined,
            onclick: () => actions.onReadNow(),
          },
          icon('trend', 'sm'),
          h('span', {}, reading ? 'Reading…' : 'Read now'),
        ),
      )
    : h(
        'section',
        { class: 'health-connect-box' },
        h(
          'button',
          {
            type: 'button',
            class: 'primary-btn cta-btn health-connect',
            'data-health-connect': true,
            disabled: reading || undefined,
            onclick: () => actions.onConnect(),
          },
          icon('plus', 'lg'),
          h('span', {}, reading ? 'Connecting…' : 'Connect to Apple Health'),
        ),
        h('p', { class: 'set-note muted' }, HEALTH_CONNECT_NOTE),
      );

  return screen(
    h('p', { class: 'set-note' }, HEALTH_INTRO),
    top,
    h(
      'ul',
      { class: 'health-list', 'aria-label': 'What the coach reads' },
      ...HEALTH_TYPES.map((t) => typeRow(t, props.settings.enabled[t], reading, actions)),
    ),
  );
}
