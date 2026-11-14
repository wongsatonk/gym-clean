// M4e Settings screen (Pro mood, docs/design/m4e-mix/settings.png). Pure render: values and
// callbacks in, element out. No DB access and no speech: app.ts saves each change, and passes
// in the parts that own their own state (coach voice, speaker check, audio test, developer log)
// as ready-made elements.
//
// Colour roles (mix README): selected/on is a white fill with dark text (switch tracks, the
// chosen accent, the chosen unit); other actions are neutral surface-2; nothing here is orange
// except the active tab marker.
//
// e2e hooks kept from the old inline Settings: `main.screen.settings`, `role="switch"` buttons
// with `data-setting` = spoken-count / coach-tips / hands-free and aria-checked, a "Camera test"
// button, the unit buttons named exactly "kg" / "lb" with aria-pressed, and the slots
// ([data-coach-voice], [data-voice-test], [data-audio-test], [data-devlog=panel]) in the same
// order. Changed: the "‹ Back" button is gone; the Today tab (`[data-tab="today"]`) leaves.
import type { Accent } from '../../core/types';
import type { Unit } from '../../core/units';
import { accentPicker } from '../accentPicker';
import { h } from '../dom';
import { icon, type IconName } from '../icons';
import { tabBar, type TabId } from '../tabBar';
import { moodClass } from '../tokens';

export type SettingsProps = {
  accent: Accent;
  spokenCount: boolean;
  coachTips: boolean;
  handsFree: boolean;
  unit: Unit;
  /** `createCoachVoiceSettings(...).el`. */
  coachVoice: HTMLElement;
  /** The speaker check (`voiceTest()` in app.ts, the `.voice-test` block). */
  speakerCheck: HTMLElement;
  /** `audioTestPanel()`. */
  audioTest: HTMLElement;
  /** `createDevLogPanel(...).el`. */
  devLog: HTMLElement;
};

export type SettingsActions = {
  /** A different accent was picked: save it (setAccent) and apply it (applyAccent). */
  onAccent: (accent: Accent) => void;
  onSpokenCount: (on: boolean) => void;
  onCoachTips: (on: boolean) => void;
  onHandsFree: (on: boolean) => void;
  /** A different unit was picked. */
  onUnit: (unit: Unit) => void;
  onCameraTest: () => void;
  onTab: (tab: TabId) => void;
};

/** The unit help line under the kg / lb choice. */
export function unitNote(unit: Unit): string {
  return unit === 'kg'
    ? 'Weights step by 2.5 kg.'
    : 'Weights step by 5 lb. Saved weights are converted, nothing is lost if you switch back.';
}

/** A section heading: icon + words (the icon is decorative). */
function sectionTitle(name: IconName, text: string, id: string): HTMLElement {
  return h('h2', { class: 'set-head', id }, icon(name, 'md'), h('span', {}, text));
}

/**
 * A settings row that toggles: the label, the state as a word (On/Off) and a drawn track.
 * The word and track are aria-hidden: role="switch" + aria-checked carry the state, and the
 * accessible name stays the label alone.
 */
export function switchRow(
  setting: string,
  label: string,
  on: boolean,
  onToggle: (next: boolean) => void,
): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      class: on ? 'switch-btn on' : 'switch-btn',
      role: 'switch',
      'aria-checked': on ? 'true' : 'false',
      'data-setting': setting,
      onclick: () => onToggle(!on),
    },
    h('span', { class: 'switch-label' }, label),
    h('span', { class: 'switch-state', 'aria-hidden': 'true' }, on ? 'On' : 'Off'),
  );
}

export function settingsScreen(props: SettingsProps, actions: SettingsActions): HTMLElement {
  const unitBtn = (u: Unit) => {
    const on = props.unit === u;
    return h(
      'button',
      {
        type: 'button',
        class: on ? 'seg-btn active' : 'seg-btn',
        'aria-pressed': on ? 'true' : 'false',
        'data-unit': u,
        onclick: () => {
          if (!on) actions.onUnit(u);
        },
      },
      on ? icon('check', 'sm') : null,
      h('span', {}, u),
    );
  };

  const section = (
    key: string,
    iconName: IconName,
    title: string,
    ...children: (HTMLElement | null)[]
  ) =>
    h(
      'section',
      { class: 'set-section', 'data-section': key, 'aria-labelledby': `set-${key}` },
      sectionTitle(iconName, title, `set-${key}`),
      ...children,
    );

  return h(
    'main',
    { class: `screen settings has-tabbar ${moodClass('pro')}`, 'data-screen': 'settings' },
    h('h1', { class: 'page-title' }, 'Settings'),
    section('accent', 'palette', 'Accent colour', accentPicker(props.accent, actions.onAccent)),
    section(
      'voice',
      'speaker',
      'Voice',
      switchRow('spoken-count', 'Count reps out loud', props.spokenCount, actions.onSpokenCount),
      switchRow('coach-tips', 'Coach tips after a set', props.coachTips, actions.onCoachTips),
      props.coachVoice,
      props.speakerCheck,
      props.audioTest,
    ),
    section(
      'camera',
      'camera',
      'Camera',
      switchRow('hands-free', 'Hands-free sets', props.handsFree, actions.onHandsFree),
      h(
        'button',
        { type: 'button', class: 'set-action', onclick: () => actions.onCameraTest() },
        'Camera test',
      ),
    ),
    section(
      'unit',
      'ruler',
      'Weight unit',
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-label': 'Weight unit' },
        unitBtn('kg'),
        unitBtn('lb'),
      ),
      h('p', { class: 'muted set-note' }, unitNote(props.unit)),
    ),
    section('devlog', 'bars', 'Developer log', props.devLog),
    tabBar('settings', actions.onTab),
  );
}
