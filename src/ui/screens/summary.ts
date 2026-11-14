// M4e Summary screen (Energy mood, docs/design/m4e-mix/summary.png). Pure render: data and
// callbacks in, element out. app.ts loads the history and runs the core selectors
// (volumeVsLast, previousSameDaySession, newBests) and passes their results here, plus the
// Fix last set, Coach and Focus elements it already builds.
//
// Order: hero (trophy, "Pull A done", date · duration) → volume card with vs-last bars →
// new-best tiles → sets / reps / exercises / long-rest tiles → Fix last set → Focus → the set
// list with today's notes → Coach ("Next time", kept low-key, last) → Done.
//
// Volume card modes (`volumeMode`):
// - 'compare': weight was moved and there's a previous same-day session with volume: % pill + bars;
// - 'first': weight was moved, nothing to compare: the number plus a one-line note;
// - 'bodyweight': no weight moved today: the card shows total reps instead (and compares reps
//   when the last same-day session had any). The reps tile is then left out (it'd repeat).
//
// e2e hooks kept from the old Summary: the "Workout done" heading (the eyebrow inside the h1),
// `[data-stat="sets"|"volume"|"overruns"] .stat-value`, the volume unit text ("lb") inside
// `[data-stat="volume"]`, `.set-list` (li per exercise, `.skipped` li, "rest skipped",
// `.today-note`), `.section-title` "Sets", the Coach / Focus / Fix elements as passed in, and
// the "Done" button. Changed: the volume label is "Total volume" + unit (was "kg volume"), and
// `[data-stat="volume"]` is absent on a bodyweight-only day. New: `[data-screen="summary"]`
// keeps, plus `[data-stat="reps"|"exercises"]`, `[data-volume-mode]`, `[data-vs-last]`
// (data-tone up|flat|down), `[data-bar="last"|"today"]`, `[data-bests]`, `[data-best]`
// (data-best-kind weight|reps).
import { formatDuration } from '../../core/format';
import { sessionVolume, type NewBest } from '../../core/stats';
import type { SetLog } from '../../core/types';
import { formatWeight, toUnit, type Unit } from '../../core/units';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { dateLabel } from './today';

/** The previous session of the same day, as the volume card compares it. */
export type SummaryLast = { volumeKg: number; reps: number };

export type SummaryProps = {
  dayName: string;
  /** Session start (ms), for "Fri 13 Nov". */
  date: number;
  durationSec: number;
  unit: Unit;
  /** Today's sets (`s.logs`), in the order they were done. */
  logs: readonly SetLog[];
  /** Exercises planned for the day (`s.day.exercises.length`). */
  plannedExercises: number;
  restOverruns: number;
  /** Exercise ids skipped (`summarize(s).skipped`). */
  skipped: readonly string[];
  /** `volumeVsLast(s.logs, prevLogs)`; null on a first session or when either side moved no weight. */
  vsLastPct: number | null;
  /** The previous same-day session's volume and reps; null when there is none. */
  last: SummaryLast | null;
  /** `newBests(s.logs, history)`. */
  bests: readonly NewBest[];
  name: (exerciseId: string) => string;
  /** exerciseId → today's note (shown quoted under that exercise in the set list). */
  todayNotes?: Readonly<Record<string, string>> | undefined;
  /** `lastSetFix(s)`; null/omitted leaves it out. */
  fixEl?: HTMLElement | null | undefined;
  /** `createCoachSummary(...)`; null when no exercise was done. */
  coachEl?: HTMLElement | null | undefined;
  /** `createFocusSummary(...)`; null when no camera set. */
  focusEl?: HTMLElement | null | undefined;
};

export type SummaryActions = { onDone: () => void };

export type VolumeMode = 'compare' | 'first' | 'bodyweight';

// ---------- pure helpers ----------

export const totalReps = (logs: readonly Pick<SetLog, 'reps'>[]): number =>
  logs.reduce((n, l) => n + l.reps, 0);

export function volumeMode(
  volumeKg: number,
  vsLastPct: number | null,
  last: SummaryLast | null,
): VolumeMode {
  if (volumeKg <= 0) return 'bodyweight';
  return vsLastPct !== null && last !== null && last.volumeKg > 0 ? 'compare' : 'first';
}

/** A whole number in the display unit with thousands commas: 7420 → "7,420" (lb converted). */
export function volumeText(kg: number, unit: Unit): string {
  return Math.round(toUnit(kg, unit)).toLocaleString('en-US');
}

/** Bar widths in % (the larger value fills 100%); a non-zero value keeps a visible sliver. */
export function barWidths(today: number, last: number): { today: number; last: number } {
  const max = Math.max(today, last);
  if (max <= 0) return { today: 0, last: 0 };
  const pct = (v: number) => (v <= 0 ? 0 : Math.max(4, Math.round((v / max) * 100)));
  return { today: pct(today), last: pct(last) };
}

export type VsLine = { text: string; tone: 'up' | 'flat' | 'down' };

/** "+8% vs last Pull A" / "Same as last Pull A" / "−5% vs last Pull A". */
export function vsLastLine(pct: number, dayName: string): VsLine {
  if (pct > 0) return { text: `+${pct}% vs last ${dayName}`, tone: 'up' };
  if (pct === 0) return { text: `Same as last ${dayName}`, tone: 'flat' };
  return { text: `−${-pct}% vs last ${dayName}`, tone: 'down' };
}

/** Bodyweight days compare reps: "+12 reps vs last Push A". */
export function vsLastRepsLine(today: number, last: number, dayName: string): VsLine {
  const d = today - last;
  if (d > 0) return { text: `+${d} ${d === 1 ? 'rep' : 'reps'} vs last ${dayName}`, tone: 'up' };
  if (d === 0) return { text: `Same reps as last ${dayName}`, tone: 'flat' };
  return { text: `−${-d} ${d === -1 ? 'rep' : 'reps'} vs last ${dayName}`, tone: 'down' };
}

/** A new best's big line and its "was" line: "12 × 22.5" / "was 10 × 22.5 kg"; bodyweight "12 reps". */
export function bestTexts(b: NewBest, unit: Unit): { now: string; was: string } {
  const set = (reps: number, kg: number) =>
    kg > 0 ? `${reps} × ${formatWeight(kg, unit)}` : `${reps} ${reps === 1 ? 'rep' : 'reps'}`;
  const was = set(b.old.reps, b.old.weightKg);
  return { now: set(b.reps, b.weightKg), was: `was ${was}${b.old.weightKg > 0 ? ` ${unit}` : ''}` };
}

/** "8×40, 8×40 lb", as the old Summary showed sets; all-bodyweight sets read "15, 14, 12 reps". */
export function setsText(sets: readonly Pick<SetLog, 'reps' | 'weightKg'>[], unit: Unit): string {
  if (sets.length === 0) return '';
  if (sets.every((l) => l.weightKg <= 0)) return `${sets.map((l) => l.reps).join(', ')} reps`;
  return `${sets.map((l) => `${l.reps}×${formatWeight(l.weightKg, unit)}`).join(', ')} ${unit}`;
}

// ---------- component ----------

function bar(which: 'last' | 'today', label: string, width: number, value: string): HTMLElement {
  return h(
    'div',
    { class: `sum-bar sum-bar-${which}`, 'data-bar': which },
    h('span', { class: 'sum-bar-label' }, label),
    h(
      'span',
      { class: 'sum-bar-track', 'aria-hidden': 'true' },
      h('span', { class: 'sum-bar-fill', style: `width: ${width}%` }),
    ),
    h('span', { class: 'sum-bar-value' }, value),
  );
}

function vsBlock(line: VsLine, today: number, last: number, fmt: (n: number) => string) {
  const w = barWidths(today, last);
  return [
    h(
      'p',
      { class: `sum-vs sum-vs-${line.tone}`, 'data-vs-last': true, 'data-tone': line.tone },
      icon('trend', 'sm'),
      line.text,
    ),
    h(
      'div',
      { class: 'sum-bars' },
      bar('last', 'Last', w.last, fmt(last)),
      bar('today', 'Today', w.today, fmt(today)),
    ),
  ];
}

function volumeCard(p: SummaryProps, volumeKg: number, reps: number): HTMLElement {
  const mode = volumeMode(volumeKg, p.vsLastPct, p.last);
  if (mode === 'bodyweight') {
    const compare = p.last !== null && p.last.reps > 0;
    return h(
      'section',
      { class: 'sum-volume', 'data-volume-mode': mode, 'aria-label': 'Total reps' },
      h('p', { class: 'sum-volume-label' }, 'Total reps'),
      h(
        'p',
        { class: 'sum-volume-num', 'data-stat': 'reps' },
        h('span', { class: 'stat-value' }, String(reps)),
        h('span', { class: 'sum-volume-unit' }, reps === 1 ? 'rep' : 'reps'),
      ),
      ...(compare && p.last
        ? vsBlock(vsLastRepsLine(reps, p.last.reps, p.dayName), reps, p.last.reps, String)
        : [h('p', { class: 'sum-volume-note' }, 'Bodyweight day. Reps are the score.')]),
    );
  }
  return h(
    'section',
    { class: 'sum-volume', 'data-volume-mode': mode, 'aria-label': 'Total volume' },
    h('p', { class: 'sum-volume-label' }, 'Total volume'),
    h(
      'p',
      { class: 'sum-volume-num', 'data-stat': 'volume' },
      h('span', { class: 'stat-value' }, volumeText(volumeKg, p.unit)),
      h('span', { class: 'sum-volume-unit' }, p.unit),
    ),
    ...(mode === 'compare' && p.last && p.vsLastPct !== null
      ? vsBlock(vsLastLine(p.vsLastPct, p.dayName), volumeKg, p.last.volumeKg, (kg) =>
          volumeText(kg, p.unit),
        )
      : [
          h(
            'p',
            { class: 'sum-volume-note' },
            `Nothing to compare yet. Next ${p.dayName} shows the change.`,
          ),
        ]),
  );
}

function bestsBlock(p: SummaryProps): HTMLElement | null {
  if (p.bests.length === 0) return null;
  const n = p.bests.length;
  return h(
    'section',
    { class: 'sum-bests', 'aria-labelledby': 'sum-bests-title', 'data-bests': n },
    h(
      'h2',
      { class: 'sum-bests-title', id: 'sum-bests-title' },
      icon('medal', 'md'),
      `${n} new ${n === 1 ? 'best' : 'bests'}`,
    ),
    h(
      'ul',
      { class: 'sum-best-list' },
      ...p.bests.map((b) => {
        const t = bestTexts(b, p.unit);
        return h(
          'li',
          { class: 'sum-best', 'data-best': b.exerciseId, 'data-best-kind': b.kind },
          h('p', { class: 'sum-best-name' }, p.name(b.exerciseId)),
          h('p', { class: 'sum-best-now' }, t.now),
          h('p', { class: 'sum-best-was' }, t.was),
        );
      }),
    ),
  );
}

function tile(key: string, value: string, label: string): HTMLElement {
  return h(
    'div',
    { class: 'stat sum-tile', 'data-stat': key },
    h('span', { class: 'stat-value' }, value),
    h('span', { class: 'sum-tile-label' }, label),
  );
}

function setList(p: SummaryProps): HTMLElement {
  const byExercise = new Map<string, SetLog[]>();
  for (const l of p.logs)
    byExercise.set(l.exerciseId, [...(byExercise.get(l.exerciseId) ?? []), l]);
  const note = (id: string) => {
    const t = p.todayNotes?.[id];
    return t ? h('span', { class: 'today-note' }, `“${t}”`) : null;
  };
  return h(
    'ul',
    { class: 'set-list' },
    ...[...byExercise].map(([id, sets]) =>
      h(
        'li',
        {},
        h('strong', {}, p.name(id)),
        h(
          'span',
          { class: 'muted' },
          setsText(sets, p.unit) + (p.skipped.includes(id) ? ' · rest skipped' : ''),
        ),
        note(id),
      ),
    ),
    ...p.skipped
      .filter((id) => !byExercise.has(id))
      .map((id) =>
        h(
          'li',
          { class: 'skipped' },
          h('strong', {}, p.name(id)),
          h('span', { class: 'muted' }, 'skipped'),
          note(id),
        ),
      ),
  );
}

export function summaryScreen(p: SummaryProps, a: SummaryActions): HTMLElement {
  const volumeKg = sessionVolume(p.logs);
  const reps = totalReps(p.logs);
  const exercisesDone = new Set(p.logs.map((l) => l.exerciseId)).size;
  const bodyweight = volumeMode(volumeKg, p.vsLastPct, p.last) === 'bodyweight';
  const tiles = [
    tile('sets', String(p.logs.length), p.logs.length === 1 ? 'set' : 'sets'),
    bodyweight ? null : tile('reps', String(reps), reps === 1 ? 'rep' : 'reps'),
    tile('exercises', `${exercisesDone}/${p.plannedExercises}`, 'exercises'),
    tile('overruns', String(p.restOverruns), p.restOverruns === 1 ? 'long rest' : 'long rests'),
  ].filter((t): t is HTMLElement => t !== null);

  return h(
    'main',
    { class: `screen summary ${moodClass('energy')}`, 'data-screen': 'summary' },
    h(
      'header',
      { class: 'sum-hero' },
      h('span', { class: 'sum-trophy', 'aria-hidden': 'true' }, icon('trophy', 'lg')),
      h(
        'div',
        { class: 'sum-hero-txt' },
        h(
          'h1',
          { class: 'summary-title' },
          h('span', { class: 'sum-eyebrow caps' }, 'Workout done'),
          ' ',
          h('span', { class: 'sum-day' }, `${p.dayName} done`),
        ),
        h('p', { class: 'sum-meta' }, `${dateLabel(p.date)} · ${formatDuration(p.durationSec)}`),
      ),
    ),
    volumeCard(p, volumeKg, reps),
    bestsBlock(p),
    h('div', { class: 'stats sum-tiles', 'data-count': tiles.length }, ...tiles),
    p.fixEl ?? null,
    p.focusEl ?? null,
    h('h2', { class: 'section-title' }, 'Sets'),
    setList(p),
    p.coachEl ?? null,
    h(
      'div',
      { class: 'sticky-bottom' },
      h(
        'button',
        { type: 'button', class: 'primary-btn cta-btn', onclick: a.onDone },
        icon('check', 'lg'),
        'Done',
      ),
    ),
  );
}
