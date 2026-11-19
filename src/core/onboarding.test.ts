import { describe, expect, it } from 'vitest';
import type { OnboardingStep } from './types';
import {
  FIRST_RUN_PERMISSION_ORDER,
  PERMISSION_ORDER,
  WELCOME_PAGE_IDS,
  closeOnboarding,
  insertAfterIntake,
  onboardingSteps,
  parseOnboarding,
  permissionCatchUpSteps,
  shouldOnboard,
  type OnboardingInput,
  type PermissionCatchUpInput,
} from './onboarding';

// Made-up times only (public repo).
const T0 = new Date(2026, 10, 17, 9).getTime();

const ALL = { health: true, mic: true, notifications: true };
const NONE = { health: false, mic: false, notifications: false };

const input = (over: Partial<OnboardingInput> = {}): OnboardingInput => ({
  platform: 'native',
  fresh: true,
  intakeDone: false,
  has: ALL,
  ...over,
});

const kinds = (steps: readonly OnboardingStep[]) =>
  steps.map((s) =>
    s.kind === 'welcome' ? `welcome:${s.id}` : s.kind === 'permission' ? s.permission : s.kind,
  );

describe('onboardingSteps', () => {
  it('iPhone app, fresh (M13d): welcome, Units, Health, intake, then camera, mic, reminders', () => {
    expect(kinds(onboardingSteps(input()))).toEqual([
      'welcome:hello',
      'welcome:train',
      'units',
      'health',
      'intake',
      'camera',
      'mic',
      'notifications',
    ]);
  });

  it('PWA, fresh (M13d): welcome, Units, intake, camera (no Health, mic or reminders)', () => {
    expect(kinds(onboardingSteps(input({ platform: 'web', has: ALL })))).toEqual([
      'welcome:hello',
      'welcome:train',
      'units',
      'intake',
      'camera',
    ]);
  });

  it('two welcome pages (M13d): the hello lockup and train; the coach page is gone', () => {
    expect(WELCOME_PAGE_IDS).toEqual(['hello', 'train']);
  });

  it('Units comes right after the welcome pages on every platform and run', () => {
    for (const over of [
      {},
      { platform: 'web' as const },
      { fresh: false },
      { intakeDone: true },
      { has: NONE },
    ]) {
      const k = kinds(onboardingSteps(input(over)));
      expect(k.indexOf('units'), JSON.stringify(over)).toBe(WELCOME_PAGE_IDS.length);
      expect(k.filter((x) => x === 'units')).toHaveLength(1);
    }
  });

  it('Health comes before the intake, so Set up Fuel can pre-fill from it', () => {
    const k = kinds(onboardingSteps(input()));
    expect(k.indexOf('health')).toBeLessThan(k.indexOf('intake'));
    expect(k.indexOf('health')).toBe(k.indexOf('units') + 1);
  });

  it('iPhone app without Health: Units then the intake', () => {
    expect(kinds(onboardingSteps(input({ has: { ...ALL, health: false } })))).toEqual([
      'welcome:hello',
      'welcome:train',
      'units',
      'intake',
      'camera',
      'mic',
      'notifications',
    ]);
  });

  it('first-run permission order is Health, then camera, mic, reminders', () => {
    expect(FIRST_RUN_PERMISSION_ORDER).toEqual(['health', 'camera', 'mic', 'notifications']);
  });

  it('the flow never holds a fuelSetup step on its own (it is inserted after the intake)', () => {
    for (const platform of ['web', 'native'] as const)
      expect(kinds(onboardingSteps(input({ platform })))).not.toContain('fuelSetup');
  });

  it('PWA: the camera page only, whatever `has` says', () => {
    const steps = onboardingSteps(input({ platform: 'web', has: ALL }));
    expect(steps.filter((s) => s.kind === 'permission')).toEqual([
      { kind: 'permission', permission: 'camera' },
    ]);
  });

  it('iPhone app: only the permissions the phone has', () => {
    const perms = (has: OnboardingInput['has']) =>
      onboardingSteps(input({ has }))
        .filter((s) => s.kind === 'permission')
        .map((s) => (s.kind === 'permission' ? s.permission : ''));
    expect(perms(NONE)).toEqual(['camera']);
    expect(perms({ health: false, mic: true, notifications: false })).toEqual(['camera', 'mic']);
    expect(perms({ health: true, mic: false, notifications: true })).toEqual([
      'health',
      'camera',
      'notifications',
    ]);
  });

  it('no camera page on a device without a camera', () => {
    const steps = onboardingSteps(input({ platform: 'web', has: { ...NONE, camera: false } }));
    expect(steps.some((s) => s.kind === 'permission')).toBe(false);
  });

  it('skips the intake when it is already answered', () => {
    expect(kinds(onboardingSteps(input({ intakeDone: true })))).not.toContain('intake');
  });

  it('a re-run from Settings on an install with history has no intake but shows Units', () => {
    expect(kinds(onboardingSteps(input({ fresh: false })))).toEqual([
      'welcome:hello',
      'welcome:train',
      'units',
      'health',
      'camera',
      'mic',
      'notifications',
    ]);
    expect(kinds(onboardingSteps(input({ platform: 'web', fresh: false })))).toEqual([
      'welcome:hello',
      'welcome:train',
      'units',
      'camera',
    ]);
  });

  it('catch-up permission order is unchanged: camera, Health, mic, notifications', () => {
    expect(PERMISSION_ORDER).toEqual(['camera', 'health', 'mic', 'notifications']);
  });
});

describe('insertAfterIntake (M13d: Set up Fuel becomes a step of the first run)', () => {
  const FUEL = { kind: 'fuelSetup' } as const;
  const native = () => onboardingSteps(input());
  const intakeAt = (steps: readonly OnboardingStep[]) =>
    steps.findIndex((s) => s.kind === 'intake');

  it('puts the step right after the intake; the rest keeps its order', () => {
    const steps = native();
    const i = intakeAt(steps);
    const out = insertAfterIntake(steps, i, FUEL);
    expect(kinds(out)).toEqual([
      'welcome:hello',
      'welcome:train',
      'units',
      'health',
      'intake',
      'fuelSetup',
      'camera',
      'mic',
      'notifications',
    ]);
    expect(out[i + 1]).toEqual(FUEL);
  });

  it('PWA: intake, Set up Fuel, camera', () => {
    const steps = onboardingSteps(input({ platform: 'web' }));
    expect(kinds(insertAfterIntake(steps, intakeAt(steps), FUEL)).slice(-3)).toEqual([
      'intake',
      'fuelSetup',
      'camera',
    ]);
  });

  it('is pure: the input list is not changed', () => {
    const steps = native();
    const before = structuredClone(steps);
    insertAfterIntake(steps, intakeAt(steps), FUEL);
    expect(steps).toEqual(before);
  });

  it('never adds it twice (Back to the intake, then Done again)', () => {
    const steps = native();
    const i = intakeAt(steps);
    const once = insertAfterIntake(steps, i, FUEL);
    const twice = insertAfterIntake(once, i, FUEL);
    expect(twice).toEqual(once);
    expect(twice.filter((s) => s.kind === 'fuelSetup')).toHaveLength(1);
  });

  it('a no-op without an intake step (re-run from Settings, intake already answered)', () => {
    const rerun = onboardingSteps(input({ fresh: false }));
    for (let i = -1; i <= rerun.length; i++)
      expect(insertAfterIntake(rerun, i, FUEL)).toEqual(rerun);
  });

  it('only right after the intake: an index that is not the intake changes nothing', () => {
    const steps = native();
    const i = intakeAt(steps);
    for (const at of [0, 1, i - 1, i + 1, steps.length - 1, steps.length, -1, 2.5])
      expect(insertAfterIntake(steps, at, FUEL), String(at)).toEqual(steps);
  });

  it('works when the intake is the last step', () => {
    const steps: OnboardingStep[] = [{ kind: 'welcome', id: 'hello' }, { kind: 'intake' }];
    expect(insertAfterIntake(steps, 1, FUEL)).toEqual([...steps, FUEL]);
  });
});

describe('shouldOnboard', () => {
  it('a fresh install (no sessions, no row) gets the flow', () => {
    expect(shouldOnboard({ sessions: 0, row: undefined })).toBe(true);
  });

  it('an install with sessions never does', () => {
    expect(shouldOnboard({ sessions: 1, row: undefined })).toBe(false);
    expect(shouldOnboard({ sessions: 40, row: undefined })).toBe(false);
  });

  it('any onboarding row (done or skipped) stops it, so a reload does not repeat it', () => {
    expect(shouldOnboard({ sessions: 0, row: { doneAt: T0 } })).toBe(false);
    expect(shouldOnboard({ sessions: 0, row: { skippedAt: T0 } })).toBe(false);
  });

  it('a damaged row still counts as seen (never put an install through it twice)', () => {
    expect(shouldOnboard({ sessions: 0, row: 'garbage' })).toBe(false);
    expect(shouldOnboard({ sessions: 0, row: {} })).toBe(false);
  });

  it('an install that already skipped the 1.13 intake is not fresh', () => {
    expect(shouldOnboard({ sessions: 0, row: undefined, intakeSkipped: true })).toBe(false);
  });

  it('an install that already answered the 1.13 intake is not fresh (pre-1.15, no sessions yet)', () => {
    expect(shouldOnboard({ sessions: 0, row: undefined, intakeDone: true })).toBe(false);
    expect(
      shouldOnboard({ sessions: 0, row: undefined, intakeSkipped: false, intakeDone: false }),
    ).toBe(true);
  });
});

describe('closeOnboarding (finish or skip, stored once)', () => {
  it('finishing stores doneAt; skipping stores skippedAt', () => {
    expect(closeOnboarding(undefined, 'done', T0)).toEqual({ doneAt: T0 });
    expect(closeOnboarding(undefined, 'skipped', T0)).toEqual({ skippedAt: T0 });
  });

  it('an existing row is kept as it is (the first outcome wins)', () => {
    expect(closeOnboarding({ doneAt: T0 }, 'skipped', T0 + 5000)).toEqual({ doneAt: T0 });
    expect(closeOnboarding({ skippedAt: T0 }, 'done', T0 + 5000)).toEqual({ skippedAt: T0 });
  });

  it('a damaged earlier row is replaced', () => {
    expect(closeOnboarding({}, 'done', T0)).toEqual({ doneAt: T0 });
  });
});

describe('parseOnboarding', () => {
  it('keeps the valid times and drops the rest', () => {
    expect(parseOnboarding({ doneAt: T0 })).toEqual({ doneAt: T0 });
    expect(parseOnboarding({ skippedAt: T0, extra: 1 })).toEqual({ skippedAt: T0 });
    expect(parseOnboarding({ doneAt: 'x' })).toBeUndefined();
    expect(parseOnboarding({})).toBeUndefined();
    expect(parseOnboarding(null)).toBeUndefined();
    expect(parseOnboarding([T0])).toBeUndefined();
  });
});

describe('permissionCatchUpSteps (an updated install is asked for what is missing)', () => {
  const base: PermissionCatchUpInput = {
    platform: 'native',
    release: '1.15.0',
    seenRelease: '1.14.0',
    onboarding: false,
    states: { camera: 'granted', mic: 'granted', notifications: 'granted', health: 'connected' },
    speechInstalled: true,
  };
  const perms = (i: PermissionCatchUpInput) =>
    permissionCatchUpSteps(i).map((s) => (s.kind === 'permission' ? s.permission : s.kind));

  it('everything decided → nothing to ask', () => {
    expect(permissionCatchUpSteps(base)).toEqual([]);
  });

  it('asks every undecided permission, in PERMISSION_ORDER, as permission steps', () => {
    const steps = permissionCatchUpSteps({
      ...base,
      states: { camera: 'prompt', mic: 'prompt', notifications: 'prompt', health: 'not-connected' },
    });
    expect(steps).toEqual(
      PERMISSION_ORDER.map((permission) => ({ kind: 'permission', permission })),
    );
  });

  it('never asks on the web, while the full flow runs, or twice in one release', () => {
    const all = {
      ...base,
      states: { camera: 'prompt', mic: 'prompt', notifications: 'prompt', health: 'not-connected' },
    } as const;
    expect(permissionCatchUpSteps({ ...all, platform: 'web' })).toEqual([]);
    expect(permissionCatchUpSteps({ ...all, onboarding: true })).toEqual([]);
    expect(permissionCatchUpSteps({ ...all, seenRelease: '1.15.0' })).toEqual([]);
    // Never seen (first catch-up ever) and a new release both ask.
    expect(perms({ ...all, seenRelease: undefined })).toEqual([...PERMISSION_ORDER]);
    expect(perms({ ...all, seenRelease: '1.15.0', release: '1.16.0' })).toEqual([
      ...PERMISSION_ORDER,
    ]);
  });

  it('denied, unavailable or unknown states are not asked (iOS cannot re-ask; Self-check covers them)', () => {
    expect(
      perms({
        ...base,
        states: {
          camera: 'denied',
          mic: 'denied',
          notifications: 'unavailable',
          health: 'unavailable',
        },
      }),
    ).toEqual([]);
    expect(perms({ ...base, states: { notifications: 'denied' } })).toEqual([]);
    expect(perms({ ...base, states: {} })).toEqual([]);
  });

  it('the mic page is asked when speech is not installed, even with the mic granted', () => {
    expect(perms({ ...base, speechInstalled: false })).toEqual(['mic']);
    expect(perms({ ...base, speechInstalled: undefined })).toEqual([]);
    expect(
      perms({ ...base, states: { ...base.states, mic: 'denied' }, speechInstalled: false }),
    ).toEqual(['mic']);
  });

  it('asks only what is missing', () => {
    expect(perms({ ...base, states: { ...base.states, camera: 'prompt' } })).toEqual(['camera']);
    expect(
      perms({
        ...base,
        states: { ...base.states, notifications: 'prompt', health: 'not-connected' },
      }),
    ).toEqual(['health', 'notifications']);
  });
});
