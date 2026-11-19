// M12 slice 2 task 17: the weekly check-in card in the chat (ChatCard kind 'checkIn').
// Three questions (energy, sleep, soreness), each a row of 1–5 chips (≥ 56px) with the ends
// labelled ("Low" / "High"); Done and "Skip this week"; then a one-line summary.
//
// Checkpoint J: the open card filled the whole Coach thread and hid the chat under it, so a
// pending card starts collapsed: one line "Weekly check-in · 3 quick taps", then Answer (opens
// the questions in place, focus to the first chip) and Skip this week. Opened stays opened per
// week across chat re-renders. The one Skip button stays in the bottom row in both states.
//
// Props in, callbacks out: the questions come in as data (core CHECK_IN_QUESTIONS, mapped by
// main to `CheckInQuestionView`), the card status and the saved CheckIn for the summary. Picks
// before Done are kept per week across chat re-renders (like the focus-block card's open rows).
// Partial answers are fine: Done needs at least one answer; unanswered ones stay unset.
//
// Each question is a radio group (role="radiogroup" / "radio", aria-checked, roving tabindex:
// arrows move and pick, as native radios). The picked chip is a white fill AND a check mark AND
// aria-checked: never colour alone. Answers never go to a brain (task 13 / 4); the card says so.
//
// e2e hooks: `[data-checkin-card]` (+ `data-week`, `data-card-status`, `data-expanded`),
// `[data-checkin-compact]`, `[data-checkin-answer]`, `[data-checkin-body]`, `[data-checkin-q=<id>]`,
// `[data-checkin-pick=<id>:<n>]`, `[data-checkin-done]`, `[data-checkin-skip]`,
// `[data-checkin-summary]`.
import type { CheckIn } from '../../core/types';
import { h } from '../dom';
import { iconButton } from '../iconButton';
import { setIconButtonLabel } from '../iconButtonLabel';
import { icon } from '../icons';
import type { Built } from './proposalCard';
import './chat.css';
import './coachButtons.css';

export type CheckInKey = 'energy' | 'sleep' | 'soreness';
export type CheckInScore = 1 | 2 | 3 | 4 | 5;
export type CheckInAnswers = Partial<Record<CheckInKey, CheckInScore>>;

/** One question as the card draws it (core CHECK_IN_QUESTIONS mapped by main). */
export type CheckInQuestionView = {
  id: CheckInKey;
  /** e.g. "Energy this week". */
  label: string;
  /** End labels, e.g. "Low" / "High". */
  low: string;
  high: string;
};

export type CheckInCardProps = {
  weekStart: string;
  status: 'pending' | 'done' | 'skipped';
  questions: readonly CheckInQuestionView[];
  /** The saved check-in (done), for the summary line. */
  saved?: CheckIn | undefined;
};

export type CheckInCardActions = {
  /** Done: the answers given (at least one). */
  onDone: (answers: CheckInAnswers) => void;
  onSkip: () => void;
};

export const CHECKIN_TITLE = 'Weekly check-in';
export const CHECKIN_COMPACT = 'Weekly check-in · 3 quick taps';
export const CHECKIN_ANSWER = 'Answer';
/** Skip's words while collapsed (one row with Answer); its name stays "Skip this week". */
export const CHECKIN_SKIP_SHORT = 'Skip';
export const CHECKIN_INTRO = 'Three quick taps about your week. Only for your recap.';
export const CHECKIN_DONE = 'Done';
export const CHECKIN_SKIP = 'Skip this week';
export const CHECKIN_NEED_ONE = 'Pick at least one to save.';
export const CHECKIN_SKIPPED = 'Skipped this week. See you next Sunday.';

const SCORES: readonly CheckInScore[] = [1, 2, 3, 4, 5];

/** "Saved: energy 4, sleep 3." — words for each answered question, in question order. */
export function checkInSummary(
  questions: readonly CheckInQuestionView[],
  saved: Partial<Record<CheckInKey, number>> | undefined,
): string {
  const parts = questions
    .filter((q) => typeof saved?.[q.id] === 'number')
    .map((q) => `${q.id} ${saved?.[q.id]}`);
  return parts.length ? `Saved: ${parts.join(', ')}.` : 'Saved.';
}

// Picks before Done, per week, so a re-render (a new message) keeps them.
const memory = new Map<string, CheckInAnswers>();
// Weeks whose card he opened with Answer (kept open across re-renders).
const opened = new Set<string>();

/** Test-only. */
export function resetCheckInMemory(): void {
  memory.clear();
  opened.clear();
}

function questionRow(
  q: CheckInQuestionView,
  picks: CheckInAnswers,
  onPick: () => void,
): { el: HTMLElement; controls: HTMLElement[] } {
  const labelId = `checkin-q-${q.id}`;
  const chips: HTMLElement[] = [];
  const paint = () => {
    const chosen = picks[q.id];
    chips.forEach((chip, i) => {
      const n = SCORES[i] as CheckInScore;
      const on = chosen === n;
      chip.setAttribute('aria-checked', on ? 'true' : 'false');
      chip.setAttribute('class', on ? 'checkin-chip on' : 'checkin-chip');
      // Roving tabindex: the picked chip (or the first) is the one tab stop.
      chip.setAttribute('tabindex', on || (chosen === undefined && i === 0) ? '0' : '-1');
      chip.replaceChildren(
        ...(on ? [icon('check', 'sm')] : []),
        h('span', { class: 'checkin-num' }, String(n)),
      );
    });
  };
  const pick = (n: CheckInScore, focus: boolean) => {
    picks[q.id] = n;
    paint();
    if (focus) chips[n - 1]?.focus();
    onPick();
  };
  for (const n of SCORES) {
    chips.push(
      h('button', {
        type: 'button',
        role: 'radio',
        'aria-label': `${n}${n === 1 ? `, ${q.low}` : n === 5 ? `, ${q.high}` : ''}`,
        'data-checkin-pick': `${q.id}:${n}`,
        onclick: () => pick(n, false),
        onkeydown: (ev: Event) => {
          const k = (ev as KeyboardEvent).key;
          const step =
            k === 'ArrowRight' || k === 'ArrowDown'
              ? 1
              : k === 'ArrowLeft' || k === 'ArrowUp'
                ? -1
                : 0;
          if (!step) return;
          ev.preventDefault();
          const from = picks[q.id] ?? n;
          const next = (((from - 1 + step + 5) % 5) + 1) as CheckInScore;
          pick(next, true);
        },
      }),
    );
  }
  paint();
  const el = h(
    'div',
    { class: 'checkin-q', 'data-checkin-q': q.id },
    h('p', { class: 'checkin-label', id: labelId }, q.label),
    h('div', { class: 'checkin-chips', role: 'radiogroup', 'aria-labelledby': labelId }, ...chips),
    h(
      'div',
      { class: 'checkin-ends', 'aria-hidden': 'true' },
      h('span', {}, `1 ${q.low}`),
      h('span', {}, `5 ${q.high}`),
    ),
  );
  return { el, controls: chips };
}

export function buildCheckInCard(p: CheckInCardProps, a: CheckInCardActions): Built {
  const pending = p.status === 'pending';
  const head = h(
    'h3',
    { class: 'checkin-title' },
    icon('calendar', 'sm'),
    pending
      ? h('span', { 'data-checkin-compact': true }, CHECKIN_COMPACT)
      : h('span', {}, CHECKIN_TITLE),
  );
  const shell = (...kids: (HTMLElement | null)[]) =>
    h(
      'section',
      {
        class: 'checkin-card',
        'data-checkin-card': true,
        'data-week': p.weekStart,
        'data-card-status': p.status,
        'aria-label': CHECKIN_TITLE,
      },
      head,
      ...kids,
    );

  if (!pending) {
    memory.delete(p.weekStart);
    opened.delete(p.weekStart);
    const text = p.status === 'skipped' ? CHECKIN_SKIPPED : checkInSummary(p.questions, p.saved);
    return {
      el: shell(
        h(
          'p',
          { class: 'checkin-summary', 'data-checkin-summary': p.status, role: 'status' },
          icon(p.status === 'skipped' ? 'skip' : 'check', 'sm'),
          h('span', {}, text),
        ),
      ),
      controls: [],
    };
  }

  const picks = memory.get(p.weekStart) ?? {};
  memory.set(p.weekStart, picks);
  const need = h('p', { class: 'checkin-need muted', 'data-checkin-need': true }, CHECKIN_NEED_ONE);
  // M13d task 40f: Done is the card's main round button (circle + word in a wide pill); Skip a
  // secondary circle with its word under it; Answer the main pill while collapsed.
  const done = iconButton({
    icon: 'check',
    label: CHECKIN_DONE,
    variant: 'main',
    wideHit: true,
    class: 'cb-bar checkin-done',
    hooks: { 'data-checkin-done': true },
    onClick: () => {
      const answers: CheckInAnswers = {};
      for (const q of p.questions) {
        const v = picks[q.id];
        if (v !== undefined) answers[q.id] = v;
      }
      if (Object.keys(answers).length) a.onDone(answers);
    },
  });
  const sync = () => {
    const any = p.questions.some((q) => picks[q.id] !== undefined);
    if (any) {
      done.removeAttribute('disabled');
      need.setAttribute('hidden', '');
    } else {
      done.setAttribute('disabled', '');
      need.removeAttribute('hidden');
    }
  };
  const rows = p.questions.map((q) => questionRow(q, picks, sync));
  const skip = iconButton({
    icon: 'skip',
    label: CHECKIN_SKIP,
    ariaLabel: CHECKIN_SKIP,
    class: 'checkin-skip',
    hooks: { 'data-checkin-skip': true },
    onClick: () => a.onSkip(),
  });

  sync();
  const bodyId = `checkin-body-${p.weekStart}`;
  const body = h(
    'div',
    { class: 'checkin-body', id: bodyId, 'data-checkin-body': true },
    h('p', { class: 'checkin-intro' }, icon('lock', 'sm'), h('span', {}, CHECKIN_INTRO)),
    ...rows.map((r) => r.el),
    need,
    done,
  );
  const answer = iconButton({
    icon: 'arrow-right',
    label: CHECKIN_ANSWER,
    variant: 'main',
    wideHit: true,
    class: 'cb-bar checkin-answer',
    hooks: { 'data-checkin-answer': true, 'aria-controls': bodyId },
    onClick: () => {},
  });
  const el = shell(body, h('div', { class: 'checkin-actions' }, answer, skip));
  const show = (open: boolean) => {
    el.setAttribute('data-expanded', open ? 'true' : 'false');
    // The visible word under the circle ("Skip" while collapsed); the name stays "Skip this week".
    setIconButtonLabel(skip, open ? CHECKIN_SKIP : CHECKIN_SKIP_SHORT);
    answer.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      body.removeAttribute('hidden');
      answer.setAttribute('hidden', '');
    } else {
      body.setAttribute('hidden', '');
      answer.removeAttribute('hidden');
    }
  };
  answer.addEventListener('click', () => {
    opened.add(p.weekStart);
    show(true);
    const first = rows[0]?.controls.find((c) => c.getAttribute('tabindex') === '0');
    first?.focus();
  });
  show(opened.has(p.weekStart));
  return {
    el,
    controls: [answer, ...rows.flatMap((r) => r.controls), done, skip],
  };
}

export function checkInCard(p: CheckInCardProps, a: CheckInCardActions): HTMLElement {
  return buildCheckInCard(p, a).el;
}
