// M12 slice 1c task 10: one to-do topic as a step-by-step guide, one step per screen
// (SPEC M12 "To-do guides" goal 2).
//
// - "Step 2 of 5" in words plus a segment bar (the current segment is outlined, done ones carry
//   a fill; the words carry the meaning, not the colour).
// - Auto step: the app ticks it from its own data. Ticked → check + "Done" (+ the day it was
//   ticked). Not yet → "So far: 2 of 3" (have / need from the detector) and its Try it button.
// - Ask step: ≥ 56px option buttons with radio (single) or checkbox (multi) semantics; the chosen
//   ones show a check mark (aria-checked for screen readers), not colour alone. Optional
//   note (≤ 500 characters, live counter). Each tap saves through `onAnswer` at once; the note
//   saves when it loses focus and before Back / Next.
// - Decision step (an ask step with `setting`): a box shows what the setting will be for the
//   chosen option.
// - Skip this topic takes two taps (the first arms it, it disarms after `confirmMs`).
//
// Props in, callbacks out. Which step is shown is the caller's (`stepIndex`); Back on step 1
// closes the guide. No DB, no speech (to-dos are never shown mid-set).
//
// e2e hooks: `main[data-screen="todo-guide"]` (+ `data-topic`, `data-step`), `[data-step-count]`,
// `[data-auto-state]` = done / todo, `[data-auto-progress]`, `[data-option=<id>]` with
// aria-checked, `[data-note]` textarea, `[data-note-count]`, `[data-decision]`, `[data-try-it]`,
// `[data-guide-back]`, `[data-guide-next]`, `[data-skip-topic]` (`data-armed` while armed),
// `[data-topic-skipped]`.
import type { AppRoute, DetectorResult, TodoAnswer, TodoStep, TodoTopic } from '../../core/types';
import { backButton, forwardContent } from '../backButton';
import { h } from '../dom';
import { icon } from '../icons';
import { dateLabel } from '../screens/today';
import { moodClass } from '../tokens';
import type { TodoTopicStatus } from './todoList';
import './todos.css';

export const NOTE_MAX = 500;
export const SKIP_CONFIRM_MS = 3000;

type AskStep = Extract<TodoStep, { kind: 'ask' }>;

export type TodoGuideProps = {
  topic: TodoTopic;
  status: TodoTopicStatus;
  /** 0-based index of the step on screen (clamped to the topic's steps). */
  stepIndex: number;
  /** This topic's stored answers (ask answers, auto ticks, skip). */
  answers: readonly TodoAnswer[];
  /** Auto step id → core detector result for the current facts. */
  results: Readonly<Record<string, DetectorResult>>;
  platform: 'web' | 'native';
  /**
   * Decision steps: what the setting will be for an option, e.g. "Apple's coach may read the
   * card's reasons: Yes". Default: `Setting after this: <option label>`.
   */
  decisionPreview?: ((step: AskStep, optionId: string) => string) | undefined;
  /** How long Skip this topic stays armed. Default SKIP_CONFIRM_MS. */
  confirmMs?: number | undefined;
};

export type TodoGuideActions = {
  /** An ask step's answer changed (each tap, and the note on blur / Back / Next). */
  onAnswer: (stepId: string, optionIds: string[], note: string | undefined) => void;
  onTryIt: (route: AppRoute) => void;
  /** Second tap on Skip this topic. */
  onSkipTopic: () => void;
  /** Previous step (only shown from step 2 on; on step 1 Back closes). */
  onBack: () => void;
  /** Next step; on the last step the button reads Done and calls onClose instead. */
  onNext: () => void;
  /** Back to the to-do list. */
  onClose: () => void;
};

/** "Step 2 of 5". */
export function stepCountText(index: number, total: number): string {
  return `Step ${index + 1} of ${total}`;
}

/** "So far: 2 of 3", or null without have/need. */
export function autoProgressText(r: DetectorResult | undefined): string | null {
  if (!r || r.have === undefined || r.need === undefined) return null;
  return `So far: ${Math.min(r.have, r.need)} of ${r.need}`;
}

/** The newest ask answer for a step (the one shown as selected). */
export function latestAsk(answers: readonly TodoAnswer[], stepId: string): TodoAnswer | undefined {
  let best: TodoAnswer | undefined;
  for (const a of answers) {
    if (a.stepId !== stepId || a.kind !== 'ask') continue;
    if (!best || a.at >= best.at) best = a;
  }
  return best;
}

/** The stored auto tick for a step, if any (stays ticked once stored). */
export function autoTick(answers: readonly TodoAnswer[], stepId: string): TodoAnswer | undefined {
  return answers.find((a) => a.stepId === stepId && a.kind === 'auto');
}

export function defaultDecisionPreview(step: AskStep, optionId: string): string {
  const opt = step.options.find((o) => o.id === optionId);
  return `Setting after this: ${opt?.label ?? optionId}`;
}

function tryItButton(route: AppRoute | undefined, actions: TodoGuideActions): HTMLElement | null {
  if (!route) return null;
  return h(
    'button',
    {
      type: 'button',
      class: 'todo-try',
      'data-try-it': route,
      onclick: () => actions.onTryIt(route),
    },
    ...forwardContent('Try it'),
  );
}

function autoBody(
  step: Extract<TodoStep, { kind: 'auto' }>,
  props: TodoGuideProps,
  actions: TodoGuideActions,
): HTMLElement[] {
  const tick = autoTick(props.answers, step.id);
  const r = props.results[step.id];
  const done = Boolean(tick) || Boolean(r?.done);
  const progress = done ? null : autoProgressText(r);
  const box = h(
    'div',
    {
      class: done ? 'todo-auto done' : 'todo-auto',
      'data-auto-state': done ? 'done' : 'todo',
      role: 'status',
    },
    h(
      'span',
      { class: 'todo-auto-mark', 'aria-hidden': 'true' },
      done ? icon('check', 'md') : icon('clock', 'md'),
    ),
    h(
      'span',
      { class: 'todo-auto-txt' },
      h('strong', {}, done ? 'Done' : 'Not yet'),
      done && tick ? h('span', { class: 'muted' }, `Ticked ${dateLabel(tick.at)}`) : null,
      progress ? h('span', { 'data-auto-progress': true }, progress) : null,
      done ? null : h('span', { class: 'muted' }, 'The app ticks this for you.'),
    ),
  );
  return [box, done ? null : tryItButton(step.tryIt, actions)].filter(
    (e): e is HTMLElement => e !== null,
  );
}

function askBody(step: AskStep, props: TodoGuideProps, actions: TodoGuideActions): HTMLElement[] {
  const prev = latestAsk(props.answers, step.id);
  const selected = new Set(prev?.optionIds ?? []);
  let savedNote = prev?.note ?? '';
  const multi = step.multi === true;
  const withNote = step.note !== 'none';
  const titleId = `todo-step-${step.id}`;

  const noteBox = withNote
    ? h('textarea', {
        class: 'todo-note',
        'data-note': true,
        id: `${titleId}-note`,
        rows: 3,
        maxlength: NOTE_MAX,
        'aria-describedby': `${titleId}-count`,
      })
    : null;
  if (noteBox) noteBox.value = savedNote;
  const counter = withNote
    ? h(
        'span',
        {
          class: 'todo-note-count',
          id: `${titleId}-count`,
          'data-note-count': true,
          'aria-live': 'polite',
        },
        `${savedNote.length} / ${NOTE_MAX}`,
      )
    : null;
  const noteValue = (): string | undefined => {
    if (!noteBox) return undefined;
    const v = String(noteBox.value ?? '').slice(0, NOTE_MAX);
    return v.trim() === '' ? undefined : v;
  };
  const save = () => {
    savedNote = noteValue() ?? '';
    actions.onAnswer(
      step.id,
      step.options.filter((o) => selected.has(o.id)).map((o) => o.id),
      noteValue(),
    );
  };

  const preview = step.setting
    ? h('p', { class: 'todo-decision', 'data-decision': true, role: 'status' })
    : null;
  const renderPreview = () => {
    if (!preview) return;
    const chosen = step.options.find((o) => selected.has(o.id));
    preview.replaceChildren(
      icon('sliders', 'sm'),
      h(
        'span',
        {},
        chosen
          ? (props.decisionPreview ?? defaultDecisionPreview)(step, chosen.id)
          : 'Pick an answer. It sets this in the app for you.',
      ),
    );
  };

  const buttons: HTMLButtonElement[] = [];
  const marks: HTMLElement[] = [];
  const paint = () => {
    step.options.forEach((o, i) => {
      const b = buttons[i];
      const mark = marks[i];
      if (!b || !mark) return;
      const on = selected.has(o.id);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('class', on ? 'todo-opt on' : 'todo-opt');
      if (on) mark.replaceChildren(icon('check', 'sm'));
      else mark.replaceChildren();
    });
    renderPreview();
  };
  for (const o of step.options) {
    const on = selected.has(o.id);
    const mark = h(
      'span',
      { class: 'todo-opt-mark', 'aria-hidden': 'true' },
      on ? icon('check', 'sm') : null,
    );
    marks.push(mark);
    const btn = h(
      'button',
      {
        type: 'button',
        class: on ? 'todo-opt on' : 'todo-opt',
        role: multi ? 'checkbox' : 'radio',
        'aria-checked': on ? 'true' : 'false',
        'data-option': o.id,
        onclick: () => {
          if (multi) {
            if (selected.has(o.id)) selected.delete(o.id);
            else selected.add(o.id);
          } else {
            selected.clear();
            selected.add(o.id);
          }
          paint();
          save();
        },
      },
      mark,
      h('span', { class: 'todo-opt-label' }, o.label),
    );
    buttons.push(btn);
  }
  renderPreview();

  const options = step.options.length
    ? h(
        'div',
        {
          class: 'todo-opts',
          role: multi ? 'group' : 'radiogroup',
          'aria-labelledby': titleId,
          onkeydown: (ev: Event) => {
            const key = (ev as KeyboardEvent).key;
            const delta =
              key === 'ArrowDown' || key === 'ArrowRight'
                ? 1
                : key === 'ArrowUp' || key === 'ArrowLeft'
                  ? -1
                  : 0;
            if (!delta) return;
            const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next = buttons[(at + delta + buttons.length) % buttons.length];
            if (!next) return;
            (ev as KeyboardEvent).preventDefault?.();
            next.focus();
            if (!multi) next.click();
          },
        },
        ...buttons,
      )
    : null;

  if (noteBox && counter) {
    noteBox.addEventListener('input', () => {
      counter.textContent = `${String(noteBox.value ?? '').length} / ${NOTE_MAX}`;
    });
    noteBox.addEventListener('change', () => {
      if ((noteValue() ?? '') !== savedNote) save();
    });
  }
  const flush = () => {
    if (noteBox && (noteValue() ?? '') !== savedNote) save();
  };
  flushers.set(step.id, flush);

  return [
    multi ? h('p', { class: 'muted todo-hint' }, 'Pick all that fit.') : null,
    options,
    preview,
    noteBox
      ? h(
          'div',
          { class: 'todo-note-wrap' },
          h(
            'label',
            { class: 'todo-note-label', for: `${titleId}-note` },
            h('span', {}, step.options.length ? 'Note (optional)' : 'Your note'),
            counter,
          ),
          noteBox,
        )
      : null,
    tryItButton(step.tryIt, actions),
  ].filter((e): e is HTMLElement => e !== null);
}

/** Note flushers per rendered ask step (Back / Next save a typed note that hasn't blurred). */
const flushers = new Map<string, () => void>();

function skipButton(onSkip: () => void, confirmMs: number): HTMLElement {
  const IDLE = 'Skip this topic';
  const ARMED = 'Tap again to skip';
  const label = h('span', {}, IDLE);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const btn = h(
    'button',
    { type: 'button', class: 'todo-skip', 'data-skip-topic': true },
    icon('skip', 'sm'),
    label,
  );
  btn.addEventListener('click', () => {
    if (btn.getAttribute('data-armed') !== null) {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      btn.removeAttribute('data-armed');
      label.textContent = IDLE;
      onSkip();
      return;
    }
    btn.setAttribute('data-armed', 'true');
    label.textContent = ARMED;
    timer = setTimeout(() => {
      timer = undefined;
      btn.removeAttribute('data-armed');
      label.textContent = IDLE;
    }, confirmMs);
  });
  return btn;
}

function stepBar(index: number, total: number, stepsDone: (i: number) => boolean): HTMLElement {
  return h(
    'div',
    { class: 'todo-bar', 'aria-hidden': 'true' },
    ...Array.from({ length: total }, (_, i) =>
      h('span', {
        class: ['todo-seg', stepsDone(i) ? 'done' : '', i === index ? 'now' : '']
          .filter(Boolean)
          .join(' '),
      }),
    ),
  );
}

/** Is step `s` answered / ticked (for the segment bar)? */
function stepDone(s: TodoStep, props: TodoGuideProps): boolean {
  if (s.kind === 'auto')
    return Boolean(autoTick(props.answers, s.id)) || Boolean(props.results[s.id]?.done);
  const a = latestAsk(props.answers, s.id);
  return Boolean(a && ((a.optionIds?.length ?? 0) > 0 || (a.note ?? '').trim() !== ''));
}

export function todoGuideScreen(props: TodoGuideProps, actions: TodoGuideActions): HTMLElement {
  flushers.clear();
  const { topic } = props;
  const total = topic.steps.length;
  const index = Math.max(0, Math.min(props.stepIndex, total - 1));
  const step = topic.steps[index];
  const last = index >= total - 1;
  const nativeOnWeb = topic.platform === 'native' && props.platform === 'web';
  const flush = () => {
    if (step) flushers.get(step.id)?.();
  };

  const body = !step
    ? []
    : step.kind === 'auto'
      ? autoBody(step, props, actions)
      : askBody(step, props, actions);

  return h(
    'main',
    {
      class: `screen todo-guide ${moodClass('pro')}`,
      'data-screen': 'todo-guide',
      'data-topic': topic.id,
      'data-step': step?.id,
    },
    h(
      'header',
      { class: 'top-bar' },
      backButton(() => {
        flush();
        actions.onClose();
      }, 'To-dos'),
    ),
    h(
      'div',
      { class: 'todo-guide-head' },
      h('h1', { class: 'todo-guide-topic' }, topic.title),
      topic.checkpoint ? h('p', { class: 'muted todo-row-cp' }, topic.checkpoint) : null,
    ),
    nativeOnWeb
      ? h(
          'p',
          { class: 'todo-native-note' },
          icon('lock', 'sm'),
          h('span', {}, 'This one is done in the iPhone app.'),
        )
      : null,
    props.status.skipped
      ? h(
          'p',
          { class: 'todo-native-note', 'data-topic-skipped': true },
          icon('skip', 'sm'),
          h('span', {}, 'Skipped. The report lists it as skipped.'),
        )
      : null,
    h(
      'div',
      { class: 'todo-step-count' },
      h('span', { 'data-step-count': true }, stepCountText(index, total)),
      stepBar(index, total, (i) => {
        const s = topic.steps[i];
        return s ? stepDone(s, props) : false;
      }),
    ),
    step
      ? h(
          'section',
          { class: 'todo-step', 'aria-labelledby': `todo-step-${step.id}` },
          h('h2', { class: 'todo-step-title', id: `todo-step-${step.id}` }, step.title),
          step.why ? h('p', { class: 'muted todo-why' }, step.why) : null,
          ...body,
        )
      : null,
    h(
      'nav',
      { class: 'todo-nav', 'aria-label': 'Steps' },
      h(
        'button',
        {
          type: 'button',
          class: 'todo-nav-btn',
          'data-guide-back': true,
          onclick: () => {
            flush();
            if (index === 0) actions.onClose();
            else actions.onBack();
          },
        },
        icon('back', 'sm'),
        h('span', {}, 'Back'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'todo-nav-btn todo-nav-next',
          'data-guide-next': true,
          onclick: () => {
            flush();
            if (last) actions.onClose();
            else actions.onNext();
          },
        },
        h('span', {}, last ? 'Done' : 'Next'),
        icon(last ? 'check' : 'arrow-right', 'sm'),
      ),
    ),
    props.status.skipped
      ? null
      : skipButton(actions.onSkipTopic, props.confirmMs ?? SKIP_CONFIRM_MS),
  );
}
