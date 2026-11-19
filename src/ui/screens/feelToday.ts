// M12 slice 1b task 31: "How do you feel today?" on Today (trainer-kit item 9). Pure render: the
// day's saved answer in, the new answer out through `onSaveFeel`; app.ts stores it
// (`saveDayFeel`, which deletes the row when nothing is picked) and re-renders Today with core's
// readiness card and `todaysFeelOffers(...)`.
//
// Optional and quiet: a collapsed row below Start; tapping it opens energy 1–5 and the sore-area
// chips (FEEL_AREAS) with Save / Not now. Once answered, the row shows the answer with Change, so
// it is asked once per day. Today only (never during a set); shown, never spoken.
//
// Soreness only ever leads to "Go easy on … today?" offers (core's words), never medical
// wording. Offers are shown here only when the readiness card isn't already carrying them
// (today.ts decides). Selection is never colour alone: a check mark + aria-checked.
//
// e2e hooks: `[data-feel-today]` (data-state="ask"|"open"|"done"), `[data-feel-open]`,
// `[data-feel-energy=<1..5>]`, `[data-feel-sore=<area>]`, `[data-feel-save]`,
// `[data-feel-cancel]`, `[data-feel-change]`, `[data-feel-summary]`, `[data-easy-on=<area>]`.
import { FEEL_AREAS, soreAreasText } from '../../core/health/copy';
import type { FeelOffer } from '../../core/health/readiness';
import type { BodyArea, DayFeel } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { iconButton } from '../iconButton';
import { enterScreen } from '../motion';
import './mainPill.css';
import './feelToday.css';

export type Energy = NonNullable<DayFeel['energy']>;

export type FeelTodayProps = {
  /** Local YYYY-MM-DD of today (the saved row's date). */
  date: string;
  /** Today's saved answer (`getDayFeel(date)`), or null/undefined when not answered. */
  feel?: DayFeel | null | undefined;
  /** "Go easy on … today?" offers to show under the answer (`todaysFeelOffers`). */
  offers?: readonly FeelOffer[] | undefined;
  /** Start open (e.g. app.ts keeps it open across a re-render). Default: collapsed. */
  open?: boolean | undefined;
};

export type FeelTodayActions = {
  /**
   * Save tapped: today's answer (`{ date, energy?, sore? }`). With nothing picked it carries
   * neither field, and `saveDayFeel` deletes the row.
   */
  onSaveFeel: (feel: DayFeel) => void;
  /** A "Go easy on … today?" button: open today's M10 avoid-area proposal for `area`. */
  onEasyOn?: ((area: BodyArea) => void) | undefined;
};

export const FEEL_COPY = {
  ask: 'How do you feel today?',
  optional: 'Optional. It can make today lighter.',
  energy: 'Energy',
  sore: 'Anything sore?',
  save: 'Save',
  cancel: 'Not now',
  change: 'Change',
  doneTitle: 'Today you feel',
} as const;

export const ENERGY_LEVELS: readonly Energy[] = [1, 2, 3, 4, 5];

/** The word under each energy number (meaning in words, not colour). */
export const ENERGY_WORD: Record<Energy, string> = {
  1: 'Empty',
  2: 'Low',
  3: 'OK',
  4: 'Good',
  5: 'Great',
};

export const FEEL_AREA_LABEL: Record<BodyArea, string> = {
  arms: 'Arms',
  shoulders: 'Shoulders',
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  core: 'Core',
};

/** Every fixed string the row can show (for the copy test). */
export function feelFixedCopy(): string[] {
  return [
    ...Object.values(FEEL_COPY),
    ...ENERGY_LEVELS.map((e) => ENERGY_WORD[e]),
    ...FEEL_AREAS.map((a) => FEEL_AREA_LABEL[a]),
  ];
}

/** True when the row holds an answer (energy or at least one sore area). */
export function hasAnswer(feel: DayFeel | null | undefined): feel is DayFeel {
  return !!feel && (feel.energy !== undefined || (feel.sore?.length ?? 0) > 0);
}

/** "Energy 4 of 5 (Good) · Sore: shoulders and legs" / "Energy 3 of 5 (OK)" / "Sore: back". */
export function feelSummary(feel: DayFeel): string {
  const parts: string[] = [];
  if (feel.energy !== undefined) {
    parts.push(`Energy ${feel.energy} of 5 (${ENERGY_WORD[feel.energy]})`);
  }
  const areas = FEEL_AREAS.filter((a) => feel.sore?.includes(a));
  if (areas.length) parts.push(`Sore: ${soreAreasText(areas)}`);
  return parts.join(' · ');
}

/** The "Go easy on … today?" buttons, or null without offers / callback. */
export function easyOnOffers(
  offers: readonly FeelOffer[] | undefined,
  onEasyOn: ((area: BodyArea) => void) | undefined,
  cls = 'feel-offer',
): HTMLElement | null {
  if (!offers?.length || !onEasyOn) return null;
  return h(
    'div',
    { class: 'feel-offers' },
    ...offers.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: cls,
          'data-easy-on': o.area,
          onclick: () => onEasyOn(o.area),
        },
        icon('pause', 'sm'),
        h('span', {}, o.text),
      ),
    ),
  );
}

type Draft = { energy: Energy | undefined; sore: Set<BodyArea> };

function draftOf(feel: DayFeel | null | undefined): Draft {
  return {
    energy: feel?.energy,
    sore: new Set(FEEL_AREAS.filter((a) => feel?.sore?.includes(a))),
  };
}

/** One selectable option: a check mark + aria-checked, never colour alone. */
function option(
  role: 'radio' | 'checkbox',
  attrs: Record<string, string | number>,
  label: HTMLElement[],
  onPick: () => void,
): { btn: HTMLButtonElement; paint: (on: boolean) => void } {
  const mark = h('span', { class: 'feel-mark', 'aria-hidden': 'true' });
  const btn = h(
    'button',
    { type: 'button', class: 'feel-opt', role, ...attrs, onclick: () => onPick() },
    mark,
    ...label,
  );
  const paint = (on: boolean) => {
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.setAttribute('class', on ? 'feel-opt on' : 'feel-opt');
    if (on) mark.replaceChildren(icon('check', 'sm'));
    else mark.replaceChildren();
  };
  return { btn, paint };
}

/** Arrow keys move between options of a group (radios also pick, like native radios). */
function arrowKeys(buttons: HTMLButtonElement[], pick: boolean): (ev: Event) => void {
  return (ev: Event) => {
    const key = (ev as KeyboardEvent).key;
    const delta =
      key === 'ArrowRight' || key === 'ArrowDown'
        ? 1
        : key === 'ArrowLeft' || key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(at + delta + buttons.length) % buttons.length];
    if (!next) return;
    (ev as KeyboardEvent).preventDefault?.();
    next.focus();
    if (pick) next.click();
  };
}

/** The feel-today row (collapsed, open or answered). */
export function feelToday(props: FeelTodayProps, actions: FeelTodayActions): HTMLElement {
  const root = h('section', {
    class: 'feel-today',
    'data-feel-today': true,
    'aria-labelledby': 'feel-title',
  });

  const showCollapsed = () => {
    const answered = hasAnswer(props.feel);
    root.setAttribute('data-state', answered ? 'done' : 'ask');
    if (!answered) {
      root.replaceChildren(
        h(
          'button',
          {
            type: 'button',
            class: 'feel-ask',
            id: 'feel-title',
            'data-feel-open': true,
            'aria-expanded': 'false',
            onclick: () => showOpen(true),
          },
          icon('pencil', 'sm'),
          h('span', { class: 'feel-ask-text' }, FEEL_COPY.ask),
          h('span', { class: 'feel-ask-more', 'aria-hidden': 'true' }, icon('plus', 'sm')),
        ),
      );
      return;
    }
    const feel = props.feel as DayFeel;
    const offers = easyOnOffers(props.offers, actions.onEasyOn);
    root.replaceChildren(
      h(
        'div',
        { class: 'feel-done' },
        h(
          'p',
          { class: 'feel-done-text', id: 'feel-title' },
          h('span', { class: 'feel-done-title' }, `${FEEL_COPY.doneTitle}: `),
          h('span', { 'data-feel-summary': true }, feelSummary(feel)),
        ),
        iconButton({
          icon: 'pencil',
          label: FEEL_COPY.change,
          class: 'feel-change',
          ariaLabel: `${FEEL_COPY.change}: ${FEEL_COPY.ask}`,
          hooks: { 'data-feel-change': true, 'aria-expanded': 'false' },
          onClick: () => showOpen(true),
        }),
      ),
      ...(offers ? [offers] : []),
    );
  };

  const showOpen = (animate: boolean) => {
    root.setAttribute('data-state', 'open');
    const draft = draftOf(props.feel);

    const energyOpts = ENERGY_LEVELS.map((e) =>
      option(
        'radio',
        { 'data-feel-energy': e, 'aria-label': `Energy ${e} of 5, ${ENERGY_WORD[e]}` },
        [
          h('span', { class: 'feel-num', 'aria-hidden': 'true' }, String(e)),
          h('span', { class: 'feel-word', 'aria-hidden': 'true' }, ENERGY_WORD[e]),
        ],
        () => {
          // Tapping the picked level again clears it (energy is optional too).
          draft.energy = draft.energy === e ? undefined : e;
          paintAll();
        },
      ),
    );
    const soreOpts = FEEL_AREAS.map((a) =>
      option(
        'checkbox',
        { 'data-feel-sore': a },
        [h('span', { class: 'feel-label' }, FEEL_AREA_LABEL[a])],
        () => {
          if (draft.sore.has(a)) draft.sore.delete(a);
          else draft.sore.add(a);
          paintAll();
        },
      ),
    );
    const paintAll = () => {
      energyOpts.forEach((o, i) => o.paint(draft.energy === ENERGY_LEVELS[i]));
      soreOpts.forEach((o, i) => o.paint(draft.sore.has(FEEL_AREAS[i] as BodyArea)));
    };
    paintAll();

    const energyBtns = energyOpts.map((o) => o.btn);
    const soreBtns = soreOpts.map((o) => o.btn);
    const panel = h(
      'div',
      { class: 'feel-panel' },
      h(
        'h2',
        { class: 'feel-title', id: 'feel-title' },
        icon('pencil', 'sm'),
        h('span', {}, FEEL_COPY.ask),
      ),
      h('p', { class: 'feel-hint' }, FEEL_COPY.optional),
      h('h3', { class: 'feel-sub', id: 'feel-energy' }, FEEL_COPY.energy),
      h(
        'div',
        {
          class: 'feel-opts energy',
          role: 'radiogroup',
          'aria-labelledby': 'feel-energy',
          onkeydown: arrowKeys(energyBtns, true),
        },
        ...energyBtns,
      ),
      h('h3', { class: 'feel-sub', id: 'feel-sore' }, FEEL_COPY.sore),
      h(
        'div',
        {
          class: 'feel-opts sore',
          role: 'group',
          'aria-labelledby': 'feel-sore',
          onkeydown: arrowKeys(soreBtns, false),
        },
        ...soreBtns,
      ),
      h(
        'div',
        { class: 'feel-actions' },
        iconButton({
          icon: 'check',
          label: FEEL_COPY.save,
          class: 'feel-btn feel-save card-cta',
          hooks: { 'data-feel-save': true },
          onClick: () => {
            const feel: DayFeel = { date: props.date };
            if (draft.energy !== undefined) feel.energy = draft.energy;
            const sore = FEEL_AREAS.filter((a) => draft.sore.has(a));
            if (sore.length) feel.sore = sore;
            props = { ...props, feel };
            actions.onSaveFeel(feel);
            showCollapsed();
          },
        }),
        iconButton({
          icon: 'close',
          label: FEEL_COPY.cancel,
          class: 'feel-btn',
          hooks: { 'data-feel-cancel': true },
          onClick: () => showCollapsed(),
        }),
      ),
    );
    root.replaceChildren(panel);
    if (animate) {
      // Opened by a tap: slide in and move focus into the panel (keyboard / VoiceOver).
      enterScreen(panel, 'up');
      energyBtns[0]?.focus?.();
    }
  };

  if (props.open) showOpen(false);
  else showCollapsed();
  return root;
}
