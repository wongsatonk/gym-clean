// M5 task 12: the Summary "Focus" section. Per exercise with camera sets: one row per set
// ("Set 2 · Focus 80"), the cues that fired with counts, the partials, and one explainer line.
// Shown, not spoken (Summary is read after the workout). Pure rendering of the stored SetLog
// fields (focusScore, cues, partials); the score itself is computed in core (focusScore.ts).
// app.ts mounts it next to the Coach section.

import { CUE_TEXT } from '../core/focus';
import { cueWeight } from '../core/focusScore';
import type { FocusCueId, SetLog } from '../core/types';
import { h } from './dom';
import './focusSummary.css';

export const FOCUS_EXPLAINER = 'Start 100 · −10 per cue · −5 per partial or stall';
export const CLEAN_SET_TEXT = 'Clean set';
/** Shown after a cue that costs no points (placement/light), so a 100 with it isn't a puzzle. */
export const NOT_SCORED_TEXT = '(not scored)';

export type CueLabels = Partial<Readonly<Record<FocusCueId, string>>>;

// ---------- pure helpers ----------

/** First sentence of a cue text, without its period: "Slow the lowering." → "Slow the lowering". */
export function cueLabelFromText(text: string): string {
  const dot = text.indexOf('.');
  return (dot >= 0 ? text.slice(0, dot) : text).trim();
}

/** Shown label for a cue: the first sentence of core's spoken CUE_TEXT ("Stay with it"). */
export function focusCueLabel(id: FocusCueId): string {
  return cueLabelFromText(CUE_TEXT[id] ?? id);
}

/** "Slow the lowering ×2"; a single detection is just the label. */
export function cueCountText(label: string, count: number): string {
  return count > 1 ? `${label} ×${count}` : label;
}

export function partialsText(n: number): string {
  return `${n} ${n === 1 ? 'partial' : 'partials'}`;
}

export type FocusCueCount = {
  id: FocusCueId;
  label: string;
  count: number;
  /** false when the cue costs no points (core cueWeight 0: out of frame, low light). */
  scored: boolean;
};

/** "Step back into frame ×2 (not scored)". */
export function cueLineText(c: FocusCueCount): string {
  const text = cueCountText(c.label, c.count);
  return c.scored ? text : `${text} ${NOT_SCORED_TEXT}`;
}
export type FocusSetRow = {
  /** 1-based, as on the Exercise screen. */
  setNumber: number;
  /** Rounded and clamped to 0–100 for display. */
  score: number;
  cues: FocusCueCount[];
  partials: number;
};
export type FocusExerciseRow = { exerciseId: string; name: string; sets: FocusSetRow[] };

/**
 * Camera sets (those with a stored focusScore) grouped by exercise in day order. Manual sets
 * have no score and are left out; an exercise with only manual sets gets no row.
 */
export function focusRows(
  logs: readonly SetLog[],
  name: (exerciseId: string) => string,
  labels: CueLabels = {},
): FocusExerciseRow[] {
  const byId = new Map<string, FocusExerciseRow>();
  for (const l of logs) {
    if (typeof l.focusScore !== 'number' || !Number.isFinite(l.focusScore)) continue;
    let row = byId.get(l.exerciseId);
    if (!row) {
      row = { exerciseId: l.exerciseId, name: name(l.exerciseId), sets: [] };
      byId.set(l.exerciseId, row);
    }
    const counts = new Map<FocusCueId, number>();
    for (const id of l.cues ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    row.sets.push({
      setNumber: l.setIndex + 1,
      score: Math.min(100, Math.max(0, Math.round(l.focusScore))),
      cues: [...counts].map(([id, count]) => ({
        id,
        label: labels[id] ? cueLabelFromText(labels[id]) : focusCueLabel(id),
        count,
        scored: cueWeight(id) > 0,
      })),
      partials: Math.max(0, l.partials ?? 0),
    });
  }
  return [...byId.values()];
}

// ---------- component ----------

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Original icon: a target (focus). Decorative; the heading text carries the meaning. */
function focusIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '32');
  svg.setAttribute('height', '32');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('focus-icon');
  for (const r of ['9.5', '5.5', '1.5']) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', '12');
    c.setAttribute('cy', '12');
    c.setAttribute('r', r);
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', 'currentColor');
    c.setAttribute('stroke-width', '2.5');
    svg.append(c);
  }
  return svg;
}

function setItem(s: FocusSetRow): HTMLElement {
  const details: HTMLElement[] = s.cues.map((c) =>
    h(
      'li',
      { class: 'focus-cue', 'data-focus-cue': c.id, 'data-focus-unscored': !c.scored },
      cueLineText(c),
    ),
  );
  if (s.partials > 0)
    details.push(
      h('li', { class: 'focus-cue', 'data-focus-partials': s.partials }, partialsText(s.partials)),
    );
  return h(
    'li',
    {
      class: 'focus-set',
      'data-focus-set': s.setNumber,
      'data-focus-score': s.score,
    },
    h(
      'p',
      { class: 'focus-set-head' },
      h('span', { class: 'focus-set-label' }, `Set ${s.setNumber} · Focus`),
      ' ',
      h('span', { class: 'focus-score' }, s.score),
    ),
    details.length > 0
      ? h('ul', { class: 'focus-cues' }, ...details)
      : h('p', { class: 'focus-clean' }, CLEAN_SET_TEXT),
  );
}

/**
 * The Summary "Focus" section, or null when no set today has a focus score (manual sets only).
 * `name` maps an exercise id to its display name; `labels` optionally overrides cue labels
 * (default: from core's CUE_TEXT).
 */
export function createFocusSummary(
  logs: readonly SetLog[],
  name: (exerciseId: string) => string,
  labels: CueLabels = {},
): HTMLElement | null {
  const rows = focusRows(logs, name, labels);
  if (rows.length === 0) return null;
  const headingId = 'focus-summary-title';
  return h(
    'section',
    { class: 'focus-summary', 'aria-labelledby': headingId, 'data-focus-summary': '' },
    h('h2', { class: 'focus-summary-title', id: headingId }, focusIcon(), h('span', {}, 'Focus')),
    h(
      'ul',
      { class: 'focus-list' },
      ...rows.map((r) =>
        h(
          'li',
          { class: 'focus-item', 'data-focus-exercise': r.exerciseId },
          h('h3', { class: 'focus-item-name' }, r.name),
          h('ul', { class: 'focus-sets' }, ...r.sets.map(setItem)),
        ),
      ),
    ),
    h('p', { class: 'focus-explainer', 'data-focus-explainer': '' }, FOCUS_EXPLAINER),
  );
}
