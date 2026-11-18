// M7 Fuel tab (task 11, SPEC M7 "Screens & UX", Pro mood). Pure render: values and callbacks in,
// element out. No DB: app.ts loads today's entries, runs the core totals/targets selectors and
// passes the results here.
//
// Layout: title + date + Weigh-in, the nudge banner slot, the rings with the big "to go" numbers
// (or the "Set up your targets" card, whose button is the one orange action until targets exist),
// Log food (the one orange action after that), today's entries grouped
// by meal slot (each row opens the entry sheet, which has Edit and Delete; M13 task 24: no Delete
// block on the row, a delete in the sheet is still undone by the app's Undo toast),
// then the 4-tab bar (Today / Fuel / History / Settings). M13 task 22: an empty day is the shared
// empty state (plate icon, "Nothing logged yet today.", Log food as its one action).
//
// e2e hooks: `main.screen.fuel[data-screen=fuel]`, `[data-ring=kcal|proteinG|carbsG|fatG]`,
// `[data-left=…]`, `[data-log-open]`, `[data-weigh-in]`, `[data-setup]`, `[data-fuel-nudge]` (links.ts, shared with Today),
// `[data-slot=<slot>]` groups, `[data-entry=<id>]` rows, `[data-entry-edit=<id>]` (the row's button).
//
// M12 slice 1b (optional): the "Measurements" row (`[data-measurements-open]`, fuel/measurements.ts)
// when `measurements` and `onMeasurements` are both set. It sits under today's food, a monthly
// thing out of the way of logging; once it is time to measure again it moves up under the header.
// M12 slice 1b task 33 (optional): the protein-per-meal nudge (`[data-protein-nudge]`,
// fuel/proteinNudge.ts) under Log food, right where the meal was just logged, when
// `proteinNudge` and `onDismissProteinNudge` are both set; "Why?" shows with `onProteinWhy`.
import type {
  FoodEntry,
  MacroSet,
  MealSlot,
  NutritionMode,
  NutritionTargets,
} from '../../core/types';
import { formatWeight, type Unit } from '../../core/units';
import { h } from '../dom';
import { SLOT_LABEL, amountText, estimateTag, fmtNum, fromHealthTag } from '../fuel/common';
import { nudgeBanner } from '../fuel/links';
import { measurementsEntryRow, type MeasurementsEntry } from '../fuel/measurements';
import { proteinNudge, type ProteinNudgeProps } from '../fuel/proteinNudge';
import { fuelRings } from '../fuel/rings';
import { icon } from '../icons';
import { tabBar, type TabId } from '../tabBar';
import { moodClass } from '../tokens';
import { emptyState } from '../emptyState';
import { dateLabel } from './today';

export type FuelProps = {
  now: number;
  mode: NutritionMode;
  /** null until setup is done: the screen shows "Set up your targets". */
  targets: NutritionTargets | null;
  /** Today's totals (core). */
  totals: MacroSet;
  /** Today's entries (any order; grouped and sorted here by slot and time). */
  entries: readonly FoodEntry[];
  unit: Unit;
  /** The latest weigh-in, shown on the Weigh-in button. */
  lastWeighInKg?: number | null | undefined;
  /** M11: where that weigh-in came from; 'health' adds the "from Health" tag. */
  lastWeighInSource?: 'manual' | 'health' | undefined;
  /** M7-q6 evening nudge text ("40 g protein to go today"), or null. */
  nudge?: string | null | undefined;
  /** M12 1b: when he last measured and whether it's time again (`measurementsEntry(...)`). */
  measurements?: MeasurementsEntry | null | undefined;
  /** M12 1b: core's protein-per-meal nudge for the latest light meal, or null (none / dismissed). */
  proteinNudge?: ProteinNudgeProps | null | undefined;
};

export type FuelActions = {
  /** Opens the log sheet. */
  onLog: () => void;
  /** The row was tapped: opens the entry sheet (Edit amount / slot, Delete with the Undo toast). */
  onEditEntry: (entry: FoodEntry) => void;
  onWeighIn: () => void;
  onSetup: () => void;
  onDismissNudge?: (() => void) | undefined;
  /** M12 1b: opens the Measurements screen. Needed (with `measurements`) to show the row. */
  onMeasurements?: (() => void) | undefined;
  /** M12 1b: "Got it" on the protein nudge (main records the meal key). Needed to show it. */
  onDismissProteinNudge?: ((mealKey: string) => void) | undefined;
  /** M12 1b: "Why?" on the protein nudge: main opens the protein learn card from `opener`. */
  onProteinWhy?: ((opener: HTMLElement) => void) | undefined;
  onTab: (tab: TabId) => void;
};

/** Entries grouped by slot; groups ordered by their first entry's time, rows by time. */
export function groupBySlot(
  entries: readonly FoodEntry[],
): { slot: MealSlot; entries: FoodEntry[] }[] {
  const map = new Map<MealSlot, FoodEntry[]>();
  for (const e of [...entries].sort((a, b) => a.time - b.time)) {
    map.set(e.slot, [...(map.get(e.slot) ?? []), e]);
  }
  return [...map].map(([slot, list]) => ({ slot, entries: list }));
}

function header(props: FuelProps, actions: FuelActions): HTMLElement {
  const w = props.lastWeighInKg;
  return h(
    'header',
    { class: 'fuel-head' },
    h(
      'div',
      { class: 'fuel-head-txt' },
      h('h1', { class: 'page-title' }, 'Fuel'),
      h('p', { class: 'date' }, dateLabel(props.now)),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'fuel-weigh-btn',
        'data-weigh-in': true,
        onclick: () => actions.onWeighIn(),
      },
      icon('trend', 'md'),
      h(
        'span',
        { class: 'fuel-weigh-txt' },
        h('span', {}, 'Weigh-in'),
        w != null
          ? h('span', { class: 'fuel-weigh-last' }, `${formatWeight(w, props.unit)} ${props.unit}`)
          : null,
        w != null && props.lastWeighInSource === 'health' ? fromHealthTag() : null,
      ),
    ),
  );
}

function setupCard(onSetup: () => void): HTMLElement {
  return h(
    'section',
    { class: 'fuel-setup-card', 'data-setup-card': true, 'aria-labelledby': 'fuel-setup-title' },
    h('h2', { class: 'fuel-setup-title', id: 'fuel-setup-title' }, 'Set up your targets'),
    h(
      'p',
      { class: 'muted' },
      'Daily calories and protein come from your height, age, activity and today’s weight.',
    ),
    // M13 task 22: until targets exist this is the screen's one filled button.
    h(
      'button',
      {
        type: 'button',
        class: 'primary-btn cta-btn fuel-setup-btn',
        'data-setup': true,
        onclick: () => onSetup(),
      },
      icon('sliders', 'lg'),
      h('span', {}, 'Set up targets'),
    ),
  );
}

/** Log food: the filled CTA once targets exist, the outline second action before. */
function logButton(primary: boolean, onLog: () => void): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      class: primary ? 'primary-btn cta-btn fuel-log-btn' : 'fuel-secondary fuel-log-btn',
      'data-log-open': true,
      onclick: () => onLog(),
    },
    icon('plus', primary ? 'lg' : 'md'),
    h('span', {}, 'Log food'),
  );
}

function entryRow(e: FoodEntry, mode: NutritionMode, actions: FuelActions): HTMLElement {
  const macros = [`${fmtNum(e.kcal)} kcal`, `${fmtNum(e.proteinG)} g protein`];
  if (mode === 'full') {
    if (e.carbsG !== undefined) macros.push(`${fmtNum(e.carbsG)} g carbs`);
    if (e.fatG !== undefined) macros.push(`${fmtNum(e.fatG)} g fat`);
  }
  return h(
    'li',
    { class: 'fuel-entry', 'data-entry': e.id },
    h(
      'button',
      {
        type: 'button',
        class: 'fuel-entry-main',
        'data-entry-edit': e.id,
        onclick: () => actions.onEditEntry(e),
      },
      h('span', { class: 'fuel-entry-name' }, e.label),
      h(
        'span',
        { class: 'fuel-entry-meta' },
        h('span', {}, amountText(e.amount)),
        e.estimate ? estimateTag() : null,
      ),
      h('span', { class: 'fuel-entry-macros' }, macros.join(' · ')),
      h('span', { class: 'fuel-entry-go', 'aria-hidden': 'true' }, icon('pencil', 'sm')),
      h('span', { class: 'sr-only' }, ', edit or delete'),
    ),
  );
}

function entriesSection(props: FuelProps, actions: FuelActions): HTMLElement {
  const groups = groupBySlot(props.entries);
  if (groups.length === 0) {
    return h(
      'section',
      { class: 'fuel-entries', 'data-entries': 'none' },
      h('h2', { class: 'fuel-h2' }, 'Today'),
      // M13 task 22: icon + one line + one action; Log food moves in here (no second button).
      emptyState({
        kind: 'fuel-day',
        icon: 'plate',
        line: 'Nothing logged yet today.',
        action: {
          label: 'Log food',
          icon: 'plus',
          primary: props.targets !== null,
          onClick: () => actions.onLog(),
          hooks: { 'data-log-open': true },
        },
      }),
    );
  }
  return h(
    'section',
    { class: 'fuel-entries', 'aria-label': 'Today’s food' },
    ...groups.map((g) => {
      const kcal = g.entries.reduce((s, e) => s + e.kcal, 0);
      const protein = g.entries.reduce((s, e) => s + e.proteinG, 0);
      return h(
        'section',
        { class: 'fuel-slot', 'data-slot': g.slot, 'aria-labelledby': `slot-${g.slot}` },
        h(
          'h2',
          { class: 'fuel-h2', id: `slot-${g.slot}` },
          h('span', {}, SLOT_LABEL[g.slot]),
          h('span', { class: 'fuel-slot-sum' }, `${fmtNum(kcal)} kcal · ${fmtNum(protein)} g`),
        ),
        h('ul', { class: 'fuel-list' }, ...g.entries.map((e) => entryRow(e, props.mode, actions))),
      );
    }),
  );
}

export function fuelScreen(props: FuelProps, actions: FuelActions): HTMLElement {
  const { onMeasurements } = actions;
  const measure =
    props.measurements && onMeasurements
      ? measurementsEntryRow(props.measurements, onMeasurements)
      : null;
  const measureDue = props.measurements?.due === true;
  const onNudgeDismiss = actions.onDismissProteinNudge;
  const mealNudge =
    props.proteinNudge && onNudgeDismiss
      ? proteinNudge(props.proteinNudge, {
          onDismiss: onNudgeDismiss,
          onWhy: actions.onProteinWhy,
        })
      : null;
  return h(
    'main',
    { class: `screen fuel has-tabbar ${moodClass('pro')}`, 'data-screen': 'fuel' },
    header(props, actions),
    props.nudge ? nudgeBanner(props.nudge, actions.onDismissNudge ?? (() => undefined)) : null,
    measureDue ? measure : null,
    props.targets ? fuelRings(props.mode, props.totals, props.targets) : setupCard(actions.onSetup),
    props.entries.length > 0 ? logButton(props.targets !== null, actions.onLog) : null,
    mealNudge,
    entriesSection(props, actions),
    measureDue ? null : measure,
    tabBar('fuel', actions.onTab),
  );
}
