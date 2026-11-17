// M12 slice 2 task 18: Settings → Coach (route 'settings/coach', Pro mood, like Health). Pure
// render: which brain answers (and why), how to turn on Apple Intelligence, and Speak replies.
// No plugin calls: main reads the Apple brain's `status()` / availability and saves
// `coach.speakReplies`. Nothing here is spoken (a settings page).
//
// "Who answers": On-device AI (Apple's model on this iPhone) or Quick replies (the rules brain:
// set phrases and the chips), with one plain line why and, where he can fix it, how.
// Speak replies: Mic only (default) / Always / Off, a segmented choice with aria-pressed and a
// check mark on the chosen one (never colour alone) and a line on what it does. Never in a set.
//
// e2e hooks: `main[data-screen="coach-settings"]`, `[data-brain-status="apple"|"rules"|"unknown"]`
// (+ `data-brain-reason`), `[data-brain-howto]`, `[data-brain-recheck]`,
// `[data-speak-replies=<mic|always|off>]` (aria-pressed), `[data-speak-note]`.
import type { BrainUnavailableReason, CoachSettings } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import './coachSettings.css';

export type SpeakReplies = NonNullable<CoachSettings['speakReplies']>;

/** 'unknown': the check itself failed (plugin error / timeout) or hasn't run yet — not a real
 * unavailable reason, so Check again stays on (only off while checking). */
export type BrainStatusView =
  { brain: 'apple' } | { brain: 'rules'; reason: BrainUnavailableReason } | { brain: 'unknown' };

export type CoachSettingsProps = {
  status: BrainStatusView;
  /** Stored `coach.speakReplies`; undefined → 'mic' (the default). */
  speakReplies?: SpeakReplies | undefined;
  /** A status check is running (after Check again). */
  checking?: boolean | undefined;
};

export type CoachSettingsActions = {
  onBack: () => void;
  onSpeakReplies: (v: SpeakReplies) => void;
  /** Read Apple Intelligence's status again (after he turned it on). Omit → no button. */
  onRecheck?: (() => void) | undefined;
};

export const APPLE_TITLE = 'On-device AI';
export const APPLE_LINE =
  'Apple Intelligence on this iPhone answers your questions. Nothing leaves the phone.';
export const RULES_TITLE = 'Quick replies';
export const RULES_LINE = 'Quick replies know set phrases and the chips. They work everywhere.';
export const UNKNOWN_LINE =
  "Couldn't check Apple Intelligence just now. Quick replies answer until it can.";

/** Why quick replies answer, and how to change it (null: nothing he can do). */
export const BRAIN_REASON_COPY: Record<
  BrainUnavailableReason,
  { why: string; how: string | null }
> = {
  appleIntelligenceNotEnabled: {
    why: 'Apple Intelligence is off.',
    how: 'Turn it on in iPhone Settings > Apple Intelligence & Siri, then tap Check again.',
  },
  modelNotReady: {
    why: 'Apple Intelligence is still downloading.',
    how: 'Keep the iPhone on Wi-Fi and charging. Quick replies until it is ready.',
  },
  deviceNotEligible: {
    why: "This iPhone can't run Apple Intelligence.",
    how: null,
  },
  unsupported: {
    why: "Apple's on-device model isn't available on this iPhone.",
    how: 'Update iOS in iPhone Settings > General, then tap Check again.',
  },
  notNative: {
    why: 'On-device AI works in the iPhone app.',
    how: null,
  },
};

export const SPEAK_OPTIONS: readonly { id: SpeakReplies; label: string; note: string }[] = [
  { id: 'mic', label: 'Mic only', note: 'Speaks a reply when you asked with the mic.' },
  { id: 'always', label: 'Always', note: 'Speaks every reply.' },
  { id: 'off', label: 'Off', note: 'Replies stay on screen only.' },
];
export const SPEAK_SET_NOTE = 'Never during a set.';

/** Every string the screen can show (copy test). */
export function coachSettingsCopy(): string[] {
  return [
    APPLE_TITLE,
    APPLE_LINE,
    RULES_TITLE,
    RULES_LINE,
    UNKNOWN_LINE,
    SPEAK_SET_NOTE,
    ...Object.values(BRAIN_REASON_COPY).flatMap((c) => [c.why, ...(c.how ? [c.how] : [])]),
    ...SPEAK_OPTIONS.flatMap((o) => [o.label, o.note]),
  ];
}

function statusCard(p: CoachSettingsProps, a: CoachSettingsActions): HTMLElement {
  const s = p.status;
  if (s.brain === 'apple') {
    return h(
      'section',
      { class: 'brain-card', 'data-brain-status': 'apple', 'aria-labelledby': 'brain-who' },
      h('h2', { class: 'brain-who-head', id: 'brain-who' }, 'Who answers'),
      h('p', { class: 'brain-name' }, icon('check', 'md'), h('span', {}, APPLE_TITLE)),
      h('p', { class: 'set-note' }, APPLE_LINE),
      h('p', { class: 'set-note muted' }, 'Changes still wait for your tap on Apply.'),
    );
  }
  const unknown = s.brain === 'unknown';
  const copy = unknown ? { why: UNKNOWN_LINE, how: null } : BRAIN_REASON_COPY[s.reason];
  const checking = p.checking === true;
  const recheck =
    a.onRecheck && (unknown || copy.how)
      ? h(
          'button',
          {
            type: 'button',
            class: 'set-action brain-recheck',
            'data-brain-recheck': true,
            disabled: checking || undefined,
            onclick: () => a.onRecheck?.(),
          },
          icon('flip', 'sm'),
          h('span', {}, checking ? 'Checking…' : 'Check again'),
        )
      : null;
  return h(
    'section',
    {
      class: 'brain-card',
      'data-brain-status': unknown ? 'unknown' : 'rules',
      'data-brain-reason': unknown ? undefined : s.reason,
      'aria-labelledby': 'brain-who',
    },
    h('h2', { class: 'brain-who-head', id: 'brain-who' }, 'Who answers'),
    h('p', { class: 'brain-name' }, icon('chat', 'md'), h('span', {}, RULES_TITLE)),
    h('p', { class: 'brain-why', 'data-brain-why': true }, copy.why),
    copy.how
      ? h(
          'p',
          { class: 'brain-howto', 'data-brain-howto': true },
          icon('help', 'sm'),
          h('span', {}, copy.how),
        )
      : null,
    h('p', { class: 'set-note muted' }, RULES_LINE),
    recheck,
  );
}

export function coachSettingsScreen(p: CoachSettingsProps, a: CoachSettingsActions): HTMLElement {
  const speak = p.speakReplies ?? 'mic';
  const chosen = SPEAK_OPTIONS.find((o) => o.id === speak) ?? SPEAK_OPTIONS[0];
  const seg = SPEAK_OPTIONS.map((o) => {
    const on = o.id === speak;
    return h(
      'button',
      {
        type: 'button',
        class: on ? 'seg-btn active' : 'seg-btn',
        'aria-pressed': on ? 'true' : 'false',
        'data-speak-replies': o.id,
        onclick: () => {
          if (!on) a.onSpeakReplies(o.id);
        },
      },
      on ? icon('check', 'sm') : null,
      h('span', {}, o.label),
    );
  });
  return h(
    'main',
    {
      class: `screen coach-settings settings ${moodClass('pro')}`,
      'data-screen': 'coach-settings',
    },
    h(
      'header',
      { class: 'top-bar' },
      h('button', { class: 'ghost-btn', type: 'button', onclick: a.onBack }, '‹ Back'),
    ),
    h('h1', { class: 'page-title' }, 'Coach'),
    statusCard(p, a),
    h(
      'section',
      { class: 'set-section', 'data-section': 'speak-replies', 'aria-labelledby': 'speak-head' },
      h(
        'h2',
        { class: 'set-head', id: 'speak-head' },
        icon('speaker', 'md'),
        h('span', {}, 'Speak replies'),
      ),
      h('div', { class: 'segmented seg-3', role: 'group', 'aria-label': 'Speak replies' }, ...seg),
      h(
        'p',
        { class: 'set-note', 'data-speak-note': speak },
        speak === 'off' ? (chosen?.note ?? '') : `${chosen?.note ?? ''} ${SPEAK_SET_NOTE}`,
      ),
    ),
  );
}
