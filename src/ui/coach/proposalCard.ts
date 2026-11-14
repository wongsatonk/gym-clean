// M10 Proposal card (SPEC M10 "Coach chat"): what a trainer action would change, before → after,
// a why line, and two buttons. Nothing changes until Apply (the CTA, the only action-colour fill);
// Not now is a neutral surface-2 button. Props in, callbacks out; the app owns the Proposal.
//
// Also the red-flag card: the fixed red-flag line (from core) with the only two buttons the SPEC
// allows (End workout / Not today). Danger is used here because it is a stop, with a flag icon
// and words, never colour alone (M4e "danger only in confirmations").
//
// e2e hooks: `data-proposal` on the card, buttons "Apply" / "Not now"; `data-redflag` on the
// red-flag card, buttons "End workout" / "Not today".
import type { Proposal } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import './coach.css';

export type ProposalCardProps = Pick<Proposal, 'title' | 'lines' | 'why'>;

export type ProposalCardActions = {
  onApply: () => void;
  onDismiss: () => void;
};

/** Built card plus its controls in tab order (the coach sheet's focus trap uses them). */
export type Built = { el: HTMLElement; controls: HTMLElement[] };

/** Screen-reader text for one row; the visible row uses an arrow glyph that is aria-hidden. */
export function rowLabel(line: { before: string; after: string }): string {
  if (!line.before) return `Add ${line.after}`;
  if (!line.after) return `${line.before}, removed`;
  return `${line.before}, becomes ${line.after}`;
}

function row(line: { before: string; after: string }): HTMLElement {
  return h(
    'li',
    { class: 'proposal-row', 'aria-label': rowLabel(line) },
    h('span', { class: 'proposal-before', 'aria-hidden': 'true' }, line.before || '—'),
    h(
      'span',
      { class: 'proposal-after', 'aria-hidden': 'true' },
      h('span', { class: 'proposal-arrow' }, '→'),
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
    h('ul', { class: 'proposal-rows' }, ...p.lines.map(row)),
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
