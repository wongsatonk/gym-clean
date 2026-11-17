// M12 slice 2 task 18: Settings → Reminders (route 'settings/reminders', Pro mood). Pure render:
// the stored `ReminderSettings`, the iPhone notification permission and callbacks in; element out.
// Main schedules / cancels through src/native/reminders.ts (core `reminderPlan`) and asks iPhone
// for permission on the first switch-on only. Nothing here is spoken.
//
// Three switches, all off by default (settings.ts `switchRow`: role="switch", On/Off as a word):
// the session reminder (with its time, a ≥ 56px time field shown while it's on), the missed-day
// nudge and the Sunday recap. Before any permission: "We'll ask iPhone for permission the first
// time you turn one on." Denied: a box that says reminders can't arrive and how to allow them.
// PWA: only the line "Reminders work in the iPhone app."
//
// e2e hooks: `main[data-screen="reminders"]`, `[data-reminders-pwa]`, `[data-setting=
// "reminder-session"|"reminder-missed-day"|"reminder-sunday-recap"]`, `[data-reminder-time]`
// (input type=time), `[data-reminders-ask]`, `[data-reminders-denied]`.
import type { ReminderKind, ReminderSettings } from '../../core/types';
import { backButton } from '../backButton';
import { h } from '../dom';
import { icon } from '../icons';
import { MISSED_DAY_TIME, SUNDAY_RECAP_TIME } from '../../core/reminders/schedule';
import { moodClass } from '../tokens';
import { switchRow } from './settings';
import './coachSettings.css';

export type NotificationPermission = 'unknown' | 'granted' | 'denied';

export type RemindersProps = {
  /** True inside the iPhone app. */
  native: boolean;
  settings: ReminderSettings;
  /** iPhone's notification permission for Gym Clean ('unknown': not asked yet). */
  permission: NotificationPermission;
  /** Locale for the fixed times in the copy (default: the phone's, as the time picker uses). */
  locale?: string | undefined;
};

export type RemindersActions = {
  onBack: () => void;
  /** A switch changed. Main asks for permission on the first switch-on. */
  onToggle: (kind: ReminderKind, on: boolean) => void;
  /** A new session time, "HH:MM" (24 h). */
  onTime: (time: string) => void;
};

export const REMINDERS_PWA_LINE = 'Reminders work in the iPhone app.';
export const REMINDERS_INTRO = 'All off until you turn one on. No weights, food or body numbers.';
export const REMINDERS_ASK = "We'll ask iPhone for permission the first time you turn one on.";
export const REMINDERS_DENIED = 'iPhone has notifications off for Gym Clean, so none will arrive.';
export const REMINDERS_DENIED_HOW =
  'To allow them: iPhone Settings > Notifications > Gym Clean > Allow Notifications.';

/**
 * "HH:MM" (24 h) in the phone's own clock: "09:00 AM" on a 12-hour iPhone, "09:00" on a 24-hour
 * one. The time picker (input type=time) follows the same setting, so the copy and the picker
 * always agree. Anything that isn't a time comes back unchanged.
 */
export function clockText(hhmm: string, locale?: string): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return hhmm;
  const d = new Date(2026, 0, 1, Number(m[1]), Number(m[2]));
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d);
}

/** The rows as this screen draws them (core's REMINDER_COPY is the notification text). */
export function reminderRows(
  locale?: string,
): Record<ReminderKind, { setting: string; label: string; note: string }> {
  return {
    session: {
      setting: 'reminder-session',
      label: 'Session reminder',
      note: 'On training days, at your time. Not once the session is done.',
    },
    missedDay: {
      setting: 'reminder-missed-day',
      label: 'Missed-day nudge',
      note: `The morning after a missed session, at ${clockText(MISSED_DAY_TIME, locale)}.`,
    },
    sundayRecap: {
      setting: 'reminder-sunday-recap',
      label: 'Sunday recap',
      note: `Sunday at ${clockText(SUNDAY_RECAP_TIME, locale)}: a nudge to look back at your week.`,
    },
  };
}

/** "HH:MM" 24 h, or null. */
export function validTime(v: string): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(v.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

export function remindersCopy(locale?: string): string[] {
  return [
    REMINDERS_PWA_LINE,
    REMINDERS_INTRO,
    REMINDERS_ASK,
    REMINDERS_DENIED,
    REMINDERS_DENIED_HOW,
    'Reminder time',
    ...Object.values(reminderRows(locale)).flatMap((c) => [c.label, c.note]),
  ];
}

function header(onBack: () => void): HTMLElement[] {
  return [
    h('header', { class: 'top-bar' }, backButton(onBack)),
    h('h1', { class: 'page-title' }, 'Reminders'),
  ];
}

function row(
  rows: ReturnType<typeof reminderRows>,
  kind: ReminderKind,
  on: boolean,
  a: RemindersActions,
  extra?: HTMLElement | null,
) {
  const c = rows[kind];
  const sw = switchRow(c.setting, c.label, on, (next) => a.onToggle(kind, next));
  sw.setAttribute('aria-describedby', `rem-note-${kind}`);
  return h(
    'li',
    { class: 'rem-row', 'data-reminder': kind },
    sw,
    h('p', { class: 'rem-note', id: `rem-note-${kind}` }, c.note),
    extra ?? null,
  );
}

export function remindersScreen(p: RemindersProps, a: RemindersActions): HTMLElement {
  const screen = (...kids: (HTMLElement | null)[]) =>
    h(
      'main',
      { class: `screen reminders settings ${moodClass('pro')}`, 'data-screen': 'reminders' },
      ...header(a.onBack),
      ...kids,
    );

  if (!p.native) {
    return screen(
      h(
        'p',
        { class: 'set-note rem-line', 'data-reminders-pwa': true },
        icon('help', 'sm'),
        h('span', {}, REMINDERS_PWA_LINE),
      ),
    );
  }

  const s = p.settings;
  const rows = reminderRows(p.locale);
  const time = h('input', {
    type: 'time',
    id: 'rem-time',
    class: 'rem-time-input',
    'data-reminder-time': true,
    value: s.session.time,
    step: 300,
  });
  time.value = s.session.time;
  time.addEventListener('change', () => {
    const t = validTime(time.value ?? '');
    if (t && t !== s.session.time) a.onTime(t);
  });
  const timeField = s.session.on
    ? h(
        'div',
        { class: 'rem-time' },
        h(
          'label',
          { class: 'rem-time-label', for: 'rem-time' },
          icon('clock', 'sm'),
          h('span', {}, 'Reminder time'),
        ),
        time,
      )
    : null;

  const permissionBox =
    p.permission === 'denied'
      ? h(
          'div',
          { class: 'rem-denied', 'data-reminders-denied': true, role: 'note' },
          h(
            'p',
            { class: 'rem-denied-head' },
            icon('close', 'sm'),
            h('span', {}, REMINDERS_DENIED),
          ),
          h('p', { class: 'set-note' }, REMINDERS_DENIED_HOW),
        )
      : p.permission === 'unknown'
        ? h(
            'p',
            { class: 'set-note rem-line', 'data-reminders-ask': true },
            icon('help', 'sm'),
            h('span', {}, REMINDERS_ASK),
          )
        : null;

  return screen(
    h('p', { class: 'set-note' }, REMINDERS_INTRO),
    permissionBox,
    h(
      'ul',
      { class: 'rem-list', 'aria-label': 'Reminders' },
      row(rows, 'session', s.session.on, a, timeField),
      row(rows, 'missedDay', s.missedDay.on, a),
      row(rows, 'sundayRecap', s.sundayRecap.on, a),
    ),
  );
}
