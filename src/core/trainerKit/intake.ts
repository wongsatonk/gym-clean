/**
 * M12 slice 1b (trainer kit item 3): the intake answers → what to offer. Pure.
 *
 * Nothing here changes the plan, the go-easy list or Fuel: `intakeToChanges` only says which
 * proposals to offer (each one is built by its own action and applied only on Apply).
 */
import type { BodyArea, GoalKind, Intake } from '../types';
import {
  AREA_LABELS,
  BODY_AREAS,
  EXPERIENCE_LABELS,
  GOAL_KINDS,
  GOAL_KIND_LABELS,
  INTAKE_DAYS,
  INTAKE_DAYS_DEFAULT,
  INTAKE_SESSION_MIN,
} from './goalRules';

const EXPERIENCES: readonly Intake['experience'][] = ['new', 'some', 'years'];

/** The questions' choices, for the intake screen. */
export const INTAKE_OPTIONS = {
  goalKinds: GOAL_KINDS.map((id) => ({ id, label: GOAL_KIND_LABELS[id] })),
  days: INTAKE_DAYS,
  sessionMin: INTAKE_SESSION_MIN,
  experience: EXPERIENCES.map((id) => ({ id, label: EXPERIENCE_LABELS[id] })),
  areas: BODY_AREAS.map((id) => ({ id, label: AREA_LABELS[id] })),
} as const;

/** Answers as stored: days within 2–6, a listed session length, known areas once, trimmed own words. */
export function normalizeIntake(intake: Intake): Intake {
  const minDays = INTAKE_DAYS[0] ?? 2;
  const maxDays = INTAKE_DAYS[INTAKE_DAYS.length - 1] ?? 6;
  const days = Number.isFinite(intake.days)
    ? Math.min(maxDays, Math.max(minDays, Math.round(intake.days)))
    : INTAKE_DAYS_DEFAULT;
  let sessionMin: Intake['sessionMin'] = 60;
  let gap = Number.POSITIVE_INFINITY;
  for (const option of INTAKE_SESSION_MIN) {
    const d = Math.abs(option - intake.sessionMin);
    if (d < gap) {
      gap = d;
      sessionMin = option;
    }
  }
  const easyOn = [...new Set(intake.easyOn)].filter((a) => BODY_AREAS.includes(a));
  const goalText = intake.goalText?.trim();
  const out: Intake = {
    goalKind: GOAL_KINDS.includes(intake.goalKind) ? intake.goalKind : 'general',
    days,
    sessionMin,
    experience: EXPERIENCES.includes(intake.experience) ? intake.experience : 'new',
    easyOn,
    at: intake.at,
  };
  if (goalText) out.goalText = goalText;
  return out;
}

/** What the app has now. */
export type IntakeCurrent = {
  /** Any session logged. */
  hasHistory: boolean;
  /** `UserPlan.edited`, or any plan change applied. */
  planEdited: boolean;
  /** `TrainerState.easyOn`. */
  easyOn: readonly BodyArea[];
  /** Nutrition settings' goal, or null when Fuel is not set up. */
  fuel: { goalKind?: GoalKind } | null;
};

export type IntakeOffer =
  | { kind: 'starterPlan'; label: string; primary: boolean }
  | { kind: 'easyOn'; areas: BodyArea[]; add: BodyArea[]; remove: BodyArea[]; label: string; primary: false }
  | { kind: 'fuelGoal'; goalKind: GoalKind; needsSetup: boolean; label: string; primary: false };

const list = (areas: readonly BodyArea[]): string => {
  const names = areas.map((a) => AREA_LABELS[a].toLowerCase());
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/**
 * The proposals to offer after the intake, in a fixed order: plan, go-easy list, Fuel.
 * - Starter plan: the primary offer on a fresh install (no session, plan untouched); otherwise
 *   "Build a new plan from my answers", never primary. The current plan is replaced only on Apply.
 * - Go-easy list: only when the answers differ from the standing list.
 * - Fuel: when Fuel is set up and its goal differs; when it isn't, an offer to set it up.
 */
export function intakeToChanges(intake: Intake, current: IntakeCurrent): IntakeOffer[] {
  const answers = normalizeIntake(intake);
  const offers: IntakeOffer[] = [];
  const fresh = !current.hasHistory && !current.planEdited;
  offers.push(
    fresh
      ? { kind: 'starterPlan', label: 'Build my starter plan', primary: true }
      : { kind: 'starterPlan', label: 'Build a new plan from my answers', primary: false },
  );

  const add = answers.easyOn.filter((a) => !current.easyOn.includes(a));
  const remove = current.easyOn.filter((a) => !answers.easyOn.includes(a));
  if (add.length || remove.length) {
    const label =
      answers.easyOn.length === 0
        ? 'Clear your go-easy list'
        : remove.length === 0 && current.easyOn.length === 0
          ? `Go easy on ${list(answers.easyOn)}`
          : 'Update your go-easy list';
    offers.push({ kind: 'easyOn', areas: answers.easyOn, add, remove, label, primary: false });
  }

  if (current.fuel === null) {
    offers.push({ kind: 'fuelGoal', goalKind: answers.goalKind, needsSetup: true, label: 'Set up Fuel for this goal', primary: false });
  } else if (current.fuel.goalKind !== answers.goalKind) {
    offers.push({ kind: 'fuelGoal', goalKind: answers.goalKind, needsSetup: false, label: 'Update Fuel targets', primary: false });
  }
  return offers;
}
