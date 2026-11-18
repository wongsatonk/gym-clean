/**
 * Release 1.15.2 "Coach acts": which brain answers a typed message. Pure.
 *
 * The 1.15.0 phone eval (Checkpoint J follow-up): Apple's on-device model made the expected tool
 * call for 28 of 109 action requests (75 got words, no call), while the rules matcher read 103
 * of 109 right and never turned any of the 36 no-action items into an action. So a message the
 * rules read as a change goes straight to the rules' proposal path (`handle()`; Apply stays his
 * tap) and only open chat reaches the model. Also never sent to the model:
 * - red flags (SPEC M10 Safety: the rules answer with only the red-flag line, no call);
 * - empty text (req-073 " " was a bridge error);
 * - Thai (Apple's model has no Thai; req-013 was swapped by sanitize, req-034 a bridge error).
 *
 * `call` records the tool call a correct model would make for the match (tools.contract.json
 * names and args), for the trace and the eval; the proposal itself comes from `handle()`.
 */
import type { ToolCall } from '../../types';
import { matchText, resolveDay, type CoachContext } from '../coach';
import { weekdaysFor, validDaysPerWeek } from '../focusBlock';
import { shortOptionFor } from '../actions/shortOnTime';
import type { Intent, IntentMatch, IntentSlots } from '../intents';

export type RouteWhy = 'redFlag' | 'action' | 'empty' | 'thai';
export type BrainRoute =
  | { to: 'rules'; why: RouteWhy; match: IntentMatch; call?: ToolCall }
  | { to: 'model'; match: IntentMatch };

/** Answers (not changes) stay with the model: help, week and progress. */
export const RULES_ACTION_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  'postpone',
  'avoidArea',
  'lighter',
  'deload',
  'swap',
  'stall',
  'food',
  'focusBlock',
  'focusEdit',
  'doToday',
  'shortOnTime',
]);

const THAI = /[฀-๿]/;

function pick(slots: IntentSlots, keys: readonly (keyof IntentSlots)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (slots[k] !== undefined) out[k] = slots[k];
  return out;
}

/** Default weekdays for a days-a-week count; none outside the block's range (never throws). */
function weekdays(slots: IntentSlots): { weekdays?: number[] } {
  const n = slots.daysPerWeek;
  return n !== undefined && validDaysPerWeek(n) ? { weekdays: weekdaysFor(n) } : {};
}

/** The tool call a correct model makes for `match`, or null when the answer needs none. */
export function toolCallFor(match: IntentMatch, today: string): ToolCall | null {
  const s = match.slots;
  switch (match.intent) {
    case 'postpone': {
      const args: Record<string, unknown> = { from: s.date ? resolveDay(s.date, today) : today };
      if (s.moveTo) args.to = resolveDay(s.moveTo, today);
      return { name: 'postponeSession', args };
    }
    case 'doToday':
      return { name: 'doDayToday', args: s.dayName !== undefined ? { day: s.dayName } : {} };
    case 'avoidArea':
      return { name: 'avoidBodyArea', args: pick(s, ['area']) };
    case 'lighter':
      return { name: 'lighterToday', args: {} };
    case 'deload':
      return { name: 'deloadWeek', args: {} };
    case 'swap':
      return { name: 'swapExercise', args: pick(s, ['exerciseId', 'scope']) };
    case 'stall':
      return { name: 'adjustStalledExercise', args: pick(s, ['exerciseId']) };
    case 'food':
      return { name: 'suggestFood', args: {} };
    case 'focusBlock':
      return {
        name: 'proposeFocusBlock',
        args: { ...pick(s, ['group', 'weeks']), ...weekdays(s) },
      };
    case 'focusEdit':
      return s.exerciseId
        ? { name: 'swapExercise', args: { exerciseId: s.exerciseId } }
        : { name: 'proposeFocusBlock', args: { ...pick(s, ['weeks']), ...weekdays(s) } };
    case 'shortOnTime':
      return {
        name: 'shortOnTime',
        args: s.minutes !== undefined ? { minutes: shortOptionFor(s.minutes) } : {},
      };
    case 'help':
    case 'week':
    case 'progress':
      return null;
  }
}

function toRules(why: RouteWhy, match: IntentMatch, today: string): BrainRoute {
  const call = RULES_ACTION_INTENTS.has(match.intent) ? toolCallFor(match, today) : null;
  return call ? { to: 'rules', why, match, call } : { to: 'rules', why, match };
}

export function routeMessage(text: string, coach: CoachContext): BrainRoute {
  const match = matchText(text, coach);
  if (match.safety === 'redFlag') return { to: 'rules', why: 'redFlag', match };
  if (text.trim() === '') return { to: 'rules', why: 'empty', match };
  if (THAI.test(text)) return toRules('thai', match, coach.today);
  if (RULES_ACTION_INTENTS.has(match.intent)) return toRules('action', match, coach.today);
  return { to: 'model', match };
}
