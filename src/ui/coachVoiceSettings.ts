import { h } from './dom';
import { icon } from './icons';
import type { EnglishVoice, Rudeness, VoiceConfig } from './voiceNames';
import './coachVoiceSettings.css';

/**
 * Settings → "Coach voice" (drill-sergeant design 2026-11-13): Calm / Drill sergeant, and for
 * the drill sergeant a 3-step rudeness, a voice picker (any installed English voice, M13) and a
 * "Test voice" button.
 * Stateless about storage: every pick goes to `onChange`; the caller saves it, calls
 * voice.configure() and update(). Test voice hands the current value to `onTest` (call it
 * inside the tap so iOS allows speech).
 *
 * M13c task 10: the voice list is a disclosure. A ≥ 56px button reads "Voice" + the chosen voice
 * (`voiceSummary`) with a chevron; it starts collapsed every time the picker is created (not
 * remembered), opens/closes the list in place (aria-expanded / aria-controls), and a pick or
 * update() keeps it as it is. Calm / Drill sergeant, Rudeness and Test voice stay outside. No
 * voices → the hint shows directly, no button.
 *
 * e2e hooks: `[data-coach-voice]`, `[data-coach-persona]`, `[data-rudeness]`,
 * `[data-voice-toggle]` (aria-expanded), `[data-voice-summary]`, `#cv-voice-list`,
 * `[data-voice-name]`, `[data-no-voice]`, `[data-coach-voice-test]`.
 */

export const RUDENESS_LEVELS: readonly { level: Rudeness; label: string }[] = [
  { level: 1, label: 'Tough' },
  { level: 2, label: 'Rude' },
  { level: 3, label: 'Savage' },
];

export const STRONG_LANGUAGE_NOTE = 'Savage: strong language.';

export const NO_VOICE_HINT =
  'No English voice on this phone. Add one in Settings → Accessibility → Spoken Content → Voices → English.';

/**
 * The picker's first row (voiceName null): names the voice Automatic lands on. The list comes
 * from `listEnglishVoices`, whose first row is the one `pickDrillVoice` picks with nothing saved.
 */
export function automaticLabel(voices: readonly EnglishVoice[]): string {
  const auto = voices[0];
  return auto ? `Automatic: ${auto.base}` : 'Automatic';
}

/** The id of the collapsible voice list (the toggle's aria-controls). */
export const VOICE_LIST_ID = 'cv-voice-list';

/**
 * The disclosure row's summary: the picked voice's label, or the Automatic label when nothing
 * is picked or the saved voice isn't installed any more (Automatic is what speaks then).
 */
export function voiceSummary(voiceName: string | null, voices: readonly EnglishVoice[]): string {
  const picked = voiceName === null ? undefined : voices.find((v) => v.name === voiceName);
  return picked ? picked.label : automaticLabel(voices);
}

export type CoachVoiceSettingsOptions = {
  value: VoiceConfig;
  voices: readonly EnglishVoice[];
  onChange: (next: VoiceConfig) => void;
  onTest: (value: VoiceConfig) => void;
};

export type CoachVoiceSettingsHandle = {
  el: HTMLElement;
  update(value: VoiceConfig, voices: readonly EnglishVoice[]): void;
};

export function createCoachVoiceSettings(
  opts: CoachVoiceSettingsOptions,
): CoachVoiceSettingsHandle {
  let value: VoiceConfig = { ...opts.value };
  let voices: readonly EnglishVoice[] = opts.voices;
  /** The voice list's disclosure: collapsed on create, kept across picks and update(). */
  let open = false;

  const body = h('div', { class: 'cv-body' });
  const el = h(
    'section',
    { class: 'coach-voice', 'data-coach-voice': true, 'aria-labelledby': 'coach-voice-title' },
    h('h2', { class: 'field-label cv-title', id: 'coach-voice-title' }, 'Coach voice'),
    body,
  );

  const change = (patch: Partial<VoiceConfig>) => {
    value = { ...value, ...patch };
    opts.onChange({ ...value });
    render();
  };

  const choice = (
    label: string,
    on: boolean,
    attrs: Record<string, string>,
    onclick: () => void,
    extraClass = '',
  ) =>
    h(
      'button',
      {
        type: 'button',
        class: `cv-btn${extraClass}${on ? ' active' : ''}`,
        'aria-pressed': on ? 'true' : 'false',
        ...attrs,
        onclick,
      },
      // The chosen option: white fill plus a check, so it isn't shown by fill alone.
      on ? icon('check', 'sm') : null,
      h('span', { class: 'cv-btn-label' }, label),
    );

  function render(): void {
    const drill = value.persona === 'drill';
    const persona = h(
      'div',
      { class: 'cv-seg cv-seg-2', role: 'group', 'aria-label': 'Coach voice style' },
      choice('Calm', !drill, { 'data-coach-persona': 'calm' }, () => change({ persona: 'calm' })),
      choice('Drill sergeant', drill, { 'data-coach-persona': 'drill' }, () =>
        change({ persona: 'drill' }),
      ),
    );

    const parts: (HTMLElement | null)[] = [persona];
    if (drill) {
      parts.push(
        h('p', { class: 'cv-sub', id: 'cv-rudeness-label' }, 'Rudeness'),
        h(
          'div',
          { class: 'cv-seg cv-seg-3', role: 'group', 'aria-labelledby': 'cv-rudeness-label' },
          ...RUDENESS_LEVELS.map((r) =>
            choice(r.label, value.rudeness === r.level, { 'data-rudeness': String(r.level) }, () =>
              change({ rudeness: r.level }),
            ),
          ),
        ),
        h(
          'p',
          {
            class: `cv-note${value.rudeness === 3 ? ' cv-note-on' : ''}`,
            'data-strong-language': true,
          },
          STRONG_LANGUAGE_NOTE,
        ),
        ...voicePicker(),
      );
    }
    parts.push(
      h(
        'button',
        {
          type: 'button',
          class: 'cv-test',
          'data-coach-voice-test': true,
          onclick: () => opts.onTest({ ...value }),
        },
        'Test voice',
      ),
    );
    body.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
  }

  /** The "Voice" disclosure row and its list, or the iOS hint when no voice is installed. */
  function voicePicker(): HTMLElement[] {
    if (voices.length === 0)
      return [
        h('p', { class: 'cv-sub' }, 'Voice'),
        h('p', { class: 'cv-hint', 'data-no-voice': true }, NO_VOICE_HINT),
      ];
    const list = h(
      'div',
      {
        class: 'cv-voices',
        id: VOICE_LIST_ID,
        role: 'group',
        'aria-labelledby': 'cv-voice-label',
        hidden: !open,
      },
      choice(
        automaticLabel(voices),
        value.voiceName === null,
        { 'data-voice-name': '' },
        () => change({ voiceName: null }),
        ' cv-row',
      ),
      ...voices.map((v) =>
        choice(
          v.label,
          value.voiceName === v.name,
          { 'data-voice-name': v.name },
          () => change({ voiceName: v.name }),
          ' cv-row',
        ),
      ),
    );
    // Opens and closes in place (no re-render), so focus stays on the button.
    const toggle = h(
      'button',
      {
        type: 'button',
        class: 'cv-disclosure',
        'data-voice-toggle': true,
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': VOICE_LIST_ID,
        onclick: () => {
          open = !open;
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          if (open) list.removeAttribute('hidden');
          else list.setAttribute('hidden', '');
        },
      },
      h(
        'span',
        { class: 'cv-disc-txt' },
        h('span', { class: 'cv-disc-label', id: 'cv-voice-label' }, 'Voice'),
        ' ',
        h(
          'span',
          { class: 'cv-disc-summary', 'data-voice-summary': true },
          voiceSummary(value.voiceName, voices),
        ),
      ),
      h('span', { class: 'cv-disc-chev', 'aria-hidden': 'true' }, icon('back', 'md')),
    );
    return [toggle, list];
  }

  render();

  return {
    el,
    update(next, nextVoices) {
      value = { ...next };
      voices = nextVoices;
      render();
    },
  };
}
