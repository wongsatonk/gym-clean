// M5 task 12: the Summary "Focus" section. Per exercise with camera sets: one row per set
// ("Set 2 · Focus 80"), the cues that fired with counts, the partials, and one explainer line.
// Shown, not spoken (Summary is read after the workout). Pure rendering of the stored SetLog
// fields (focusScore, cues, partials); the score itself is computed in core (focusScore.ts).
// app.ts mounts it next to the Coach section.

import type { FocusCueId, SetLog } from '../core/types';
import { h } from './dom';
import './focusSummary.css';

/**
 * Short shown labels, the first sentence of each SPEC M5 spoken cue. Core's `CUE_TEXT`
 * (task 3) can be passed to `createFocusSummary` / `focusRows` as overrides once it lands;
 * `cueLabelFromText` turns a cue text into a label ("Stay with it. {N} to go." → "Stay with it").
 */
export const FOCUS_CUE_LABEL: Readonly<Record<FocusCueId, string>> = {
  rushedLowering: 'Slow the lowering',
  shrinkingRange: 'Full range',
  stalled: 'Stay with it',
  outOfFrame: 'Step back into frame',
  lowFps: 'Move closer to the light',
  armsOutOfSync: 'Both arms together',
  raiseTooHigh: 'Stop at shoulder height',
  elbowDrift: 'Keep your elbow still',
  bodySwing: 'Keep your body still',
  hipSag: 'Keep your body straight',
};

export const FOCUS_EXPLAINER = 'Start 100 · −10 per cue · −5 per partial or stall';
export const CLEAN_SET_TEXT = 'Clean set';

export type CueLabels = Partial<Readonly<Record<FocusCueId, string>>>;

// ---------- pure helpers ----------

/** First sentence of a cue text, without its period: "Slow the lowering." → "Slow the lowering". */
export function cueLabelFromText(text: string): string {
  const dot = text.indexOf('.');
  return (dot >= 0 ? text.slice(0, dot) : text).trim();
}

/** "Slow the lowering ×2"; a single detection is just the label. */
export function cueCountText(label: string, count: number): string {
  return count > 1 ? `${label} ×${count}` : label;
}

export function partialsText(n: number): string {
  return `${n} ${n === 1 ? 'partial' : 'partials'}`;
}

export type FocusCueCount = { id: FocusCueId; label: string; count: number };
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
        label: cueLabelFromText(labels[id] ?? FOCUS_CUE_LABEL[id] ?? id),
        count,
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
    h('li', { class: 'focus-cue', 'data-focus-cue': c.id }, cueCountText(c.label, c.count)),
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
 * (pass core's CUE_TEXT).
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
