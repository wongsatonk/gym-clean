import { h } from './dom';
import { icon } from './icons';
import { DEFAULT_DRILL_ORDER, type MaleVoice, type Rudeness, type VoiceConfig } from './voiceNames';
import './coachVoiceSettings.css';

/**
 * Settings → "Coach voice" (drill-sergeant design 2026-11-13): Calm / Drill sergeant, and for
 * the drill sergeant a 3-step rudeness, a male-voice picker and a "Test voice" button.
 * Stateless about storage: every pick goes to `onChange`; the caller saves it, calls
 * voice.configure() and update(). Test voice hands the current value to `onTest` (call it
 * inside the tap so iOS allows speech).
 */

export const RUDENESS_LEVELS: readonly { level: Rudeness; label: string }[] = [
  { level: 1, label: 'Tough' },
  { level: 2, label: 'Rude' },
  { level: 3, label: 'Savage' },
];

export const STRONG_LANGUAGE_NOTE = 'Savage: strong language.';

export const NO_MALE_VOICE_HINT =
  'No male voice on this phone. Add one in Settings → Accessibility → Spoken Content → Voices → English (try Daniel or Arthur).';

/** The picker's first row (voiceName null): names the voice the default order lands on. */
export function automaticLabel(voices: readonly MaleVoice[]): string {
  const auto = voices.find((v) => DEFAULT_DRILL_ORDER.includes(v.base));
  return auto ? `Automatic: ${auto.base}` : 'Automatic';
}

export type CoachVoiceSettingsOptions = {
  value: VoiceConfig;
  voices: readonly MaleVoice[];
  onChange: (next: VoiceConfig) => void;
  onTest: (value: VoiceConfig) => void;
};

export type CoachVoiceSettingsHandle = {
  el: HTMLElement;
  update(value: VoiceConfig, voices: readonly MaleVoice[]): void;
};

export function createCoachVoiceSettings(
  opts: CoachVoiceSettingsOptions,
): CoachVoiceSettingsHandle {
  let value: VoiceConfig = { ...opts.value };
  let voices: readonly MaleVoice[] = opts.voices;

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
        h('p', { class: 'cv-sub', id: 'cv-voice-label' }, 'Voice'),
        voices.length === 0
          ? h('p', { class: 'cv-hint', 'data-no-male-voice': true }, NO_MALE_VOICE_HINT)
          : h(
              'div',
              { class: 'cv-voices', role: 'group', 'aria-labelledby': 'cv-voice-label' },
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
            ),
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
