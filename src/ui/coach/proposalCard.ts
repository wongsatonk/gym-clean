// M10 Proposal card (SPEC M10 "Coach chat"): what a trainer action would change, before → after,
// a why line, and two buttons. Nothing changes until Apply (the CTA, the only action-colour fill);
// Not now is a neutral surface-2 button. Props in, callbacks out; the app owns the Proposal.
//
// Also the red-flag card: the fixed red-flag line (from core) with the only two buttons the SPEC
// allows (End workout / Not today). Danger is used here because it is a stop, with a flag icon
// and words, never colour alone (M4e "danger only in confirmations").
//
// M12 (task 10): a card in the chat thread outlives its answer. `buildCardOutcome` draws the
// status line that replaces Apply / Not now once answered (shared with the focus-block card):
// applied (+ Undo), not now, undone, expired (+ Ask again). Apply → the check pops in
// (motion.ts checkMorph) on the render right after it.
//
// M12 slice 1b (short on time): accessories done back to back show as pair lines, "Curl +
// Triceps: back to back, 45 s rest". A pair line is a row whose `after` says "back to back"
// (core writes it into `lines`, so a stored chat card keeps it), or an entry of the optional
// `pairs` prop. Either way it is one sentence under a "Pair" tag (icon + word, `data-pair`),
// with no before → after arrow: nothing is replaced, two exercises just share a rest.
//
// e2e hooks: `data-proposal` on the card, buttons "Apply" / "Not now"; `data-redflag` on the
// red-flag card, buttons "End workout" / "Not today"; `data-card-status=<status>` on an answered
// card's status line, buttons "Undo" / "Ask again".
import type { ChatCardStatus, PlannedExercise, Proposal } from '../../core/types';
import { h } from '../dom';
import { icon, type IconName } from '../icons';
import { checkMorph } from '../motion';
import './coach.css';

export type ProposalCardProps = Pick<Proposal, 'title' | 'lines' | 'why'> & {
  /** M12 1b: accessories paired back to back, drawn as pair lines after `lines`. */
  pairs?: readonly PairLine[] | undefined;
};

/** Two exercises (display names) done back to back, then one short rest. */
export type PairLine = { a: string; b: string; restSec: number };

/** The pair rest when the caller has none (core's time rules own the real value). */
export const PAIR_REST_SEC = 45;

/** "Curl + Triceps: back to back, 45 s rest". */
export function pairText(p: PairLine): string {
  return `${p.a} + ${p.b}: back to back, ${p.restSec} s rest`;
}

/** Whether a proposal row is a pair line (its `after` says "back to back"). */
export function isPairLine(line: { before: string; after: string }): boolean {
  return /\bback to back\b/i.test(line.after);
}

/**
 * The pairs in a day, once each, in day order, from `PlannedExercise.pairWith` (either side may
 * carry it). `restSec` is the pair rest (core's time rules); default 45.
 */
export function pairsOf(
  exercises: readonly Pick<PlannedExercise, 'exerciseId' | 'pairWith'>[],
  name: (exerciseId: string) => string,
  restSec: number = PAIR_REST_SEC,
): PairLine[] {
  const ids = new Set(exercises.map((e) => e.exerciseId));
  const seen = new Set<string>();
  const out: PairLine[] = [];
  for (const e of exercises) {
    const other = e.pairWith;
    if (!other || other === e.exerciseId || !ids.has(other)) continue;
    if (seen.has(e.exerciseId) || seen.has(other)) continue;
    seen.add(e.exerciseId);
    seen.add(other);
    out.push({ a: name(e.exerciseId), b: name(other), restSec });
  }
  return out;
}

export type ProposalCardActions = {
  onApply: () => void;
  onDismiss: () => void;
};

/** Built card plus its controls in tab order (the coach sheet's focus trap uses them). */
export type Built = { el: HTMLElement; controls: HTMLElement[] };

/** Screen-reader text for one row; the visible row uses an arrow glyph that is aria-hidden. */
export function rowLabel(line: { before: string; after: string }): string {
  if (isPairLine(line)) return `Pair: ${pairLineText(line)}`;
  if (!line.before) return `Add ${line.after}`;
  if (!line.after) return `${line.before}, removed`;
  return `${line.before}, becomes ${line.after}`;
}

/**
 * A pair line as one sentence. Core's short-on-time rows are `before: "Curl + Triceps"`,
 * `after: "Back to back, 45 s rest"` → "Curl + Triceps: back to back, 45 s rest".
 */
export function pairLineText(line: { before: string; after: string }): string {
  if (!line.before) return line.after;
  return `${line.before}: ${line.after.charAt(0).toLowerCase()}${line.after.slice(1)}`;
}

/** A pair line: the "Pair" tag (icon + word), then the sentence. No arrow: nothing is replaced. */
function pairRow(line: { before: string; after: string }): HTMLElement {
  return h(
    'li',
    { class: 'proposal-row proposal-pair', 'data-pair': true, 'aria-label': rowLabel(line) },
    h('span', { class: 'pair-tag', 'aria-hidden': 'true' }, icon('flip', 'sm'), 'Pair'),
    h('span', { class: 'proposal-after', 'aria-hidden': 'true' }, pairLineText(line)),
  );
}

function row(line: { before: string; after: string }): HTMLElement {
  if (isPairLine(line)) return pairRow(line);
  return h(
    'li',
    { class: 'proposal-row', 'aria-label': rowLabel(line) },
    h('span', { class: 'proposal-before', 'aria-hidden': 'true' }, line.before || '—'),
    h(
      'span',
      { class: 'proposal-after', 'aria-hidden': 'true' },
      h('span', { class: 'proposal-arrow' }, icon('arrow-right', 'sm')),
      line.after || 'Removed',
    ),
  );
}

export function buildProposalCard(p: ProposalCardProps, a: ProposalCardActions): Built {
  const apply = h(
    'button',
    { type: 'button', class: 'primary-btn cta-btn proposal-apply', onclick: a.onApply },
    icon('check', 'lg'),
    'Apply',
  );
  const dismiss = h(
    'button',
    { type: 'button', class: 'cs-btn proposal-dismiss', onclick: a.onDismiss },
    icon('close', 'md'),
    h('span', {}, 'Not now'),
  );
  const el = h(
    'section',
    { class: 'proposal-card', 'data-proposal': true, 'aria-label': p.title },
    h('h3', { class: 'proposal-title' }, p.title),
    h(
      'ul',
      { class: 'proposal-rows' },
      ...p.lines.map(row),
      ...(p.pairs ?? []).map((pair) => pairRow({ before: '', after: pairText(pair) })),
    ),
    h('p', { class: 'proposal-why' }, p.why),
    h('div', { class: 'proposal-actions' }, apply, dismiss),
  );
  return { el, controls: [apply, dismiss] };
}

export function proposalCard(p: ProposalCardProps, a: ProposalCardActions): HTMLElement {
  return buildProposalCard(p, a).el;
}

export type RedFlagActions = {
  /** Shown only when a workout is running (from the Pause sheet). */
  onEndWorkout?: (() => void) | undefined;
  onNotToday?: (() => void) | undefined;
};

export function buildRedFlagCard(text: string, a: RedFlagActions): Built {
  const controls: HTMLElement[] = [];
  if (a.onEndWorkout) {
    controls.push(
      h(
        'button',
        { type: 'button', class: 'cs-btn redflag-end', onclick: a.onEndWorkout },
        icon('flag', 'md'),
        h('span', {}, 'End workout'),
      ),
    );
  }
  if (a.onNotToday) {
    controls.push(
      h(
        'button',
        { type: 'button', class: 'cs-btn', onclick: a.onNotToday },
        icon('calendar', 'md'),
        h('span', {}, 'Not today'),
      ),
    );
  }
  const el = h(
    'section',
    { class: 'redflag-card', 'data-redflag': true, role: 'alert' },
    h(
      'p',
      { class: 'redflag-text' },
      icon('flag', 'lg', { class: 'redflag-icon' }),
      h('span', {}, text),
    ),
    controls.length ? h('div', { class: 'redflag-actions' }, ...controls) : null,
  );
  return { el, controls };
}

export function redFlagCard(text: string, a: RedFlagActions): HTMLElement {
  return buildRedFlagCard(text, a).el;
}

export type AnsweredStatus = Exclude<ChatCardStatus, 'pending'>;

export type OutcomeActions = {
  /** Applied card: Undo (omit when this change can no longer be undone). */
  onUndo?: (() => void) | undefined;
  /** Expired card: ask the coach again (a fresh proposal on today's plan). */
  onAskAgain?: (() => void) | undefined;
};

const OUTCOME: Record<AnsweredStatus, { icon: IconName; text: string }> = {
  applied: { icon: 'check', text: 'Applied.' },
  dismissed: { icon: 'close', text: 'Not now. Nothing changed.' },
  undone: { icon: 'back', text: 'Undone. Your plan is back.' },
  expired: { icon: 'clock', text: 'Your plan changed since. This is out of date.' },
};

/** Pure: the words on an answered card's status line. */
export function outcomeText(status: AnsweredStatus): string {
  return OUTCOME[status].text;
}

/**
 * The status line of an answered card. `justApplied` plays the check morph (the Apply that was
 * just tapped); otherwise the check is simply there.
 */
export function buildCardOutcome(
  status: AnsweredStatus,
  a: OutcomeActions,
  opts: { justApplied?: boolean } = {},
): Built {
  const o = OUTCOME[status];
  const morph = status === 'applied' && opts.justApplied === true;
  const line = h(
    'p',
    { class: `card-outcome card-${status}`, 'data-card-status': status },
    morph ? null : icon(o.icon, 'md', { class: 'card-outcome-icon' }),
    h('span', {}, o.text),
  );
  if (morph) checkMorph(line, icon('check', 'md', { class: 'card-outcome-icon' }));
  const controls: HTMLElement[] = [];
  if (status === 'applied' && a.onUndo) {
    controls.push(
      h(
        'button',
        { type: 'button', class: 'cs-btn card-undo', 'data-card-undo': true, onclick: a.onUndo },
        icon('back', 'md'),
        h('span', {}, 'Undo'),
      ),
    );
  }
  if (status === 'expired' && a.onAskAgain) {
    controls.push(
      h(
        'button',
        { type: 'button', class: 'cs-btn card-ask', 'data-card-ask': true, onclick: a.onAskAgain },
        icon('chat', 'md'),
        h('span', {}, 'Ask again'),
      ),
    );
  }
  const el = h(
    'div',
    { class: 'card-outcome-row' },
    line,
    controls.length ? h('div', { class: 'card-outcome-actions' }, ...controls) : null,
  );
  return { el, controls };
}

/**
 * A proposal card in the chat thread. Pending → the M10 card (Apply / Not now); answered → its
 * title and the status line (before → after rows are no longer needed in an old card).
 */
export function buildThreadProposalCard(
  p: ProposalCardProps,
  status: ChatCardStatus,
  a: ProposalCardActions & OutcomeActions,
  opts: { justApplied?: boolean } = {},
): Built {
  if (status === 'pending') return buildProposalCard(p, a);
  const out = buildCardOutcome(status, a, opts);
  const el = h(
    'section',
    {
      class: `proposal-card proposal-answered`,
      'data-proposal': true,
      'data-proposal-status': status,
      'aria-label': p.title,
    },
    h('h3', { class: 'proposal-title' }, p.title),
    out.el,
  );
  return { el, controls: out.controls };
}
