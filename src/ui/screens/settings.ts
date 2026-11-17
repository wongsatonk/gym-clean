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
//
// M12 slice 1b task 26: "Your goal" (the intake answers in one line + re-run, the standing
// go-easy list with Remove; each removal is a proposal the caller shows, nothing is removed
// here) and "Progress photos" (a switch, off by default, + Open while on). Hooks:
// `[data-section="goal"]`, `[data-goal-summary]`, `[data-intake-open]`, `[data-easy-on=<area>]`,
// `[data-easy-remove=<area>]`, `[data-section="progress-photos"]`,
// `[data-setting="progress-photos"]`, `[data-progress-photos-open]`.
import type { Accent, BodyArea, Intake } from '../../core/types';
import type { Unit } from '../../core/units';
import { CREDIT, versionLabel } from '../../core/version';
import { accentPicker } from '../accentPicker';
import { h } from '../dom';
import { icon, type IconName } from '../icons';
import { AREA_LABEL, BODY_AREAS, intakeSummary } from '../intake/intake';
import { PHOTOS_PRIVACY } from '../photos/progressPhotos';
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
  /** M7: `nutritionSettings(...)` (src/ui/fuel). Omitted → no Nutrition section. */
  nutrition?: HTMLElement | null | undefined;
  /** M7b: `createFoodPhotosSettings(...).el` (./foodPhotos). Omitted → no Food photos section. */
  foodPhotos?: HTMLElement | null | undefined;
  /** M9 B2: `backupPanel(...)`. Omitted → no Backup section. */
  backup?: HTMLElement | null | undefined;
  /** M12 slice 1c: the About version line. Default `versionLabel()`. */
  version?: string | undefined;
  /** M12 slice 1b: the stored intake answers (settings 'intake'), null when never answered. */
  intake?: Intake | null | undefined;
  /** M12 slice 1b: the standing go-easy list (`TrainerState.easyOn`). */
  easyOn?: readonly BodyArea[] | undefined;
  /** M12 slice 1b: is the Progress photos switch on? Default off. */
  progressPhotos?: boolean | undefined;
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
  /** M10: opens Settings → Plan changes. Omitted → no Plan section. */
  onPlanChanges?: (() => void) | undefined;
  /** M10e: opens Settings → My gym. Omitted → no Gym section. */
  onMyGym?: (() => void) | undefined;
  /** M11: opens Settings → Health. Omitted → no Health section. */
  onHealth?: (() => void) | undefined;
  /** M12 slice 1c: opens the To-do list. With onWhatsNew: the To-dos section. */
  onTodos?: (() => void) | undefined;
  /** M12 slice 1c: replays this release's What's New tour. */
  onWhatsNew?: (() => void) | undefined;
  /** M12 slice 1b: opens the intake again (route 'settings/goal'). Omitted → no goal section. */
  onIntake?: (() => void) | undefined;
  /**
   * M12 slice 1b: Remove on one go-easy area. The caller offers it as a proposal (Apply / Undo);
   * the row stays until the list in props changes. Omitted → the list has no Remove buttons.
   */
  onEasyOnRemove?: ((area: BodyArea) => void) | undefined;
  /** M12 slice 1b: the Progress photos switch. Omitted → no Progress photos section. */
  onProgressPhotos?: ((on: boolean) => void) | undefined;
  /** M12 slice 1b: opens Settings → Progress photos (shown only while the switch is on). */
  onProgressPhotosOpen?: (() => void) | undefined;
};

export const GOAL_NOT_SET = 'Not set yet.';
export const GOAL_SET_LABEL = 'Set your goal';
export const GOAL_RERUN_LABEL = 'Change your goal & answers';
export const EASY_ON_HEAD = 'Go easy on';
export const EASY_ON_EMPTY = 'Nothing on the list.';
export const EASY_ON_NOTE =
  'The coach keeps the load light on these. Remove shows the change first; you choose Apply.';

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

/** M12 slice 1c: "To-dos" + "What's new" rows (each only when its callback is set). */
function todosSection(
  actions: SettingsActions,
  section: (
    key: string,
    iconName: IconName,
    title: string,
    ...c: (HTMLElement | null)[]
  ) => HTMLElement,
): HTMLElement | null {
  if (!actions.onTodos && !actions.onWhatsNew) return null;
  const row = (hook: string, label: string, onTap: (() => void) | undefined) =>
    onTap
      ? h(
          'button',
          { type: 'button', class: 'set-action', [hook]: true, onclick: () => onTap() },
          label,
        )
      : null;
  return section(
    'todos',
    'list',
    'To-dos',
    row('data-todos-open', 'To-dos', actions.onTodos),
    row('data-whats-new-open', "What's new", actions.onWhatsNew),
    h(
      'p',
      { class: 'muted set-note' },
      'Things to try and answer, and what changed in this version.',
    ),
  );
}

/** M12 slice 1b: "Your goal": the answers in one line, re-run, and the go-easy list. */
function goalSection(
  props: SettingsProps,
  actions: SettingsActions,
  section: (
    key: string,
    iconName: IconName,
    title: string,
    ...c: (HTMLElement | null)[]
  ) => HTMLElement,
): HTMLElement | null {
  if (!actions.onIntake) return null;
  const intake = props.intake ?? null;
  const areas = BODY_AREAS.filter((a) => (props.easyOn ?? []).includes(a));
  const onRemove = actions.onEasyOnRemove;
  return section(
    'goal',
    'flag',
    'Your goal',
    h(
      'p',
      { class: intake ? 'set-goal-summary' : 'muted set-note', 'data-goal-summary': true },
      intake ? intakeSummary(intake) : GOAL_NOT_SET,
    ),
    intake?.goalText
      ? h('p', { class: 'set-note', 'data-goal-words': true }, intake.goalText)
      : null,
    h(
      'button',
      {
        type: 'button',
        class: 'set-action',
        'data-intake-open': true,
        onclick: () => actions.onIntake?.(),
      },
      intake ? GOAL_RERUN_LABEL : GOAL_SET_LABEL,
    ),
    h('h3', { class: 'set-easy-head', id: 'set-easy-h' }, EASY_ON_HEAD),
    areas.length
      ? h(
          'ul',
          { class: 'set-easy-list', 'aria-labelledby': 'set-easy-h' },
          ...areas.map((a) =>
            h(
              'li',
              { class: 'set-easy-row', 'data-easy-on': a },
              h('span', { class: 'set-easy-name' }, AREA_LABEL[a]),
              onRemove
                ? h(
                    'button',
                    {
                      type: 'button',
                      class: 'set-easy-remove',
                      'data-easy-remove': a,
                      'aria-label': `Remove ${AREA_LABEL[a]} from the go-easy list`,
                      onclick: () => onRemove(a),
                    },
                    icon('close', 'sm'),
                    h('span', {}, 'Remove'),
                  )
                : null,
            ),
          ),
        )
      : h('p', { class: 'muted set-note', 'data-easy-empty': true }, EASY_ON_EMPTY),
    areas.length ? h('p', { class: 'muted set-note' }, EASY_ON_NOTE) : null,
  );
}

/** M12 slice 1b: the Progress photos switch (off by default), Open while on, the privacy line. */
function progressPhotosSection(
  props: SettingsProps,
  actions: SettingsActions,
  section: (
    key: string,
    iconName: IconName,
    title: string,
    ...c: (HTMLElement | null)[]
  ) => HTMLElement,
): HTMLElement | null {
  const onToggle = actions.onProgressPhotos;
  if (!onToggle) return null;
  const on = props.progressPhotos === true;
  return section(
    'progress-photos',
    'camera',
    'Progress photos',
    switchRow('progress-photos', 'Progress photos', on, onToggle),
    on && actions.onProgressPhotosOpen
      ? h(
          'button',
          {
            type: 'button',
            class: 'set-action',
            'data-progress-photos-open': true,
            onclick: () => actions.onProgressPhotosOpen?.(),
          },
          'Open progress photos',
        )
      : null,
    h(
      'p',
      { class: 'muted set-note', 'data-progress-photos-privacy': true },
      icon('lock', 'sm'),
      ` ${PHOTOS_PRIVACY}`,
    ),
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
    goalSection(props, actions, section),
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
    props.nutrition ? section('nutrition', 'flame', 'Nutrition', props.nutrition) : null,
    props.foodPhotos ? section('food-photos', 'bowl', 'Food photos', props.foodPhotos) : null,
    actions.onMyGym
      ? section(
          'gym',
          'dumbbell',
          'Gym',
          h(
            'button',
            {
              type: 'button',
              class: 'set-action',
              'data-my-gym-open': true,
              onclick: () => actions.onMyGym?.(),
            },
            'My gym',
          ),
          h('p', { class: 'muted set-note' }, 'The kit your gym has. Swaps use only that.'),
        )
      : null,
    actions.onHealth
      ? section(
          'health',
          'trend',
          'Health',
          h(
            'button',
            {
              type: 'button',
              class: 'set-action',
              'data-health-open': true,
              onclick: () => actions.onHealth?.(),
            },
            'Health',
          ),
          h('p', { class: 'muted set-note' }, 'What the coach reads from Apple Health.'),
        )
      : null,
    actions.onPlanChanges
      ? section(
          'plan',
          'calendar',
          'Plan',
          h(
            'button',
            {
              type: 'button',
              class: 'set-action',
              'data-plan-changes-open': true,
              onclick: () => actions.onPlanChanges?.(),
            },
            'Plan changes',
          ),
        )
      : null,
    todosSection(actions, section),
    progressPhotosSection(props, actions, section),
    props.backup ? section('backup', 'lock', 'Backup', props.backup) : null,
    section('devlog', 'bars', 'Developer log', props.devLog),
    // M12 slice 1c: always the last section. Plain text, no links, nothing sent.
    section(
      'about',
      'logo',
      'About',
      h('p', { class: 'about-name', 'data-about': 'name' }, 'Gym Clean'),
      h('p', { class: 'set-note', 'data-about': 'version' }, props.version ?? versionLabel()),
      h('p', { class: 'muted set-note', 'data-about': 'credit' }, CREDIT),
    ),
    tabBar('settings', actions.onTab),
  );
}
