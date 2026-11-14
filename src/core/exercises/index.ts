// Registry of per-exercise rules. Add an exercise = add a data file and list it here.
import { AUTO_SET_DEFAULTS, type AutoSetConfig } from '../autoSet';
import type { FocusRuleFlags } from '../focus';
import type { FocusCueId, LandmarkFrame } from '../types';
import { curl } from './curl';
import { gobletSquat } from './gobletSquat';
import { lateralRaise } from './lateralRaise';
import { pushUp } from './pushUp';
import { row } from './row';
import { shoulderPress } from './shoulderPress';
import type { ExerciseRule, Side } from './types';

export type {
  CoachHints,
  ExerciseRule,
  FocusRuleFlags,
  MissReason,
  PhonePlacement,
  Side,
  SidePair,
  Triplet,
  ViewVariant,
} from './types';
export { COUNTER_DEFAULTS } from './types';

export const RULES: readonly ExerciseRule[] = [
  curl,
  pushUp,
  shoulderPress,
  row,
  gobletSquat,
  lateralRaise,
];

export function ruleFor(exerciseId: string): ExerciseRule | undefined {
  return RULES.find((r) => r.exerciseId === exerciseId);
}

export function ruleForFolder(folder: string): ExerciseRule | undefined {
  return RULES.find((r) => r.folder === folder);
}

/**
 * Whether the rule's optional extended gate holds for one side in this frame (normalized image y
 * grows downward). Always true without a gate; false if the gate's landmarks are missing.
 */
export function extendedGatePasses(rule: ExerciseRule, frame: LandmarkFrame, side: Side): boolean {
  const gate = rule.extendedGate;
  if (!gate) return true;
  const upper = frame.landmarks[gate.upper[side]];
  const lower = frame.landmarks[gate.lower[side]];
  if (!upper || !lower) return false;
  return upper.y < lower.y;
}

/** Hands-free config for an exercise: AUTO_SET_DEFAULTS with the rule's `autoSet` override. */
export function autoSetConfigFor(rule: ExerciseRule): AutoSetConfig {
  return { ...AUTO_SET_DEFAULTS, ...rule.autoSet };
}

/** Focus rules: judged from the counter's own events, presence and fps (M5). */
export const FOCUS_RULE_IDS: readonly FocusCueId[] = [
  'rushedLowering',
  'shrinkingRange',
  'stalled',
  'outOfFrame',
  'lowFps',
];

/** Form rules: need body geometry; on only with committed real fixtures (M5 Decision). */
export const FORM_RULE_IDS: readonly FocusCueId[] = [
  'armsOutOfSync',
  'raiseTooHigh',
  'elbowDrift',
  'bodySwing',
  'hipSag',
];

/** SPEC M5 "Reliable from": the only exercises (rule folders) a form rule may be declared on. */
export const FORM_RULE_EXERCISES: Readonly<Partial<Record<FocusCueId, readonly string[]>>> = {
  armsOutOfSync: ['shoulder-press', 'lateral-raise'],
  raiseTooHigh: ['lateral-raise'],
  elbowDrift: ['curl'],
  bodySwing: ['curl', 'row'],
  hipSag: ['push-up'],
};

/** Rules a front view can never judge (SPEC M5: hips sag is side view only). */
const SIDE_VIEW_ONLY: readonly FocusCueId[] = ['hipSag'];

/**
 * The focus flags in effect (a fresh object). `active`: the camera view the counter settled on,
 * or the counter's active rule (its `rule` getter: the rule merged with otherView). In the rule's
 * otherView, the variant's flags override the rule's key by key; side-view-only rules are off in
 * a front view.
 */
export function focusFlagsFor(
  rule: ExerciseRule,
  active?: 'side' | 'front' | Pick<ExerciseRule, 'view'>,
): FocusRuleFlags {
  const view = active === undefined ? rule.view : typeof active === 'string' ? active : active.view;
  const flags: FocusRuleFlags = { ...rule.focus };
  if (view !== rule.view && rule.otherView?.view === view) {
    Object.assign(flags, rule.otherView.focus);
  }
  if (view === 'front') {
    for (const id of SIDE_VIEW_ONLY) if (id in flags) flags[id] = false;
  }
  return flags;
}

/**
 * "<folder>: <id>" (or "<folder> (otherView): <id>") for every form rule switched on whose folder
 * has no real fixtures. Empty = OK. `realFolders`: folders with fixtures/landmarks/<folder>/real-*.
 */
export function formRulesWithoutRealFixtures(
  rules: readonly ExerciseRule[],
  realFolders: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const r of rules) {
    if (realFolders.has(r.folder)) continue;
    const sets = [
      ['', r.focus],
      [' (otherView)', r.otherView?.focus],
    ] as const;
    for (const [where, flags] of sets) {
      for (const id of FORM_RULE_IDS) {
        if (flags?.[id] === true) out.push(`${r.folder}${where}: ${id}`);
      }
    }
  }
  return out;
}
