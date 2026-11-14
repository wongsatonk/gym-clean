// M5b task 5: the Summary "Coach" section. Per exercise done today: its name, one next-time line
// (N1–N6) with its "why", and a positive progress chip vs last time (P1–P2). Shown, not spoken.
// Pure rendering of core's `coachSummary(...)` output; app.ts mounts it above the set list.

import { h } from './dom';
import './coach.css';

/** The fields of core's `Advice` this section reads (structural: pass `Advice` as is). */
export type CoachSummaryAdvice = {
  readonly rule: string;
  readonly text: string;
  readonly why: string;
};

/** One entry of core's `coachSummary(s, last, name)`. */
export type CoachSummaryEntry = {
  readonly exerciseId: string;
  readonly next: CoachSummaryAdvice | null;
  readonly progress: string | null;
};

export const ALL_GOOD_TEXT = 'All good. Same plan next time.';

// ---------- pure helpers ----------

/**
 * The exercise name is the row heading, so the line drops it:
 * "Next time on Dumbbell Bench Press: +5 lb." → "Next time: +5 lb.". Other texts are unchanged.
 */
export function nextLineText(text: string, name: string): string {
  const prefix = `Next time on ${name}: `;
  return text.startsWith(prefix) ? `Next time: ${text.slice(prefix.length)}` : text;
}

/** "Dumbbell Bench Press: 22.5 kg, up from 20 kg." → "22.5 kg, up from 20 kg." */
export function progressChipText(progress: string, name: string): string {
  const prefix = `${name}: `;
  return progress.startsWith(prefix) ? progress.slice(prefix.length) : progress;
}

export type CoachRow = {
  exerciseId: string;
  name: string;
  /** Next-time line, name stripped; ALL_GOOD_TEXT when there is no advice. */
  next: string;
  why: string;
  rule: string;
  progress: string | null;
};

export function coachRows(
  entries: readonly CoachSummaryEntry[],
  name: (exerciseId: string) => string,
): CoachRow[] {
  return entries.map((e) => {
    const n = name(e.exerciseId);
    return {
      exerciseId: e.exerciseId,
      name: n,
      next: e.next ? nextLineText(e.next.text, n) : ALL_GOOD_TEXT,
      why: e.next?.why ?? '',
      rule: e.next?.rule ?? '',
      progress: e.progress ? progressChipText(e.progress, n) : null,
    };
  });
}

// ---------- component ----------

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(paths: string[], cls: string, size: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add(cls);
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2.5');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

/** Original icons: the coach speech bubble with a rising line (same as the Rest tip) and an up arrow. */
const coachIcon = () =>
  icon(
    [
      'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z',
      'M8.5 12.5l3-3 2 2 3-3.5',
      'M14 8h2.5v2.5',
    ],
    'coach-icon',
    32,
  );
const upIcon = () => icon(['M12 19V5', 'M6 11l6-6 6 6'], 'coach-up-icon', 22);

/**
 * The Summary "Coach" section, or null when no exercise was done today. `name` maps an
 * exercise id to its display name (the same one core used to build the texts).
 */
export function createCoachSummary(
  entries: readonly CoachSummaryEntry[],
  name: (exerciseId: string) => string,
): HTMLElement | null {
  const rows = coachRows(entries, name);
  if (rows.length === 0) return null;
  const headingId = 'coach-summary-title';
  return h(
    'section',
    { class: 'coach-summary', 'aria-labelledby': headingId, 'data-coach-summary': '' },
    h('h2', { class: 'coach-summary-title', id: headingId }, coachIcon(), h('span', {}, 'Coach')),
    h(
      'ul',
      { class: 'coach-list' },
      ...rows.map((r) =>
        h(
          'li',
          {
            class: 'coach-item',
            'data-coach-exercise': r.exerciseId,
            'data-advice-rule': r.rule || undefined,
          },
          h('strong', { class: 'coach-item-name' }, r.name),
          h('p', { class: 'coach-next', 'data-coach': 'next' }, r.next),
          r.why ? h('p', { class: 'coach-why', 'data-coach': 'why' }, r.why) : null,
          r.progress
            ? h(
                'p',
                { class: 'coach-progress', 'data-progress': '' },
                h('span', { class: 'coach-up' }, upIcon(), 'Up'),
                h('span', { class: 'coach-progress-text' }, r.progress),
              )
            : null,
        ),
      ),
    ),
  );
}
