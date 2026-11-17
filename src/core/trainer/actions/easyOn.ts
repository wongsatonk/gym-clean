/**
 * M12 1b standing "go easy on" list (SPEC M12 trainer kit item 3). Pure.
 *
 * - `TrainerState.easyOn` changes only through `proposeEasyOn` (action 'easyOn', scope 'plan',
 *   Apply / Undo through changes.ts). It is raised from the intake (`IntakeOffer` kind 'easyOn':
 *   `{ add, remove }` as given), from Settings (remove one area: `{ remove: [area] }`) and from
 *   the coach ("go easy on my shoulders from now on": `{ add: [area] }`). Feel-today soreness
 *   only ever offers today's avoid-area (avoidArea.ts), never this list.
 * - The list is applied when days are read, never stored in them: pass
 *   `{ easyOn: easyOnTreatment(ctx) }` to plan.ts `effectiveDay(s)`. For each listed area, every
 *   row whose primary muscle is in it is swapped (the swap never loads any listed area) or left
 *   out; a row where it only helps is about 10% lighter (bodyweight: fewer reps), once. A day
 *   that is all the area (legs on a Legs day) keeps its moves, each one lighter. Removing an area
 *   restores the plan as written.
 * - The actions use `easyCatalog` (swap candidates, focus-block added work, today's go-easy) and
 *   `easyOnArea` (no extra set on a stalled lift there; no focus block on a listed group).
 */
import type { BodyArea, PlannedExercise, ProgramDay, Proposal, TrainerState } from '../../types';
import type { DayTreatment } from '../plan';
import { primaryInArea, type TrainerCatalog } from '../swapCandidates';
import { avoidAreaRows, easyCatalog, easyOnArea } from './avoidArea';
import { lightenRow, refuse, type ActionContext, type ActionResult } from './lighter';

export { easyCatalog, easyOnArea };

/** The fixed order the list is kept in (the area chips' order). */
export const EASY_ON_ORDER: readonly BodyArea[] = [
  'arms',
  'shoulders',
  'chest',
  'back',
  'legs',
  'core',
];

const LABEL: Record<BodyArea, string> = {
  arms: 'Arms',
  shoulders: 'Shoulders',
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  core: 'Core',
};

/** What the treatment needs besides the day: the catalog (with the gym's kit) and the weights. */
export type EasyOnContext = Pick<ActionContext, 'unit' | 'lastWeightKg'> & {
  catalog: TrainerCatalog;
};

/** The day with every listed area eased (see the file comment). Same object when unchanged. */
export function easeDay(
  day: ProgramDay,
  areas: readonly BodyArea[],
  ctx: EasyOnContext,
): ProgramDay {
  if (areas.length === 0) return day;
  const catalog = easyCatalog(ctx.catalog, areas);
  const byId = new Map(ctx.catalog.exercises.map((e) => [e.id, e]));
  const works = (p: PlannedExercise, area: BodyArea) => {
    const e = byId.get(p.exerciseId);
    return e !== undefined && primaryInArea(e, area, ctx.catalog.areaOf);
  };
  const lightenAll = (rows: readonly PlannedExercise[]) =>
    rows.map((p) => (p.adjusted === 'avoidArea' ? p : lightenRow(p, ctx, 'avoidArea')));
  let rows: readonly PlannedExercise[] = day.exercises;
  for (const area of areas) {
    if (rows.length > 0 && rows.every((p) => works(p, area))) {
      rows = lightenAll(rows);
      continue;
    }
    const r = avoidAreaRows(rows, area, catalog, ctx, { keepMarked: true });
    rows = r.rows.length > 0 ? r.rows : lightenAll(rows);
  }
  const same = rows.length === day.exercises.length && rows.every((p, i) => p === day.exercises[i]);
  return same ? day : { ...day, exercises: [...rows] };
}

/** The plan.ts `effectiveDay(s)` option for the standing list. */
export function easyOnTreatment(ctx: EasyOnContext): DayTreatment {
  return (day, areas) => easeDay(day, areas, ctx);
}

/** "arms", "arms and legs", "arms, chest and legs". */
const listText = (areas: readonly BodyArea[]): string =>
  areas.length <= 1
    ? (areas[0] ?? '')
    : `${areas.slice(0, -1).join(', ')} and ${areas.at(-1) ?? ''}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "as planned", or "1 swap, 2 removed, 2 lighter" for a treated day against the plan day. */
function describe(planned: ProgramDay, treated: ProgramDay): string {
  const planIds = new Set(planned.exercises.map((p) => p.exerciseId));
  const ids = new Set(treated.exercises.map((p) => p.exerciseId));
  const swaps = treated.exercises.filter((p) => !planIds.has(p.exerciseId)).length;
  const gone = planned.exercises.filter((p) => !ids.has(p.exerciseId)).length;
  const lighter = treated.exercises.filter(
    (p) => planIds.has(p.exerciseId) && p.adjusted === 'avoidArea',
  ).length;
  const parts = [
    swaps > 0 ? plural(swaps, 'swap') : '',
    gone - swaps > 0 ? `${gone - swaps} removed` : '',
    lighter > 0 ? `${lighter} lighter` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'as planned';
}

export type EasyOnChange = { add?: readonly BodyArea[]; remove?: readonly BodyArea[] };

/** The proposal that changes the standing list (nothing else in the state changes). */
export function proposeEasyOn(
  ctx: ActionContext,
  change: EasyOnChange,
  catalog: TrainerCatalog,
): ActionResult {
  const before = EASY_ON_ORDER.filter((a) => (ctx.state.easyOn ?? []).includes(a));
  const add = EASY_ON_ORDER.filter((a) => (change.add ?? []).includes(a) && !before.includes(a));
  const remove = EASY_ON_ORDER.filter(
    (a) => (change.remove ?? []).includes(a) && before.includes(a) && !add.includes(a),
  );
  if (add.length === 0 && remove.length === 0)
    return refuse('nothingToChange', 'Your go-easy list already says that.');
  const after = EASY_ON_ORDER.filter(
    (a) => (before.includes(a) || add.includes(a)) && !remove.includes(a),
  );

  const { easyOn: _old, ...rest } = structuredClone(ctx.state);
  void _old;
  const next: TrainerState = after.length > 0 ? { ...rest, easyOn: after } : rest;

  const easy: EasyOnContext = { catalog, unit: ctx.unit, lastWeightKg: ctx.lastWeightKg };
  const lines: Proposal['lines'] = [
    ...add.map((a) => ({ before: LABEL[a], after: 'Go easy from now on' })),
    ...remove.map((a) => ({ before: LABEL[a], after: 'Back to your usual plan' })),
  ];
  for (const d of ctx.state.plan.days) {
    const was = describe(d, easeDay(d, before, easy));
    const now = describe(d, easeDay(d, after, easy));
    if (was !== now) lines.push({ before: `${d.name} · ${was}`, after: now });
  }

  const title =
    remove.length === 0
      ? `Go easy on ${listText(add)} from now on`
      : add.length === 0
        ? `Stop going easy on ${listText(remove)}`
        : 'Update your go-easy list';
  const why = [
    add.length > 0
      ? `Moves that mainly work your ${listText(add)} are swapped or left out, and moves where ` +
        'they help are about 10% lighter, on every day until you take it off the list.'
      : '',
    remove.length > 0 ? `Days with ${listText(remove)} go back to your plan as written.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    ok: true,
    proposal: {
      action: 'easyOn',
      scope: 'plan',
      title,
      lines,
      why,
      say: add.length > 0 ? 'Done. I will go easy there.' : 'Done. Back to your usual plan.',
      next,
      baseVersion: ctx.state.version,
    },
  };
}
