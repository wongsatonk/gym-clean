// M13c task 13: the exercise detail screen (route `library/exercise`, SPEC M13c goal 6). Pure
// render: props in, callbacks out. app.ts gathers the data (catalog text via `howToContent`,
// kit via `missingKitLabels`, `cameraInfo`, the effective plan's rows, the exercise's history via
// `detailHistoryOf(exerciseHistory(…))`) and opens the sheets the callbacks ask for. Read at
// rest only: nothing here is spoken, and it is never reachable during a set.
//
// Top to bottom: Back; the name + tappable badges; the 2D muscle map with its legend and the
// screen's one CTA, **Watch 3D demo** ("How to" when the exercise has no demo); How to (tempo,
// 2–3 lines, focus, the spoken cue); Equipment (+ "Your gym has it" / "Needs: …", My gym);
// Camera (counts line + Phone set-up) only when a camera rule counts it; In your plan; History
// (last time, the best set as a ≥ 64px number, See history) or "Not done yet".
//
// e2e hooks: `[data-screen="exercise-detail"]` (+ `data-exercise`), `[data-detail-back]`,
// `[data-badge-open=<kind>]`, `[data-detail-map]`, `[data-detail-legend]`, `[data-detail-howto]`,
// `[data-detail-tempo]`, `[data-detail-lines]`, `[data-detail-focus]`, `[data-cue-panel]`,
// `[data-detail-gym="has"|"needs"]`, `[data-detail-mygym]`, `[data-detail-camera-block]`,
// `[data-detail-camera]`, `[data-detail-plan-row]`, `[data-detail-notplan]`,
// `[data-detail-last]`, `[data-detail-best]`, `[data-detail-see-history]`, `[data-detail-new]`.
import type { CameraInfo } from '../../core/exercises';
import type { ExerciseHistory } from '../../core/history';
import type { PlannedExercise } from '../../core/types';
import { formatWeight, type Unit } from '../../core/units';
import { muscleLabel } from '../../core/dayInfo';
import { badgesFor, type BadgeKind, type BadgeRuleStatus } from '../badges';
import { backButton } from '../backButton';
import { bodyMapSvg, pickView } from '../bodyMap';
import { h } from '../dom';
import type { HowToContent } from '../howToSheet';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { setsLine, type ShownSet } from './history';
import { dateLabel } from './today';
import '../exerciseDetail.css';

/** One plan day that has the exercise (the effective plan's row). */
export type DetailPlanRow = {
  /** "Push A". */
  day: string;
  sets: number;
  targetReps: readonly [min: number, max: number];
};

/** What the History block shows (`detailHistoryOf`). */
export type DetailHistory = {
  /** The latest session's working sets. */
  last: { date: number; sets: readonly ShownSet[] };
  /** The best set in the history passed in (heaviest, then most reps). */
  best: ShownSet;
};

export type ExerciseDetailProps = {
  exerciseId: string;
  name: string;
  /** Badge input; 'pose' when a camera rule counts it. */
  tracking: PlannedExercise['tracking'];
  /** Badge override for tests / harness; omitted = from the rule data. */
  ruleStatus?: BadgeRuleStatus;
  /** `howToContent(exerciseId)`: demo flag, tempo, lines, focus, cue, muscles. */
  content: HowToContent;
  /** "Cable" (`equipmentGroupLabel`). */
  equipment: string;
  /** Kit this phone's gym lacks (`missingKitLabels(id, gym)`); [] = your gym has it. */
  needs: readonly string[];
  /** `cameraInfo(exerciseId)`; null = counted by hand (no camera block). */
  camera: CameraInfo | null;
  /** The effective plan's rows with this exercise, in rotation order; [] = not in your plan. */
  plan: readonly DetailPlanRow[];
  /** null = never done. */
  history: DetailHistory | null;
  unit: Unit;
  /** Back button words. Default "Library". */
  backLabel?: string | undefined;
};

export type ExerciseDetailActions = {
  onBack: () => void;
  /** 3D demo / Info → How-to sheet, Camera → Camera sheet, Learning → learn card. */
  onBadge: (kind: BadgeKind, exerciseId: string, opener: HTMLElement) => void;
  /** Watch 3D demo / How to → the How-to sheet. */
  onHowTo: (opener: HTMLElement) => void;
  /** My gym → Settings → My gym. */
  onMyGym: () => void;
  /** Phone set-up → the Camera sheet (with Practice). */
  onCameraInfo: (opener: HTMLElement) => void;
  /** See history → Calendar's exercise history. */
  onHistory: () => void;
};

// ---------- copy + pure helpers ----------

export const GYM_HAS_IT = 'Your gym has it';
export const NOT_IN_PLAN = 'Not in your plan';
export const NOT_DONE_YET = 'Not done yet';
export const DETAIL_LEARNING = 'Still learning: it may miss or add a rep. Fix the count on Rest.';

/** "Watch 3D demo" when a demo exists, else "How to" (the sheet shows the map). */
export function howToLabel(hasDemo: boolean): string {
  return hasDemo ? 'Watch 3D demo' : 'How to';
}

/** "4 × 8–12 reps" / "3 × 10 reps". */
export function setsRepsText(sets: number, [min, max]: readonly [number, number]): string {
  return `${sets} × ${min === max ? min : `${min}–${max}`} reps`;
}

/** "Push A · 4 × 8–12 reps". */
export function planLine(r: DetailPlanRow): string {
  return `${r.day} · ${setsRepsText(r.sets, r.targetReps)}`;
}

/** The best set's big number and its unit line, as History shows it ("10 × 22.5" / "reps × kg"). */
export function bestSetParts(best: ShownSet, unit: Unit): { num: string; unit: string } {
  return best.weightKg > 0
    ? { num: `${best.reps} × ${formatWeight(best.weightKg, unit)}`, unit: `reps × ${unit}` }
    : { num: String(best.reps), unit: best.reps === 1 ? 'rep' : 'reps' };
}

/** "Tue 12 Nov · 10×22.5, 8×22.5 kg". */
export function lastLine(last: DetailHistory['last'], unit: Unit): string {
  return `${dateLabel(last.date)} · ${setsLine(last.sets, unit)}`;
}

/**
 * The History block's data from core's `exerciseHistory(sets, id, today, weeks)` (pass a long
 * `weeks`, e.g. 520, so "Not done yet" means never). null when there's no session.
 */
export function detailHistoryOf(hist: ExerciseHistory | null | undefined): DetailHistory | null {
  const latest = hist?.sessions.at(-1);
  const best = hist?.trend.bestSet;
  if (!latest || !best) return null;
  return {
    last: {
      date: latest.date,
      sets: latest.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg })),
    },
    best: { reps: best.reps, weightKg: best.weightKg },
  };
}

/** Every fixed string this screen can show (for the copy tests). */
export function detailCopy(): string[] {
  return [
    GYM_HAS_IT,
    NOT_IN_PLAN,
    NOT_DONE_YET,
    DETAIL_LEARNING,
    howToLabel(true),
    howToLabel(false),
    'Muscles',
    'Main',
    'Helpers',
    'How to',
    'Equipment',
    'My gym',
    'Camera',
    'Phone set-up',
    'In your plan',
    'History',
    'Last time',
    'Best set',
    'See history',
  ];
}

// ---------- component ----------

function section(key: string, title: string, ...body: (Node | null)[]): HTMLElement {
  const id = `detail-${key}-title`;
  return h(
    'section',
    { class: 'detail-card', 'data-detail-section': key, 'aria-labelledby': id },
    h('h2', { class: 'detail-h', id }, title),
    ...body,
  );
}

function legendLine(kind: 'primary' | 'secondary', label: string, muscles: readonly string[]) {
  return h(
    'p',
    { class: 'detail-legend-line' },
    h('span', { class: `swatch ${kind}`, 'aria-hidden': 'true' }),
    h('span', { class: 'detail-legend-key' }, label),
    h('span', {}, muscles.map(muscleLabel).join(', ')),
  );
}

export function exerciseDetailScreen(
  p: ExerciseDetailProps,
  a: ExerciseDetailActions,
): HTMLElement {
  const c = p.content;

  const howTo: HTMLButtonElement = h(
    'button',
    {
      type: 'button',
      class: 'primary-btn detail-howto',
      'data-detail-howto': true,
      onclick: () => a.onHowTo(howTo),
    },
    icon(c.hasDemo ? 'play' : 'help', 'lg'),
    h('span', {}, howToLabel(c.hasDemo)),
  );

  const map = h('div', { class: 'detail-map', 'data-detail-map': true });
  map.innerHTML = bodyMapSvg({
    view: pickView(c.primary),
    primary: c.primary,
    secondary: c.secondary,
  });

  const muscles = section(
    'muscles',
    'Muscles',
    h(
      'div',
      { class: 'detail-muscles' },
      map,
      h(
        'div',
        { class: 'detail-legend', 'data-detail-legend': true },
        c.primary.length ? legendLine('primary', 'Main', c.primary) : null,
        c.secondary.length ? legendLine('secondary', 'Helpers', c.secondary) : null,
      ),
    ),
    howTo,
  );

  const how = section(
    'how',
    'How to',
    c.tempo
      ? h(
          'p',
          { class: 'detail-tempo', 'data-detail-tempo': true },
          icon('timer', 'sm'),
          h('span', {}, c.tempo),
        )
      : null,
    c.lines.length
      ? h(
          'ol',
          { class: 'detail-lines', 'data-detail-lines': true },
          ...c.lines.map((l) => h('li', {}, l)),
        )
      : null,
    c.focus ? h('p', { class: 'detail-focus', 'data-detail-focus': true }, c.focus) : null,
    c.cue
      ? h(
          'div',
          { class: 'cue-panel', 'data-cue-panel': true },
          icon('speaker', 'md'),
          h('p', { class: 'cue-text' }, c.cue),
        )
      : null,
  );

  const lacks = p.needs.length > 0;
  const gym = section(
    'equipment',
    'Equipment',
    h('p', { class: 'detail-equip' }, p.equipment),
    h(
      'p',
      {
        class: lacks ? 'detail-gym needs' : 'detail-gym has',
        'data-detail-gym': lacks ? 'needs' : 'has',
      },
      icon(lacks ? 'lock' : 'check', 'sm'),
      h('span', {}, lacks ? `Needs: ${p.needs.join(', ')}` : GYM_HAS_IT),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'ghost-btn detail-btn',
        'data-detail-mygym': true,
        onclick: () => a.onMyGym(),
      },
      icon('sliders', 'sm'),
      h('span', {}, 'My gym'),
    ),
  );

  let camera: HTMLElement | null = null;
  if (p.camera) {
    const setUp: HTMLButtonElement = h(
      'button',
      {
        type: 'button',
        class: 'ghost-btn detail-btn',
        'data-detail-camera': true,
        onclick: () => a.onCameraInfo(setUp),
      },
      icon('camera', 'sm'),
      h('span', {}, 'Phone set-up'),
    );
    camera = section(
      'camera',
      'Camera',
      h('p', { class: 'detail-counts' }, p.camera.counts),
      p.camera.learning
        ? h(
            'p',
            { class: 'detail-learning', 'data-detail-learning': true },
            icon('trend', 'sm'),
            h('span', {}, DETAIL_LEARNING),
          )
        : null,
      setUp,
    );
    camera.setAttribute('data-detail-camera-block', '');
  }

  const plan = section(
    'plan',
    'In your plan',
    p.plan.length
      ? h(
          'ul',
          { class: 'detail-plan' },
          ...p.plan.map((r) => h('li', { 'data-detail-plan-row': r.day }, planLine(r))),
        )
      : h('p', { class: 'detail-none muted', 'data-detail-notplan': true }, NOT_IN_PLAN),
  );

  const hist = p.history;
  const best = hist ? bestSetParts(hist.best, p.unit) : null;
  const history = section(
    'history',
    'History',
    ...(hist && best
      ? [
          h(
            'p',
            { class: 'detail-last', 'data-detail-last': true },
            h('span', { class: 'detail-legend-key' }, 'Last time'),
            h('span', {}, lastLine(hist.last, p.unit)),
          ),
          h(
            'div',
            { class: 'detail-best', 'data-detail-best': true },
            h('span', { class: 'detail-best-label' }, 'Best set'),
            h('span', { class: 'detail-best-num' }, best.num),
            h('span', { class: 'detail-best-unit muted' }, best.unit),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'ghost-btn detail-btn',
              'data-detail-see-history': true,
              onclick: () => a.onHistory(),
            },
            icon('trend', 'sm'),
            h('span', {}, 'See history'),
          ),
        ]
      : [h('p', { class: 'detail-none muted', 'data-detail-new': true }, NOT_DONE_YET)]),
  );

  return h(
    'main',
    {
      class: `screen exercise-detail ${moodClass('pro')}`,
      'data-screen': 'exercise-detail',
      'data-exercise': p.exerciseId,
    },
    h(
      'header',
      { class: 'top-bar' },
      backButton(a.onBack, p.backLabel ?? 'Library', { 'data-detail-back': true }),
    ),
    h(
      'div',
      { class: 'detail-head' },
      h('h1', { class: 'page-title detail-title' }, p.name),
      badgesFor({
        exerciseId: p.exerciseId,
        tracking: p.tracking,
        name: p.name,
        ...(p.ruleStatus !== undefined ? { ruleStatus: p.ruleStatus } : {}),
        onBadge: (kind, opener) => a.onBadge(kind, p.exerciseId, opener),
      }),
    ),
    muscles,
    how,
    gym,
    camera,
    plan,
    history,
  );
}
