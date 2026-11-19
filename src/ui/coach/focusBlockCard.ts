// M12 task 11: the focus-block card in the chat (SPEC M12 goal 6, design "Focus block").
// A week-by-week list: each week a ≥ 56px expandable row ("Week 2 · 5 days · chest 20 sets"),
// a week expands to its days, a day to its exercises (sets × reps; focus exercises carry a
// "Focus" label, not colour alone; the lighter last week is labelled). Pending → Apply / Not now;
// answered → the shared status line (Applied + Undo, Not now, Undone, expired + Ask again).
//
// Props in, callbacks out: the block (built by core), an exercise-name lookup and a focus test
// (main passes `id => isFocusExercise(id, block.group, catalog)`). Which rows are open is kept
// per block id across re-renders, so a new chat message doesn't fold the card.
//
// e2e hooks: `[data-focus-block-card]` (+ `data-block-id`), `[data-fb-week=<index>]`,
// `[data-fb-day=<date>]`, `[data-fb-ex]` rows with `[data-fb-focus]` on focus exercises,
// buttons "Apply" / "Not now", then the `data-card-status` line.
import { dateText } from '../../core/trainer/actions/lighter';
import { blockEnd } from '../../core/trainer/focusBlock';
import type { ChatCardStatus, FocusBlock, FocusGroup, ProgramDay } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { buildCardOutcome, proposalActions, type Built, type OutcomeActions } from './proposalCard';
import './chat.css';

export type FocusBlockCardProps = {
  block: FocusBlock;
  status: ChatCardStatus;
  exerciseName: (exerciseId: string) => string;
  /** Is this exercise one of the block's focus exercises? */
  isFocus: (exerciseId: string) => boolean;
  /** Play the check morph on the Applied line (the render right after Apply). */
  justApplied?: boolean | undefined;
};

export type FocusBlockCardActions = OutcomeActions & {
  onApply: () => void;
  onDismiss: () => void;
};

export type FocusExerciseView = {
  exerciseId: string;
  name: string;
  sets: number;
  reps: [number, number];
  focus: boolean;
};

export type FocusDayView = { date: string; name: string; exercises: FocusExerciseView[] };

export type FocusWeekView = {
  /** 0-based. */
  index: number;
  days: FocusDayView[];
  restDates: string[];
  focusSets: number;
  lighter: boolean;
};

const GROUP_WORD: Record<FocusGroup, string> = {
  arms: 'arms',
  shoulders: 'shoulders',
  chest: 'chest',
  back: 'back',
  legs: 'legs',
  core: 'core',
};

const GROUP_TITLE: Record<FocusGroup, string> = {
  arms: 'Arms',
  shoulders: 'Shoulders',
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  core: 'Core',
};

/** Pure: the card's title, e.g. "Chest focus: 4 weeks". Same wording as the proposal. */
export function focusBlockTitle(b: Pick<FocusBlock, 'group' | 'weeks'>): string {
  return `${GROUP_TITLE[b.group]} focus: ${b.weeks} weeks`;
}

const lighterDay = (d: ProgramDay): boolean => d.exercises.some((e) => e.adjusted === 'lighter');

/** Pure: the block cut into weeks of 7 dates from its start, with focus sets per week. */
export function focusBlockWeeks(
  block: FocusBlock,
  exerciseName: (id: string) => string,
  isFocus: (id: string) => boolean,
): FocusWeekView[] {
  const weeks: FocusWeekView[] = [];
  for (let w = 0; w < block.weeks; w++) {
    const dates = block.days.slice(w * 7, w * 7 + 7);
    const days: FocusDayView[] = [];
    const restDates: string[] = [];
    let focusSets = 0;
    let lighter = false;
    for (const d of dates) {
      if (!d.day) {
        restDates.push(d.date);
        continue;
      }
      if (lighterDay(d.day)) lighter = true;
      const exercises = d.day.exercises.map((p) => {
        const focus = isFocus(p.exerciseId);
        if (focus) focusSets += p.sets;
        return {
          exerciseId: p.exerciseId,
          name: exerciseName(p.exerciseId),
          sets: p.sets,
          reps: [p.targetReps[0], p.targetReps[1]] as [number, number],
          focus,
        };
      });
      days.push({ date: d.date, name: d.day.name, exercises });
    }
    weeks.push({ index: w, days, restDates, focusSets, lighter });
  }
  return weeks;
}

/** Pure: "Week 2 · 5 days · chest 20 sets" (+ " · lighter week"). */
export function weekLabel(w: FocusWeekView, group: FocusGroup): string {
  const n = w.days.length;
  const base = `Week ${w.index + 1} · ${n} ${n === 1 ? 'day' : 'days'} · ${GROUP_WORD[group]} ${w.focusSets} sets`;
  return w.lighter ? `${base} · lighter week` : base;
}

/** Pure: "4 × 8–12" (one rep target → "3 × 10"). */
export function setsText(e: Pick<FocusExerciseView, 'sets' | 'reps'>): string {
  const reps = e.reps[0] === e.reps[1] ? `${e.reps[0]}` : `${e.reps[0]}–${e.reps[1]}`;
  return `${e.sets} × ${reps}`;
}

/** Open rows per block id ('w0', 'd2026-11-17'), kept across re-renders of the thread. */
const OPEN = new Map<string, Set<string>>();

/** Test-only: fold every card. */
export function resetFocusCardMemory(): void {
  OPEN.clear();
}

function openSet(blockId: string): Set<string> {
  let s = OPEN.get(blockId);
  if (!s) {
    s = new Set();
    OPEN.set(blockId, s);
  }
  return s;
}

const safeId = (s: string) => s.replace(/[^\w-]/g, '_');

/** A ≥ 56px button that shows / hides `panel`, remembering the choice under `key`. */
function disclosure(
  blockId: string,
  key: string,
  panel: HTMLElement,
  attrs: Record<string, string>,
  ...content: (Node | string)[]
): HTMLElement {
  const open = openSet(blockId);
  const set = (on: boolean) => {
    btn.setAttribute('aria-expanded', String(on));
    if (on) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
  };
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'fb-row',
      'aria-controls': panel.getAttribute('id') ?? undefined,
      onclick: () => {
        const on = !open.has(key);
        if (on) open.add(key);
        else open.delete(key);
        set(on);
      },
      ...attrs,
    },
    h('span', { class: 'fb-row-text' }, ...content),
    icon('back', 'sm', { class: 'fb-chev' }),
  );
  set(open.has(key));
  return btn;
}

function exerciseRow(e: FocusExerciseView): HTMLElement {
  return h(
    'li',
    { class: 'fb-ex', 'data-fb-ex': e.exerciseId, 'data-fb-focus': e.focus || undefined },
    h('span', { class: 'fb-ex-name' }, e.name),
    h(
      'span',
      { class: 'fb-ex-meta' },
      h('span', { class: 'fb-ex-sets' }, setsText(e)),
      e.focus ? h('span', { class: 'fb-tag' }, 'Focus') : null,
    ),
  );
}

function dayItem(blockId: string, d: FocusDayView, rows: HTMLElement[]): HTMLElement {
  const panel = h(
    'ul',
    { class: 'fb-exs', id: safeId(`fb-${blockId}-d${d.date}`) },
    ...d.exercises.map(exerciseRow),
  );
  const btn = disclosure(
    blockId,
    `d${d.date}`,
    panel,
    { 'data-fb-day': d.date, class: 'fb-row fb-day' },
    h('span', { class: 'fb-day-date' }, dateText(d.date)),
    h('span', { class: 'fb-day-name' }, d.name),
  );
  rows.push(btn);
  return h('li', { class: 'fb-day-item' }, btn, panel);
}

function weekItem(block: FocusBlock, w: FocusWeekView, rows: HTMLElement[]): HTMLElement {
  const dayRows: HTMLElement[] = [];
  const rest = w.restDates.length
    ? h(
        'p',
        { class: 'fb-rest' },
        `Rest: ${w.restDates.map((d) => dateText(d).split(' ').slice(0, 2).join(' ')).join(', ')}`,
      )
    : null;
  const panel = h(
    'div',
    { class: 'fb-week-panel', id: safeId(`fb-${block.id}-w${w.index}`) },
    w.lighter
      ? h('p', { class: 'fb-lighter' }, 'Lighter week: one set less, a bit lighter.')
      : null,
    h('ol', { class: 'fb-days' }, ...w.days.map((d) => dayItem(block.id, d, dayRows))),
    rest,
  );
  const btn = disclosure(
    block.id,
    `w${w.index}`,
    panel,
    { 'data-fb-week': String(w.index), class: 'fb-row fb-week' },
    // Segments that never break inside, so a narrow row wraps between them.
    h(
      'span',
      { class: 'fb-week-text' },
      ...weekLabel(w, block.group)
        .split(' · ')
        .map((seg, i) => h('span', { class: 'fb-seg' }, i === 0 ? seg : ` · ${seg}`)),
    ),
  );
  rows.push(btn, ...dayRows);
  return h('li', { class: 'fb-week-item' }, btn, panel);
}

export function buildFocusBlockCard(p: FocusBlockCardProps, a: FocusBlockCardActions): Built {
  const { block } = p;
  const title = focusBlockTitle(block);
  const showWeeks = p.status === 'pending' || p.status === 'applied';
  const weeks = showWeeks ? focusBlockWeeks(block, p.exerciseName, p.isFocus) : [];
  const rowButtons: HTMLElement[] = [];
  const list = weeks.length
    ? h('ol', { class: 'fb-weeks' }, ...weeks.map((w) => weekItem(block, w, rowButtons)))
    : null;

  let actions: HTMLElement;
  let controls: HTMLElement[];
  if (p.status === 'pending') {
    // M13d task 40f: the same Apply / Not now row as the proposal card (round buttons).
    const built = proposalActions(a);
    actions = built.el;
    controls = built.controls;
  } else {
    const out = buildCardOutcome(p.status, a, { justApplied: p.justApplied === true });
    actions = out.el;
    controls = out.controls;
  }
  const el = h(
    'section',
    {
      class: 'proposal-card fb-card',
      'data-focus-block-card': true,
      'data-block-id': block.id,
      'data-proposal-status': p.status,
      'aria-label': title,
    },
    h('h3', { class: 'proposal-title' }, title),
    h('p', { class: 'fb-dates' }, `${dateText(block.startDate)} to ${dateText(blockEnd(block))}`),
    list,
    actions,
  );
  // Tab order (the sheet's focus trap): the row buttons in list order, then the actions.
  return { el, controls: [...rowButtons, ...controls] };
}

/** A focus-block card whose block is gone (an old thread): the title words and its status. */
export function buildMissingBlockCard(status: ChatCardStatus, a: OutcomeActions): Built {
  const out = status === 'pending' ? buildCardOutcome('expired', a) : buildCardOutcome(status, a);
  const el = h(
    'section',
    { class: 'proposal-card fb-card', 'data-focus-block-card': true, 'aria-label': 'Focus block' },
    h('h3', { class: 'proposal-title' }, 'Focus block'),
    out.el,
  );
  return { el, controls: out.controls };
}

export function focusBlockCard(p: FocusBlockCardProps, a: FocusBlockCardActions): HTMLElement {
  return buildFocusBlockCard(p, a).el;
}
