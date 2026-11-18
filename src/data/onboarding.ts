/**
 * M13 first launch (SPEC M13 goal 1): the page copy as data, and the settings row 'onboarding'.
 *
 * Copy rules (tested): at most 2 short sentences a page, written to "you", no goal assumed, every
 * string passes `checkCopy`, the name comes from APP_NAME. The permission pages keep the slice 2
 * rules: the notifications button switches the session reminder on (that switch asks for
 * permission); Health goes through the M11 connect flow; the camera asks on its button. The mic
 * page's Allow (permission catch-up decision, M13) asks for the microphone and then downloads the
 * on-phone speech model (about a minute on Wi-Fi); audio is never stored and nothing leaves the
 * phone.
 *
 * The row is stored once (the first finish or skip stays) and is backed up with the other settings
 * rows. No Dexie change.
 */
import { APP_NAME, APP_TAGLINE } from '../core/brand';
import {
  closeOnboarding,
  parseOnboarding,
  type OnboardingFacts,
  type OnboardingPermission,
  type WelcomePageId,
} from '../core/onboarding';
import type { Onboarding } from '../core/types';
import type { GymDb } from './db';
import { getIntake } from './trainerKit/store';

export const ONBOARDING_KEY = 'onboarding';
/** The 1.13 first-run intake skip marker (same key src/ui/app.ts writes). */
export const INTAKE_SKIPPED_KEY = 'intakeSkipped';
/**
 * The release the permission catch-up last ran in (a string like '1.15.0'). Phone-only: it is
 * about this phone's permissions, so it is never backed up and a restore keeps this phone's row.
 */
export const PERMISSION_CATCH_UP_KEY = 'permissionCatchUp';

export type WelcomePage = {
  title: string;
  body: string;
  /** Only the lockup page: shown under the name. */
  tagline?: string;
};

export type PermissionAction =
  /** The button asks the system right away (camera; mic, which then downloads on-phone speech). */
  | { kind: 'ask'; label: string }
  /** The button opens the M11 Apple Health connect flow. */
  | { kind: 'connect'; label: string }
  /** The button switches the session reminder on; that switch asks for notifications. */
  | { kind: 'reminder'; label: string }
  /** No Allow button: the page explains; `note` says when the phone asks. No page uses it now. */
  | { kind: 'none'; note: string };

export type PermissionPage = {
  title: string;
  why: string;
  action: PermissionAction;
  notNow: string;
};

export const WELCOME_PAGES: Record<WelcomePageId, WelcomePage> = {
  hello: {
    title: APP_NAME,
    tagline: APP_TAGLINE,
    body: 'Guided workouts, a coach and a food log in one app. Everything stays on this phone.',
  },
  train: {
    title: 'Train with a guide',
    body: 'Each set shows what to lift and the muscles to feel. Rest timers and voice cues keep you moving.',
  },
  coach: {
    title: 'A coach that adapts',
    body: 'Short on time or low on energy? Ask the coach, and nothing changes until you tap Apply.',
  },
};

export const PERMISSION_PAGES: Record<OnboardingPermission, PermissionPage> = {
  camera: {
    title: 'Camera',
    why: 'Prop up your phone and it counts your reps for you. No video is saved or sent.',
    action: { kind: 'ask', label: 'Allow camera' },
    notNow: 'Not now',
  },
  health: {
    title: 'Apple Health',
    why: 'Sleep and workouts from Health help the coach suggest lighter days. It is read-only and stays on this phone.',
    action: { kind: 'connect', label: 'Connect Apple Health' },
    notNow: 'Not now',
  },
  mic: {
    title: 'Microphone',
    why: 'Hold the mic to talk to the coach; audio is never stored or sent. Allow also sets up speech on this phone, about a minute on Wi-Fi.',
    action: { kind: 'ask', label: 'Allow microphone' },
    notNow: 'Not now',
  },
  notifications: {
    title: 'Reminders',
    why: 'A nudge at your training time, made on this phone. Reminders start off until you turn one on.',
    action: { kind: 'reminder', label: 'Turn on session reminder' },
    notNow: 'Not now',
  },
};

export const ONBOARDING_BUTTONS = {
  next: 'Next',
  back: 'Back',
  skip: 'Skip',
  done: 'Go to Today',
  /** Settings row that re-runs the flow. */
  rerun: 'Show the welcome again',
} as const;

/** The stored outcome; undefined when there is no row (or it holds no valid time). */
export async function getOnboarding(db: GymDb): Promise<Onboarding | undefined> {
  return parseOnboarding((await db.settings.get(ONBOARDING_KEY))?.value);
}

/**
 * Stores the end of the flow once: the first finish or skip stays, later calls (a re-run from
 * Settings) leave the row as it is. Returns the stored row.
 */
export async function markOnboarding(
  db: GymDb,
  how: 'done' | 'skipped',
  at: number,
): Promise<Onboarding> {
  return db.transaction('rw', db.settings, async () => {
    const prev = (await db.settings.get(ONBOARDING_KEY))?.value;
    const row = closeOnboarding(prev, how, at);
    if (parseOnboarding(prev) === undefined)
      await db.settings.put({ key: ONBOARDING_KEY, value: row });
    return row;
  });
}

/** What `shouldOnboard` and `onboardingSteps` need from this install. Never writes. */
export async function loadOnboardingFacts(
  db: GymDb,
): Promise<OnboardingFacts & { intakeSkipped: boolean; intakeDone: boolean }> {
  const [sessions, row, skipped, intake] = await Promise.all([
    db.sessions.count(),
    db.settings.get(ONBOARDING_KEY),
    db.settings.get(INTAKE_SKIPPED_KEY),
    getIntake(db),
  ]);
  return {
    sessions,
    row: row?.value,
    intakeSkipped: skipped !== undefined,
    intakeDone: intake !== undefined,
  };
}

/** The release the permission catch-up last ran in; undefined when never (or a damaged row). */
export async function loadPermissionCatchUp(db: GymDb): Promise<string | undefined> {
  const v = (await db.settings.get(PERMISSION_CATCH_UP_KEY))?.value;
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** Marks the catch-up as run for `release` (Allow or Not now alike: once per release). */
export async function markPermissionCatchUp(db: GymDb, release: string): Promise<void> {
  await db.settings.put({ key: PERMISSION_CATCH_UP_KEY, value: release });
}
