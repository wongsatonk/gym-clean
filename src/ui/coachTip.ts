// M5b task 4: the Rest-screen coach tip. One labelled line ("Coach" + icon, so it isn't colour
// only), the advice text, a smaller "why" line with the numbers, and for A3 an "Apply" button
// that reports the weight through `onApply` and then shows "Applied: 40 lb next set" (no repeat
// taps). It never dispatches anything itself: app.ts sends APPLY_NEXT_WEIGHT and speaks `say`.
// Rest re-renders on every dispatch, so app.ts keeps one instance per logged set and calls
// `update` instead of rebuilding.

import { formatWeight, type Unit } from '../core/units';
import { h } from './dom';
import './coach.css';

/**
 * The fields of core's `Advice` (src/core/advice.ts) this component reads. Structural, so an
 * `Advice` is passed as is.
 */
export type CoachTipAdvice = {
  readonly rule: string;
  readonly text: string;
  readonly why: string;
  readonly apply?: { readonly weightKg: number } | undefined;
};

export type CoachTipOptions = {
  advice: CoachTipAdvice;
  /** Display unit for the Apply / Applied labels. */
  unit: Unit;
  /** Called once, with the advice's `apply.weightKg`, when Apply is tapped. */
  onApply?: (weightKg: number) => void;
  /**
   * Whether Apply may be offered now (only while the upcoming set is the advice's exercise).
   * Default true. Without `onApply` or `advice.apply` there is never a button.
   */
  canApply?: boolean;
  /** Start in the "Applied" state (e.g. the instance was rebuilt after APPLY_NEXT_WEIGHT). */
  applied?: boolean;
};

export type CoachTipUpdate = { canApply?: boolean; applied?: boolean; unit?: Unit };

export type CoachTipHandle = {
  readonly el: HTMLElement;
  /**
   * New advice for the same logged set (a "Last set" fix, a re-render). `null` hides the tip.
   * The Applied state stays while the advice still suggests the same weight; a different
   * suggestion (or none) clears it.
   */
  update(advice: CoachTipAdvice | null, state?: CoachTipUpdate): void;
};

// ---------- pure helpers ----------

/** "40 lb", "62.5 kg". */
export function weightLabel(weightKg: number, unit: Unit): string {
  return `${formatWeight(weightKg, unit)} ${unit}`;
}

/** Visible Apply button text: "Apply 40 lb". */
export function applyText(weightKg: number, unit: Unit): string {
  return `Apply ${weightLabel(weightKg, unit)}`;
}

/** The state after Apply: "Applied: 40 lb next set". */
export function appliedText(weightKg: number, unit: Unit): string {
  return `Applied: ${weightLabel(weightKg, unit)} next set`;
}

/** What the tip shows for its Apply slot. */
export type ApplySlot = 'none' | 'button' | 'applied';

export function applySlot(
  advice: CoachTipAdvice | null,
  o: { hasHandler: boolean; canApply: boolean; applied: boolean },
): ApplySlot {
  if (!advice?.apply) return 'none';
  if (o.applied) return 'applied';
  return o.hasHandler && o.canApply ? 'button' : 'none';
}

/** Same suggested weight (to the gram): keeps the Applied state across updates. */
export function sameApply(a: CoachTipAdvice | null, b: CoachTipAdvice | null): boolean {
  const wa = a?.apply?.weightKg;
  const wb = b?.apply?.weightKg;
  return wa !== undefined && wb !== undefined && Math.abs(wa - wb) < 0.001;
}

// ---------- component ----------

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Original icon: a speech bubble with a rising arrow (decorative: the "Coach" label says it). */
function coachIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '28');
  svg.setAttribute('height', '28');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('coach-icon');
  for (const d of [
    'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z',
    'M8.5 12.5l3-3 2 2 3-3.5',
    'M14 8h2.5v2.5',
  ]) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

export function createCoachTip(opts: CoachTipOptions): CoachTipHandle {
  let advice: CoachTipAdvice | null = opts.advice;
  let unit = opts.unit;
  let canApply = opts.canApply ?? true;
  let applied = opts.applied ?? false;
  let slot: ApplySlot | null = null;

  const text = h('p', { class: 'coach-text', 'data-coach': 'text' });
  const why = h('p', { class: 'coach-why', 'data-coach': 'why' });
  const applyBtn = h('button', {
    type: 'button',
    class: 'coach-apply',
    'data-coach': 'apply',
    onclick: () => onApplyTap(),
  });
  const appliedEl = h('p', {
    class: 'coach-applied',
    role: 'status',
    tabindex: '-1',
    'data-coach': 'applied',
  });
  const el = h(
    'section',
    { class: 'coach-tip', 'aria-label': 'Coach tip', 'data-coach-tip': '' },
    h('p', { class: 'coach-label' }, coachIcon(), h('span', {}, 'Coach')),
    text,
    why,
    applyBtn,
    appliedEl,
  );

  function onApplyTap(): void {
    const w = advice?.apply?.weightKg;
    if (applied || w === undefined || !opts.onApply) return;
    applied = true;
    opts.onApply(w);
    render();
    appliedEl.focus(); // the button is gone: keep focus on its result
  }

  function render(): void {
    el.hidden = advice === null;
    if (!advice) return;
    el.dataset.adviceRule = advice.rule;
    if (text.textContent !== advice.text) text.textContent = advice.text;
    if (why.textContent !== advice.why) why.textContent = advice.why;
    why.hidden = advice.why === '';
    const next = applySlot(advice, { hasHandler: !!opts.onApply, canApply, applied });
    const w = advice.apply?.weightKg;
    if (w !== undefined) {
      applyBtn.textContent = applyText(w, unit);
      applyBtn.setAttribute('aria-label', `Apply ${weightLabel(w, unit)} to the next set`);
      appliedEl.textContent = appliedText(w, unit);
    }
    if (next !== slot) {
      slot = next;
      applyBtn.hidden = next !== 'button';
      appliedEl.hidden = next !== 'applied';
      el.dataset.coachApply = next;
    }
  }

  render();

  return {
    el,
    update(nextAdvice, state = {}) {
      if (!sameApply(advice, nextAdvice)) applied = false;
      advice = nextAdvice;
      if (state.unit !== undefined) unit = state.unit;
      if (state.canApply !== undefined) canApply = state.canApply;
      if (state.applied !== undefined) applied = state.applied;
      render();
    },
  };
}
