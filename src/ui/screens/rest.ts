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
import { formatRest } from '../../core/format';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { workoutTopBar } from '../topBar';

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
      h('p', { class: 'rest-eyebrow caps' }, `Next · Set ${p.setIndex + 1} of ${p.sets}`),
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
