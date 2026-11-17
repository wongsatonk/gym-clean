// M12 slice 1b task 25: the intake (SPEC M12 trainer kit item 3, Decision "Second user").
// One question per screen: goal kind (+ optional own words), training days 2–6, session length
// 30 / 45 / 60 / 75, experience, areas to go easy on. Back / Next / Skip for now. The last screen
// lists what the answers would change (starter plan or "Build a new plan from my answers", the
// go-easy list, Fuel targets before → after), each with its own Apply: nothing changes without
// a tap.
//
// Props in, callbacks out. The component keeps the answers and the step on screen itself and
// redraws in place; it never reads or writes the DB and never speaks (the intake is never shown
// in a workout). What the answers change is the caller's (`props.changes`, from core
// `intakeToChanges`); this file only shows it.
//
// Copy rules: written for anyone (no name, no "he"), no goal assumed (nothing is preselected),
// coaching words only.
//
// e2e hooks: `main[data-screen="intake"]` + `data-step` = goal / days / length / experience /
// easyOn / summary, `[data-intake-count]`, `[data-option=<id>]` with aria-checked,
// `[data-goal-text]`, `[data-intake-back]`, `[data-intake-next]` (disabled until answered),
// `[data-intake-skip]`, `[data-intake-close]`, `[data-change=<id>]`, `[data-apply=<id>]`
// (`data-applied` once applied), `[data-change-error=<id>]`, `[data-intake-done]`.
import type { BodyArea, GoalKind, Intake } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { checkMorph, enterScreen } from '../motion';
import { moodClass } from '../tokens';
import './intake.css';

export type IntakeStepId = 'goal' | 'days' | 'length' | 'experience' | 'easyOn' | 'summary';

export const INTAKE_STEPS: readonly IntakeStepId[] = [
  'goal',
  'days',
  'length',
  'experience',
  'easyOn',
  'summary',
];
/** The question screens (the summary is not counted in "Question 2 of 5"). */
export const INTAKE_QUESTIONS = INTAKE_STEPS.length - 1;

export const GOAL_KINDS: readonly GoalKind[] = ['muscle', 'fat', 'strength', 'general'];
export const GOAL_LABEL: Record<GoalKind, string> = {
  muscle: 'Build muscle',
  fat: 'Lose fat',
  strength: 'Get stronger',
  general: 'General fitness',
};

export const DAY_OPTIONS: readonly number[] = [2, 3, 4, 5, 6];
export const SESSION_OPTIONS: readonly Intake['sessionMin'][] = [30, 45, 60, 75];

export const EXPERIENCE_KINDS: readonly Intake['experience'][] = ['new', 'some', 'years'];
export const EXPERIENCE_LABEL: Record<Intake['experience'], string> = {
  new: 'New to lifting',
  some: 'Some experience',
  years: 'Training for years',
};

export const BODY_AREAS: readonly BodyArea[] = [
  'arms',
  'shoulders',
  'chest',
  'back',
  'legs',
  'core',
];
export const AREA_LABEL: Record<BodyArea, string> = {
  arms: 'Arms',
  shoulders: 'Shoulders',
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  core: 'Core',
};

export const GOAL_TEXT_MAX = 80;

/** Titles for the plan change, for the caller (`IntakeChange.title`). */
export const PLAN_TITLE_STARTER = 'Starter plan';
export const PLAN_TITLE_REBUILD = 'Build a new plan from my answers';
export const EASY_ON_TITLE = 'Go easy on';
export const FUEL_TITLE = 'Fuel targets';

export const INTAKE_COPY = {
  goal: {
    title: "What's your main goal?",
    why: 'The coach builds the plan around it. You can change it later in Settings.',
  },
  days: {
    title: 'How many days a week can you train?',
    why: 'Pick what you can keep up most weeks.',
  },
  length: {
    title: 'How long is one session?',
    why: 'The plan is sized to fit, warm-up included.',
  },
  experience: {
    title: 'How much lifting have you done?',
    why: 'This sets how many sets and how fast the plan moves.',
  },
  easyOn: {
    title: 'Any areas to go easy on?',
    why: 'Pick any, or none. The coach keeps the load light there until you take it off the list.',
  },
  summary: {
    title: 'What your answers change',
    why: 'Nothing changes until you tap Apply.',
  },
  goalText: 'In your own words (optional)',
  noChanges: 'Nothing to change right now. Your answers are saved.',
  working: 'Working it out…',
  applyFailed: "That didn't apply. Try again.",
} as const;

/** One thing the answers would change, shown on the last screen with its own Apply. */
export type IntakeChangeId = 'plan' | 'easyOn' | 'fuel';
export type IntakeChange = {
  id: IntakeChangeId;
  /** E.g. PLAN_TITLE_STARTER, PLAN_TITLE_REBUILD, EASY_ON_TITLE, FUEL_TITLE. */
  title: string;
  /** Plain detail lines, e.g. "Full body, 3 days a week" or "Shoulders, Back". */
  lines?: readonly string[] | undefined;
  /** Before → after (Fuel targets), e.g. "2,300 kcal · 120 g protein". */
  before?: string | undefined;
  after?: string | undefined;
  /** Already applied (shown ticked, no button). */
  applied?: boolean | undefined;
};

export type IntakeProps = {
  /** Answers to start from (Settings → Your goal & intake re-run). */
  initial?: Partial<Intake> | null | undefined;
  /** The screen to open on. Default 'goal'. */
  startStep?: IntakeStepId | undefined;
  /**
   * What these answers would change (core `intakeToChanges`, mapped to rows). Called each time
   * the last screen opens. May be async.
   */
  changes: (intake: Intake) => readonly IntakeChange[] | Promise<readonly IntakeChange[]>;
  /** Clock for `Intake.at`. Default Date.now. */
  now?: (() => number) | undefined;
};

export type IntakeActions = {
  /** The answers are complete (the last screen opened): store them. Changes nothing else. */
  onSave: (intake: Intake) => void;
  /**
   * Apply on one change. May be async. Return (or resolve to) `false`, throw or reject if it
   * did not apply; anything else marks the row as applied.
   */
  onApply: (id: IntakeChangeId, intake: Intake) => unknown;
  /** Done on the last screen. */
  onDone: (intake: Intake) => void;
  /** Skip for now (any question screen). Nothing is stored by this component. */
  onSkip: () => void;
  /** Set when the intake was opened from Settings: shows "‹ Back" in the top bar. */
  onClose?: (() => void) | undefined;
};

/** "Question 2 of 5". */
export function questionCountText(index: number): string {
  return `Question ${index + 1} of ${INTAKE_QUESTIONS}`;
}

/** "Build muscle · 3 days a week · 45 min". Used by the last screen and the Settings row. */
export function intakeSummary(intake: Pick<Intake, 'goalKind' | 'days' | 'sessionMin'>): string {
  return `${GOAL_LABEL[intake.goalKind]} · ${intake.days} days a week · ${intake.sessionMin} min`;
}

/** "Shoulders, Back", in the fixed body order. Empty list → "". */
export function areaList(areas: readonly BodyArea[]): string {
  return BODY_AREAS.filter((a) => areas.includes(a))
    .map((a) => AREA_LABEL[a])
    .join(', ');
}

type Draft = {
  goalKind?: GoalKind | undefined;
  goalText: string;
  days?: number | undefined;
  sessionMin?: Intake['sessionMin'] | undefined;
  experience?: Intake['experience'] | undefined;
  easyOn: Set<BodyArea>;
};

function draftFrom(initial: Partial<Intake> | null | undefined): Draft {
  const i = initial ?? {};
  return {
    goalKind: i.goalKind !== undefined && GOAL_KINDS.includes(i.goalKind) ? i.goalKind : undefined,
    goalText: (i.goalText ?? '').slice(0, GOAL_TEXT_MAX),
    days: i.days !== undefined && DAY_OPTIONS.includes(i.days) ? i.days : undefined,
    sessionMin:
      i.sessionMin !== undefined && SESSION_OPTIONS.includes(i.sessionMin)
        ? i.sessionMin
        : undefined,
    experience:
      i.experience !== undefined && EXPERIENCE_KINDS.includes(i.experience)
        ? i.experience
        : undefined,
    easyOn: new Set((i.easyOn ?? []).filter((a) => BODY_AREAS.includes(a))),
  };
}

/** The finished answers, or null while a required one is missing. */
function complete(d: Draft, at: number): Intake | null {
  if (
    d.goalKind === undefined ||
    d.days === undefined ||
    d.sessionMin === undefined ||
    d.experience === undefined
  )
    return null;
  const text = d.goalText.trim();
  return {
    goalKind: d.goalKind,
    ...(text ? { goalText: text } : {}),
    days: d.days,
    sessionMin: d.sessionMin,
    experience: d.experience,
    easyOn: BODY_AREAS.filter((a) => d.easyOn.has(a)),
    at,
  };
}

function answered(step: IntakeStepId, d: Draft): boolean {
  if (step === 'goal') return d.goalKind !== undefined;
  if (step === 'days') return d.days !== undefined;
  if (step === 'length') return d.sessionMin !== undefined;
  if (step === 'experience') return d.experience !== undefined;
  return true;
}

type Option = { id: string; label: string; aria?: string };

/**
 * A radio (single) or checkbox (multi) group of ≥ 56px buttons. The chosen ones carry a check
 * mark and aria-checked, not colour alone. Arrow keys move (and, for radios, choose).
 */
function optionGroup(o: {
  options: readonly Option[];
  multi: boolean;
  labelledBy: string;
  layout: 'list' | 'row';
  isOn: (id: string) => boolean;
  onPick: (id: string) => void;
}): HTMLElement {
  const buttons: HTMLButtonElement[] = [];
  const marks: HTMLElement[] = [];
  const paint = () => {
    o.options.forEach((opt, i) => {
      const b = buttons[i];
      const mark = marks[i];
      if (!b || !mark) return;
      const on = o.isOn(opt.id);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('class', on ? 'intake-opt on' : 'intake-opt');
      if (on) mark.replaceChildren(icon('check', 'sm'));
      else mark.replaceChildren();
    });
  };
  for (const opt of o.options) {
    const mark = h('span', { class: 'intake-opt-mark', 'aria-hidden': 'true' });
    marks.push(mark);
    buttons.push(
      h(
        'button',
        {
          type: 'button',
          class: 'intake-opt',
          role: o.multi ? 'checkbox' : 'radio',
          'data-option': opt.id,
          'aria-label': opt.aria,
          onclick: () => {
            o.onPick(opt.id);
            paint();
          },
        },
        mark,
        h('span', { class: 'intake-opt-label' }, opt.label),
      ),
    );
  }
  paint();
  return h(
    'div',
    {
      class: o.layout === 'row' ? 'intake-opts row' : 'intake-opts',
      role: o.multi ? 'group' : 'radiogroup',
      'aria-labelledby': o.labelledBy,
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
        if (!o.multi) next.click();
      },
    },
    ...buttons,
  );
}

function stepBar(index: number): HTMLElement {
  return h(
    'div',
    { class: 'intake-bar', 'aria-hidden': 'true' },
    ...Array.from({ length: INTAKE_QUESTIONS }, (_, i) =>
      h('span', {
        class: ['intake-seg', i < index ? 'done' : '', i === index ? 'now' : '']
          .filter(Boolean)
          .join(' '),
      }),
    ),
  );
}

export function intakeScreen(props: IntakeProps, actions: IntakeActions): HTMLElement {
  const draft = draftFrom(props.initial);
  const now = props.now ?? Date.now;
  let step: IntakeStepId = props.startStep ?? 'goal';
  /** Rows applied on this visit (kept when going Back and returning with the same answers). */
  const applied = new Set<IntakeChangeId>();
  let appliedFor = '';
  /** Guards a slow `changes()` answer against a newer screen. */
  let token = 0;

  const root = h('main', {
    class: `screen intake ${moodClass('pro')}`,
    'data-screen': 'intake',
  });
  const titleId = 'intake-q';

  const go = (to: IntakeStepId, dir: 'next' | 'prev') => {
    step = to;
    token++;
    draw();
    const body = root.children[1];
    if (body) enterScreen(body as HTMLElement, dir);
    const title = root.children[1]?.children[0];
    (title as HTMLElement | undefined)?.focus?.();
  };
  const index = () => INTAKE_STEPS.indexOf(step);
  const back = () => {
    const prev = INTAKE_STEPS[index() - 1];
    if (prev) go(prev, 'prev');
    else actions.onClose?.();
  };
  const next = () => {
    if (!answered(step, draft)) return;
    const to = INTAKE_STEPS[index() + 1];
    if (!to) return;
    // The summary needs every answer (it can be reached with gaps only via `startStep`).
    if (to === 'summary' && !complete(draft, 0)) {
      const gap = INTAKE_STEPS.find((s) => !answered(s, draft));
      if (gap) go(gap, 'prev');
      return;
    }
    go(to, 'next');
  };

  let nextBtn: HTMLButtonElement | null = null;
  const syncNext = () => {
    if (!nextBtn) return;
    if (answered(step, draft)) nextBtn.removeAttribute('disabled');
    else nextBtn.setAttribute('disabled', '');
  };

  const questionBody = (): (HTMLElement | null)[] => {
    if (step === 'goal') {
      const input = h('input', {
        type: 'text',
        class: 'intake-text',
        id: 'intake-goal-text',
        'data-goal-text': true,
        maxlength: GOAL_TEXT_MAX,
        autocomplete: 'off',
        enterkeyhint: 'done',
      });
      input.value = draft.goalText;
      const read = () => {
        draft.goalText = String(input.value ?? '').slice(0, GOAL_TEXT_MAX);
      };
      input.addEventListener('input', read);
      input.addEventListener('change', read);
      input.addEventListener('keydown', (ev: Event) => {
        if ((ev as KeyboardEvent).key !== 'Enter') return;
        read();
        next();
      });
      return [
        optionGroup({
          options: GOAL_KINDS.map((k) => ({ id: k, label: GOAL_LABEL[k] })),
          multi: false,
          labelledBy: titleId,
          layout: 'list',
          isOn: (id) => draft.goalKind === id,
          onPick: (id) => {
            draft.goalKind = id as GoalKind;
            syncNext();
          },
        }),
        h(
          'div',
          { class: 'intake-text-wrap' },
          h('label', { class: 'intake-text-label', for: 'intake-goal-text' }, INTAKE_COPY.goalText),
          input,
        ),
      ];
    }
    if (step === 'days')
      return [
        optionGroup({
          options: DAY_OPTIONS.map((d) => ({
            id: String(d),
            label: String(d),
            aria: `${d} days a week`,
          })),
          multi: false,
          labelledBy: titleId,
          layout: 'row',
          isOn: (id) => draft.days === Number(id),
          onPick: (id) => {
            draft.days = Number(id);
            syncNext();
          },
        }),
      ];
    if (step === 'length')
      return [
        optionGroup({
          options: SESSION_OPTIONS.map((m) => ({ id: String(m), label: `${m} min` })),
          multi: false,
          labelledBy: titleId,
          layout: 'list',
          isOn: (id) => draft.sessionMin === Number(id),
          onPick: (id) => {
            draft.sessionMin = Number(id) as Intake['sessionMin'];
            syncNext();
          },
        }),
      ];
    if (step === 'experience')
      return [
        optionGroup({
          options: EXPERIENCE_KINDS.map((k) => ({ id: k, label: EXPERIENCE_LABEL[k] })),
          multi: false,
          labelledBy: titleId,
          layout: 'list',
          isOn: (id) => draft.experience === id,
          onPick: (id) => {
            draft.experience = id as Intake['experience'];
            syncNext();
          },
        }),
      ];
    return [
      optionGroup({
        options: BODY_AREAS.map((a) => ({ id: a, label: AREA_LABEL[a] })),
        multi: true,
        labelledBy: titleId,
        layout: 'list',
        isOn: (id) => draft.easyOn.has(id as BodyArea),
        onPick: (id) => {
          const a = id as BodyArea;
          if (draft.easyOn.has(a)) draft.easyOn.delete(a);
          else draft.easyOn.add(a);
        },
      }),
    ];
  };

  const changeCard = (c: IntakeChange, intake: Intake): HTMLElement => {
    const done = c.applied === true || applied.has(c.id);
    const error = h('p', {
      class: 'intake-change-error',
      'data-change-error': c.id,
      role: 'alert',
    });
    const label = h('span', {}, done ? 'Applied' : 'Apply');
    const btn = h(
      'button',
      {
        type: 'button',
        class: done ? 'intake-apply done' : 'intake-apply',
        'data-apply': c.id,
        'data-applied': done ? 'true' : undefined,
        disabled: done,
        'aria-label': `${done ? 'Applied' : 'Apply'}: ${c.title}`,
      },
      done ? icon('check', 'sm') : null,
      label,
    );
    const markDone = () => {
      applied.add(c.id);
      btn.setAttribute('class', 'intake-apply done');
      btn.setAttribute('data-applied', 'true');
      btn.setAttribute('disabled', '');
      btn.setAttribute('aria-label', `Applied: ${c.title}`);
      label.textContent = 'Applied';
      checkMorph(btn, icon('check', 'sm'));
    };
    const fail = () => {
      btn.removeAttribute('disabled');
      error.replaceChildren(icon('help', 'sm'), h('span', {}, INTAKE_COPY.applyFailed));
    };
    btn.addEventListener('click', () => {
      if (btn.hasAttribute('disabled')) return;
      btn.setAttribute('disabled', '');
      error.replaceChildren();
      let r: unknown;
      try {
        r = actions.onApply(c.id, intake);
      } catch {
        fail();
        return;
      }
      if (r instanceof Promise)
        r.then(
          (v: unknown) => (v === false ? fail() : markDone()),
          () => fail(),
        );
      else if (r === false) fail();
      else markDone();
    });
    const headId = `intake-change-${c.id}`;
    return h(
      'section',
      { class: 'intake-change', 'data-change': c.id, 'aria-labelledby': headId },
      h('h2', { class: 'intake-change-title', id: headId }, c.title),
      c.lines?.length
        ? h('ul', { class: 'intake-change-lines' }, ...c.lines.map((l) => h('li', {}, l)))
        : null,
      c.before !== undefined || c.after !== undefined
        ? h(
            'dl',
            { class: 'intake-diff' },
            c.before !== undefined
              ? h('div', { 'data-diff': 'before' }, h('dt', {}, 'Now'), h('dd', {}, c.before))
              : null,
            c.after !== undefined
              ? h('div', { 'data-diff': 'after' }, h('dt', {}, 'After'), h('dd', {}, c.after))
              : null,
          )
        : null,
      btn,
      error,
    );
  };

  const summaryBody = (intake: Intake): HTMLElement[] => {
    const key = JSON.stringify({ ...intake, at: 0 });
    if (key !== appliedFor) {
      applied.clear();
      appliedFor = key;
    }
    actions.onSave(intake);
    const list = h(
      'div',
      { class: 'intake-changes', 'data-intake-changes': true, 'aria-live': 'polite' },
      h('p', { class: 'muted' }, INTAKE_COPY.working),
    );
    const show = (changes: readonly IntakeChange[]) => {
      list.replaceChildren(
        ...(changes.length
          ? changes.map((c) => changeCard(c, intake))
          : [h('p', { class: 'intake-none', 'data-intake-none': true }, INTAKE_COPY.noChanges)]),
      );
    };
    const mine = token;
    let result: readonly IntakeChange[] | Promise<readonly IntakeChange[]>;
    try {
      result = props.changes(intake);
    } catch {
      result = [];
    }
    if (result instanceof Promise)
      result.then(
        (c) => {
          if (mine === token) show(c);
        },
        () => {
          if (mine === token) show([]);
        },
      );
    else show(result);
    return [
      h(
        'p',
        { class: 'intake-answers', 'data-intake-answers': true },
        intakeSummary(intake),
        intake.easyOn.length ? ` · Easy on: ${areaList(intake.easyOn)}` : '',
      ),
      list,
    ];
  };

  function draw(): void {
    const i = index();
    const isSummary = step === 'summary';
    const intake = isSummary ? complete(draft, now()) : null;
    const copy = INTAKE_COPY[step];
    root.setAttribute('data-step', step);

    const top = h(
      'header',
      { class: 'top-bar intake-top' },
      actions.onClose
        ? h(
            'button',
            {
              class: 'ghost-btn',
              type: 'button',
              'data-intake-close': true,
              onclick: () => actions.onClose?.(),
            },
            '‹ Back',
          )
        : null,
      isSummary
        ? h('span', { class: 'intake-count', 'data-intake-count': true }, 'Your answers')
        : h(
            'div',
            { class: 'intake-count' },
            h('span', { 'data-intake-count': true }, questionCountText(i)),
            stepBar(i),
          ),
    );

    const body = h(
      'section',
      { class: 'intake-step', 'aria-labelledby': titleId },
      h('h1', { class: 'intake-q', id: titleId, tabindex: -1 }, copy.title),
      h('p', { class: 'muted intake-why' }, copy.why),
      ...(isSummary ? (intake ? summaryBody(intake) : []) : questionBody()),
    );

    const showBack = i > 0 || Boolean(actions.onClose);
    nextBtn = isSummary
      ? null
      : h(
          'button',
          {
            type: 'button',
            class: 'intake-nav-btn intake-nav-next',
            'data-intake-next': true,
            onclick: next,
          },
          h('span', {}, step === 'easyOn' ? 'See what changes' : 'Next'),
          h('span', { 'aria-hidden': 'true' }, '›'),
        );
    syncNext();
    const nav = h(
      'nav',
      { class: showBack ? 'intake-nav' : 'intake-nav single', 'aria-label': 'Questions' },
      showBack
        ? h(
            'button',
            { type: 'button', class: 'intake-nav-btn', 'data-intake-back': true, onclick: back },
            icon('back', 'sm'),
            h('span', {}, 'Back'),
          )
        : null,
      isSummary
        ? h(
            'button',
            {
              type: 'button',
              class: 'intake-nav-btn intake-nav-next',
              'data-intake-done': true,
              onclick: () => {
                if (intake) actions.onDone(intake);
              },
            },
            h('span', {}, 'Done'),
            icon('check', 'sm'),
          )
        : nextBtn,
    );

    root.replaceChildren(
      top,
      body,
      nav,
      ...(isSummary
        ? []
        : [
            h(
              'button',
              {
                type: 'button',
                class: 'intake-skip',
                'data-intake-skip': true,
                onclick: () => actions.onSkip(),
              },
              icon('skip', 'sm'),
              h('span', {}, 'Skip for now'),
            ),
          ]),
    );
  }

  // A start on the summary without full answers falls back to the first gap.
  if (step === 'summary' && !complete(draft, 0))
    step = INTAKE_STEPS.find((s) => !answered(s, draft)) ?? 'goal';
  draw();
  return root;
}
