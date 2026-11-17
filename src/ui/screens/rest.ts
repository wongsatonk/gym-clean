// M4e Rest screen (Track mood, docs/design/m4e-mix/rest.png). Pure render: data and callbacks
// in, `{ el, update }` out. app.ts owns the session state, the muscle slot, the Last-set Fix and
// coach tip components (passed in as elements), the sheets and dispatching.
//
// The countdown is read from across the room: a 132px white clock inside a dashed ring that
// drains in the action colour. `update(remainingMs, targetMs)` moves the clock, ring, label and
// target line in place each tick (no re-render). Past the target the clock turns `--warn`, reads
// "+0:12" and the label changes from "Rest" to "Over rest", so the state isn't colour alone.
//
// No Skip rest (Decision A-q4: Start set ends the rest) and no Skip/End (they're in Pause).
// +30 s calls `onExtend` (app.ts dispatches EXTEND_REST, then re-renders or calls update).
//
// e2e hooks kept from the old screen: `data-screen="rest"`, `[data-rest-clock]` (role timer, the
// `overtime` class past the target), `.next-up` (holds the exercise name and "8 reps × 40 lb"),
// `.focus-cue`, the muscle slot, the "Start set" button, the "Notes and machine setting" button,
// `[data-today]` / `[data-last]`, the Fix (`[data-lsc]`) and coach tip (`[data-coach-tip]`)
// elements app.ts passes in, and the top bar's "Exercise list", "Camera" (pose-tracked next
// exercise only) and "Pause". New: `[data-rest-timer]` (data-state rest|over),
// `[data-rest-label]`, `[data-rest-target]`, `[data-rest-extend]`.
// M12: a small set-progress ring by "Next · Set 3 of 4" (`[data-set-ring]`, data-done/data-total)
// fills quickly to the set just logged (motion.ts ringFill; final at once under reduced motion).
// It plays once per logged set: a re-render of the same rest (+30 s, a sheet closing) shows it
// filled, without replaying. Decorative (aria-hidden): the eyebrow says the same in words.
// M12 1b: an optional effort row ("How was that set?" Easy / Good / Hard, `[data-effort]`) for
// the set just logged. It is on the rest screen only (never during a set), never blocks the
// timer or Start set, and updates in place on a tap (no re-render). When the next set is a
// warm-up the eyebrow reads "Next · Warm-up 1 of 2" (`[data-warmup]`).
import { formatRest } from '../../core/format';
import type { SetEffort } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { ringFill } from '../motion';
import { moodClass } from '../tokens';
import { workoutTopBar } from '../topBar';
import type { WarmupStep } from './exercise';

export type RestProps = {
  dayName: string;
  /** 0-based index of the current exercise in the day. */
  exIndex: number;
  exTotal: number;
  /** Rest target minus rest taken; negative once over. */
  remainingMs: number;
  /** The rest target in force (plan rest plus any +30 s). */
  targetMs: number;
  /** The upcoming set. */
  exerciseId: string;
  name: string;
  /** 0-based set index and the planned number of sets. */
  setIndex: number;
  sets: number;
  reps: number;
  /** The weight as shown, in `unit` ("22.5"). */
  weightText: string;
  unit: string;
  /** The spoken focus cue (`cueFor(id)`); '' leaves the line out. */
  cue: string;
  /** The muscle slot from app.ts (`muscleSlot(id, 'rest')`). */
  figure: HTMLElement;
  /** `lastSetFix(s)`; null/omitted leaves it out (e.g. while the camera shows it). */
  fixEl?: HTMLElement | null | undefined;
  /** `coachTipFor(s)`; null/omitted leaves it out. */
  coachTipEl?: HTMLElement | null | undefined;
  machine?: string | undefined;
  note?: string | undefined;
  hasNotes: boolean;
  /** "8×40, 8×40 lb" logged today / last session; omitted when empty. */
  today?: string | undefined;
  last?: string | undefined;
  /**
   * Sets of the just-finished exercise, for the set ring. Defaults to `setIndex` of `sets` when
   * the next set is the same exercise; app.ts passes it after the last set of an exercise
   * (the next set is then set 1 of the next one). Omitted with setIndex 0 → no ring.
   */
  setsDone?: { done: number; total: number } | undefined;
  /**
   * Effort of the set just logged: `null` shows the row with nothing chosen, a value shows it
   * chosen, `undefined` (or no `onEffort`) leaves the row out (no logged set to rate, e.g. after
   * a warm-up or a skipped exercise).
   */
  effort?: SetEffort | null | undefined;
  /** The upcoming set is a warm-up: the eyebrow reads "Next · Warm-up 1 of 2". */
  warmup?: WarmupStep | undefined;
};

export type RestActions = {
  onList: () => void;
  /** Given only when the upcoming exercise is pose-tracked: shows the Camera button. */
  onCamera?: (() => void) | undefined;
  onPause: () => void;
  /** +30 s: app.ts dispatches `{ type: 'EXTEND_REST', sec: 30, now }`. */
  onExtend: () => void;
  onNotes: () => void;
  onStartSet: () => void;
  /**
   * A new effort was chosen (tap or arrow keys): app.ts dispatches
   * `{ type: 'SET_EFFORT', setIndex, effort }`. The row already shows it; no re-render needed.
   */
  onEffort?: ((effort: SetEffort) => void) | undefined;
  /** "Why?": app.ts opens the effort learn card; `opener` gets the focus back on close. */
  onEffortWhy?: ((opener: HTMLElement) => void) | undefined;
};

export type RestView = {
  el: HTMLElement;
  /** Cheap per-tick update: text, one attribute on the ring, the state. No re-render. */
  update: (remainingMs: number, targetMs: number) => void;
};

/** Ring geometry (viewBox 0 0 280 280). */
const RING_R = 124;
export const RING_C = 2 * Math.PI * RING_R;

/** Pure: stroke-dashoffset of the orange arc; 0 = full ring, RING_C = drained. */
export function ringOffset(remainingMs: number, targetMs: number): number {
  const frac = targetMs > 0 ? Math.min(1, Math.max(0, remainingMs / targetMs)) : 0;
  return RING_C * (1 - frac);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const plural = (n: number, one: string) => (n === 1 ? one : `${one}s`);

/** The logged set the ring last filled to, so a re-render of the same rest doesn't replay it. */
let lastFill = '';

/** Test-only: forget the last fill. */
export function resetSetRing(): void {
  lastFill = '';
}

/**
 * The set ring (28px, pathLength 100): fills from the set before to `done` of `total`, or shows
 * `done` at once when this rest already played it.
 */
function setRing(p: RestProps): SVGElement | null {
  const s = p.setsDone ?? (p.setIndex > 0 ? { done: p.setIndex, total: p.sets } : null);
  if (!s || s.total <= 0) return null;
  const done = Math.min(s.total, Math.max(0, s.done));
  const arc = svgEl('circle', {
    class: 'set-ring-fg',
    cx: '18',
    cy: '18',
    r: '15',
    pathLength: '100',
    transform: 'rotate(-90 18 18)',
  });
  const svg = svgEl('svg', {
    class: 'set-ring',
    viewBox: '0 0 36 36',
    'aria-hidden': 'true',
    focusable: 'false',
    'data-set-ring': 'true',
    'data-done': String(done),
    'data-total': String(s.total),
  });
  svg.append(svgEl('circle', { class: 'set-ring-bg', cx: '18', cy: '18', r: '15' }), arc);
  const pct = (n: number) => (100 * n) / s.total;
  const key = `${p.dayName}|${p.exIndex}|${p.setIndex}|${done}/${s.total}`;
  if (key === lastFill) {
    arc.style.strokeDasharray = '100 100';
    arc.style.strokeDashoffset = String(100 - pct(done));
  } else {
    lastFill = key;
    arc.style.strokeDashoffset = String(100 - pct(Math.max(0, done - 1)));
    ringFill(arc, pct(done));
  }
  return svg;
}

/** The three answers, in order, with the "reps left in the tank" words under each. */
const EFFORTS: readonly { id: SetEffort; name: string; sub: string; spoken: string }[] = [
  { id: 'easy', name: 'Easy', sub: '3+ left', spoken: 'Easy, 3 or more reps left' },
  { id: 'good', name: 'Good', sub: '2 left', spoken: 'Good, 2 reps left' },
  { id: 'hard', name: 'Hard', sub: '0–1 left', spoken: 'Hard, 0 to 1 reps left' },
];

/**
 * "How was that set?" — a radio group of three buttons (one tab stop; arrows move and select,
 * like native radios). The chosen one is marked by `aria-checked`, a check mark and a filled
 * tile, so the state isn't colour alone. Optional: nothing here touches the timer or Start set.
 */
function effortRow(
  value: SetEffort | null,
  onEffort: (effort: SetEffort) => void,
  onWhy: RestActions['onEffortWhy'],
): HTMLElement {
  let current = value;
  const row = h('section', { class: 'effort', 'aria-label': 'Set effort', 'data-effort': '' });
  const btns = EFFORTS.map((e) =>
    h(
      'button',
      {
        type: 'button',
        class: 'effort-opt',
        role: 'radio',
        'aria-label': e.spoken,
        'data-effort-opt': e.id,
      },
      h('span', { class: 'effort-mark', 'aria-hidden': 'true' }, icon('check', 'sm')),
      h('span', { class: 'effort-name' }, e.name),
      h('span', { class: 'effort-sub' }, e.sub),
    ),
  );
  const paint = () => {
    row.setAttribute('data-effort', current ?? '');
    const tabStop = Math.max(
      0,
      EFFORTS.findIndex((e) => e.id === current),
    );
    btns.forEach((b, i) => {
      b.setAttribute('aria-checked', EFFORTS[i]?.id === current ? 'true' : 'false');
      b.setAttribute('tabindex', i === tabStop ? '0' : '-1');
    });
  };
  const choose = (i: number, focus: boolean) => {
    const e = EFFORTS[i];
    const b = btns[i];
    if (!e || !b) return;
    if (focus) b.focus();
    if (e.id === current) return;
    current = e.id;
    paint();
    onEffort(e.id);
  };
  btns.forEach((b, i) => {
    b.addEventListener('click', () => choose(i, false));
    b.addEventListener('keydown', (ev) => {
      const n = EFFORTS.length;
      const k = ev.key;
      const to =
        k === 'ArrowRight' || k === 'ArrowDown'
          ? (i + 1) % n
          : k === 'ArrowLeft' || k === 'ArrowUp'
            ? (i + n - 1) % n
            : k === 'Home'
              ? 0
              : k === 'End'
                ? n - 1
                : -1;
      if (to < 0) return;
      ev.preventDefault();
      choose(to, true);
    });
  });
  paint();
  const why: HTMLElement | null = onWhy
    ? h(
        'button',
        {
          type: 'button',
          class: 'effort-why',
          'aria-label': 'Why? About set effort',
          'data-effort-why': true,
          onclick: () => onWhy(why as HTMLElement),
        },
        icon('help', 'sm'),
        'Why?',
      )
    : null;
  row.append(
    h(
      'div',
      { class: 'effort-head' },
      h('p', { class: 'effort-q', id: 'effort-q' }, 'How was that set?'),
      ...(why ? [why] : []),
    ),
    h('div', { class: 'effort-opts', role: 'radiogroup', 'aria-labelledby': 'effort-q' }, ...btns),
  );
  return row;
}

export function restScreen(p: RestProps, a: RestActions): RestView {
  const ringFg = svgEl('circle', {
    class: 'rest-ring-fg',
    cx: '140',
    cy: '140',
    r: String(RING_R),
    'stroke-dasharray': RING_C.toFixed(1),
    transform: 'rotate(-90 140 140)',
  });
  const ring = svgEl('svg', {
    class: 'rest-ring',
    viewBox: '0 0 280 280',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  ring.append(
    svgEl('circle', { class: 'rest-ring-bg', cx: '140', cy: '140', r: String(RING_R) }),
    ringFg,
  );

  const label = h('p', { class: 'rest-lbl caps', 'data-rest-label': true });
  const clock = h('p', { class: 'rest-clock', role: 'timer', 'data-rest-clock': true });
  const target = h('p', { class: 'rest-target', 'data-rest-target': true });
  const timer = h(
    'section',
    { class: 'rest-timer', 'aria-label': 'Rest timer', 'data-rest-timer': true },
    ring,
    h('div', { class: 'rest-timer-txt' }, label, clock, target),
  );

  let lastOver: boolean | null = null;
  let lastTarget = -1;
  function update(remainingMs: number, targetMs: number): void {
    clock.textContent = formatRest(remainingMs);
    ringFg.setAttribute('stroke-dashoffset', ringOffset(remainingMs, targetMs).toFixed(1));
    const over = remainingMs < 0;
    if (over !== lastOver) {
      lastOver = over;
      clock.setAttribute('class', over ? 'rest-clock overtime' : 'rest-clock');
      label.textContent = over ? 'Over rest' : 'Rest';
      timer.setAttribute('data-state', over ? 'over' : 'rest');
    }
    if (targetMs !== lastTarget) {
      lastTarget = targetMs;
      target.textContent = `of ${formatRest(targetMs)}`;
    }
  }
  update(p.remainingMs, p.targetMs);

  const extend = h(
    'button',
    {
      type: 'button',
      class: 'rest-extend',
      'aria-label': '+30 s, add 30 seconds of rest',
      'data-rest-extend': true,
      onclick: a.onExtend,
    },
    icon('timer', 'md'),
    '+30 s',
  );

  const card = h(
    'article',
    { class: 'rest-card', 'aria-label': 'Next set' },
    h('div', { class: 'rest-card-fig' }, p.figure),
    h(
      'div',
      { class: 'next-up' },
      p.warmup
        ? h(
            'p',
            { class: 'rest-eyebrow caps', 'data-warmup': true },
            h('span', {}, `Next · Warm-up ${p.warmup.index + 1} of ${p.warmup.total}`),
          )
        : h(
            'p',
            { class: 'rest-eyebrow caps' },
            setRing(p),
            h('span', {}, `Next · Set ${p.setIndex + 1} of ${p.sets}`),
          ),
      h('p', { class: 'rest-next-name' }, p.name),
      h(
        'p',
        { class: 'rest-next-target' },
        h('b', {}, String(p.reps)),
        ` ${plural(p.reps, 'rep')} × `,
        h('b', {}, p.weightText),
        ` ${p.unit}`,
      ),
      p.cue
        ? h(
            'p',
            { class: 'rest-next-cue' },
            icon('speaker', 'sm'),
            h('span', { class: 'focus-cue' }, p.cue),
          )
        : null,
    ),
  );

  const el = h(
    'main',
    { class: `screen rest ${moodClass('track')}`, 'data-screen': 'rest' },
    workoutTopBar({
      dayName: p.dayName,
      exIndex: p.exIndex,
      exTotal: p.exTotal,
      onList: a.onList,
      onCamera: a.onCamera,
      onPause: a.onPause,
    }),
    timer,
    extend,
    p.fixEl ?? null,
    p.effort !== undefined && a.onEffort ? effortRow(p.effort, a.onEffort, a.onEffortWhy) : null,
    p.coachTipEl ?? null,
    card,
    h(
      'button',
      {
        type: 'button',
        class: 'notes-btn',
        'aria-label': 'Notes and machine setting',
        onclick: a.onNotes,
      },
      h(
        'span',
        { class: p.machine ? 'machine' : 'muted' },
        p.machine ? `Machine: ${p.machine}` : 'Machine setting',
      ),
      h('span', { class: 'notes-tag' }, icon('pencil', 'sm'), p.hasNotes ? 'Notes •' : 'Notes'),
    ),
    p.note ? h('p', { class: 'lasting-note' }, p.note) : null,
    p.today || p.last
      ? h(
          'div',
          { class: 'history' },
          p.today
            ? h('p', { 'data-today': true }, h('span', { class: 'muted' }, 'Today: '), p.today)
            : null,
          p.last
            ? h('p', { 'data-last': true }, h('span', { class: 'muted' }, 'Last time: '), p.last)
            : null,
        )
      : null,
    h(
      'div',
      { class: 'sticky-bottom' },
      h(
        'button',
        { type: 'button', class: 'primary-btn cta-btn', onclick: a.onStartSet },
        icon('play', 'lg'),
        'Start set',
      ),
    ),
  );
  return { el, update };
}
