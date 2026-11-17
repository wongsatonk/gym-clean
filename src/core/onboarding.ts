/**
 * M13 first launch (SPEC M13 goal 1, Decision "M13 Published look"). Pure: which pages a fresh
 * install walks through, whether an install gets the flow at all, and the stored outcome.
 *
 * - Steps: the welcome pages (the first is the lockup + tagline), then the slice 1b intake (only
 *   on a fresh install that hasn't answered it; a re-run from Settings on an install with history
 *   leaves it out, the intake has its own Settings row), then one permission page per permission
 *   the platform has: camera, Apple Health, microphone, notifications. The PWA ('web') shows the
 *   camera page only (no Health, mic or local reminders there).
 * - Who gets it: the slice 1b "fresh" test (no sessions) and no 'onboarding' row. Any row, even a
 *   damaged one, counts as seen, so an install is never put through it twice; an install that
 *   already skipped the 1.13 intake ('intakeSkipped' row) is not fresh either.
 * - Finish / skip is stored once in settings 'onboarding': the first outcome stays.
 * The page copy (titles, the four "why" texts, button labels) is data: src/data/onboarding.ts.
 */
import type { Onboarding, OnboardingStep, TodoFacts } from './types';

export type OnboardingPlatform = TodoFacts['platform'];
export type OnboardingPermission = Extract<OnboardingStep, { kind: 'permission' }>['permission'];

/** Welcome page ids in order; 'hello' is the lockup page (mark, name, tagline). */
export const WELCOME_PAGE_IDS = ['hello', 'train', 'coach'] as const;
export type WelcomePageId = (typeof WELCOME_PAGE_IDS)[number];

export const PERMISSION_ORDER: readonly OnboardingPermission[] = [
  'camera',
  'health',
  'mic',
  'notifications',
];

export type OnboardingInput = {
  platform: OnboardingPlatform;
  /** No sessions on this install (false for a re-run from Settings on a used install). */
  fresh: boolean;
  /** The slice 1b intake is already answered (settings 'intake'). */
  intakeDone: boolean;
  /**
   * What the iPhone app can ask for (Health available, mic plugin, local notifications). The
   * camera defaults to there; pass `camera: false` on a device without one. Ignored on 'web'
   * except for `camera`.
   */
  has: { health: boolean; mic: boolean; notifications: boolean; camera?: boolean };
};

export function onboardingSteps(input: OnboardingInput): OnboardingStep[] {
  const { platform, fresh, intakeDone, has } = input;
  const steps: OnboardingStep[] = WELCOME_PAGE_IDS.map((id) => ({ kind: 'welcome', id }));
  if (fresh && !intakeDone) steps.push({ kind: 'intake' });
  const available: Record<OnboardingPermission, boolean> = {
    camera: has.camera !== false,
    health: platform === 'native' && has.health,
    mic: platform === 'native' && has.mic,
    notifications: platform === 'native' && has.notifications,
  };
  for (const permission of PERMISSION_ORDER)
    if (available[permission]) steps.push({ kind: 'permission', permission });
  return steps;
}

export type OnboardingFacts = {
  /** Sessions on this install (any, finished or not). */
  sessions: number;
  /** The raw settings 'onboarding' value (undefined = no row). */
  row: unknown;
  /** settings 'intakeSkipped' exists (the 1.13 first-run intake was skipped). */
  intakeSkipped?: boolean;
};

/** True only for a fresh install that has never finished or skipped the flow. */
export function shouldOnboard(facts: OnboardingFacts): boolean {
  return facts.sessions === 0 && facts.row === undefined && facts.intakeSkipped !== true;
}

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A clean copy of the settings 'onboarding' value, or undefined when it holds no valid time. */
export function parseOnboarding(v: unknown): Onboarding | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const r = v as Record<string, unknown>;
  const out: Onboarding = {};
  if (isTime(r.doneAt)) out.doneAt = r.doneAt;
  if (isTime(r.skippedAt)) out.skippedAt = r.skippedAt;
  return out.doneAt === undefined && out.skippedAt === undefined ? undefined : out;
}

/** The row to store when the flow ends: an existing valid row is kept (stored once). */
export function closeOnboarding(prev: unknown, how: 'done' | 'skipped', at: number): Onboarding {
  const kept = parseOnboarding(prev);
  if (kept) return kept;
  return how === 'done' ? { doneAt: at } : { skippedAt: at };
}
