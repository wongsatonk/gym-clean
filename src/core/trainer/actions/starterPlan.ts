/**
 * M12 1b action "Starter plan" (SPEC M12 trainer kit item 3). Pure: a plan-scope Proposal whose
 * `next` holds the plan built from the intake answers (starterPlan.ts), applied and undone
 * through changes.ts like every other proposal. The current plan is never replaced without
 * Apply, and Undo brings it back whole.
 *
 * - The plan honours the intake's go-easy areas and the standing list (`state.easyOn`); the
 *   standing list itself only changes through its own proposal.
 * - `next`: the new plan and schedule (rotation + rest weekdays). The stored `seededFrom` is
 *   kept and the plan is marked edited, so the data layer neither re-seeds it nor reports a
 *   changed default program. Dated overrides from today on are dropped (they were written for
 *   the old days) except plain rest days; a focus block running today ends the day before and
 *   one that hasn't started is dropped (both were built from the old plan); the past stays.
 * - Lines: "Now: <current day names>" → "<N> days a week: <new day names>", then one line per
 *   new day with its exercises and estimated minutes.
 * - Every word comes from the template data (`STARTER_TEMPLATES.copy`); exercise names from the
 *   catalog.
 */
import type { BodyArea, Intake, Proposal, TrainerState } from '../../types';
import { estimateMinutes } from '../estimate';
import { cutBlock } from '../focusBlock';
import { buildStarterPlan, STARTER_TEMPLATES } from '../starterPlan';
import type { TrainerCatalog } from '../swapCandidates';
import { refuse, type ActionContext, type ActionResult } from './lighter';

export type StarterPlanContext = Pick<ActionContext, 'state' | 'today'> & {
  /** The catalog wired with the gym profile (`canDo`). */
  catalog: TrainerCatalog;
};

const fill = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (all, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : all,
  );

/** "a", "a and b", "a, b and c". */
const listText = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;

export function proposeStarterPlan(ctx: StarterPlanContext, intake: Intake): ActionResult {
  const copy = STARTER_TEMPLATES.copy;
  const { state, today, catalog } = ctx;
  const easyOn: BodyArea[] = [...new Set([...intake.easyOn, ...(state.easyOn ?? [])])];
  const built = buildStarterPlan({ ...intake, easyOn }, catalog, catalog);
  if (built.split === '') return refuse('nothingToChange', copy.badDays);
  if (built.plan.days.length === 0) return refuse('noCandidate', copy.noKit);

  const names = new Map(catalog.exercises.map((e) => [e.id, e.name]));
  const nameOf = (id: string) => names.get(id) ?? id.replace(/_/g, ' ');
  const lines: Proposal['lines'] = [
    {
      before: fill(copy.planLineBefore, { names: state.plan.days.map((d) => d.name).join(', ') }),
      after: fill(copy.planLineAfter, {
        days: intake.days,
        names: built.plan.days.map((d) => d.name).join(', '),
      }),
    },
    ...built.plan.days.map((d) => ({
      before: d.name,
      after: fill(copy.dayLineAfter, {
        names: d.exercises.map((r) => nameOf(r.exerciseId)).join(', '),
        minutes: estimateMinutes(d),
      }),
    })),
  ];
  const why = [
    fill(copy.why, {
      goal: copy.goals[intake.goalKind],
      days: intake.days,
      minutes: intake.sessionMin,
    }),
    ...(easyOn.length > 0 ? [fill(copy.whyEasyOn, { areas: listText(easyOn) })] : []),
  ].join(' ');

  const prev = structuredClone(state);
  const next: TrainerState = {
    ...prev,
    plan: { ...built.plan, seededFrom: state.plan.seededFrom, edited: true },
    schedule: built.schedule,
    overrides: prev.overrides.filter(
      (o) => o.date < today || (o.rest === true && o.dayId === undefined && !o.adjust),
    ),
    ...(prev.blocks ? { blocks: prev.blocks.flatMap((b) => cutBlock(b, today) ?? []) } : {}),
  };
  return {
    ok: true,
    proposal: {
      action: 'starterPlan',
      scope: 'plan',
      title: fill(copy.title, { days: intake.days }),
      lines,
      why,
      say: copy.say,
      next,
      baseVersion: state.version,
    },
  };
}
