import { describe, expect, it } from 'vitest';
import {
  PERMISSION_ORDER,
  WELCOME_PAGE_IDS,
  closeOnboarding,
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

const kinds = (steps: ReturnType<typeof onboardingSteps>) =>
  steps.map((s) =>
    s.kind === 'welcome' ? `welcome:${s.id}` : s.kind === 'permission' ? s.permission : 'intake',
  );

describe('onboardingSteps', () => {
  it('iPhone app, fresh: welcome pages, intake, then every permission it has, in order', () => {
    expect(kinds(onboardingSteps(input()))).toEqual([
      'welcome:hello',
      'welcome:train',
      'welcome:coach',
      'intake',
      'camera',
      'health',
      'mic',
      'notifications',
    ]);
  });

  it('starts with 2–3 welcome pages after the hello page (the lockup page)', () => {
    expect(WELCOME_PAGE_IDS[0]).toBe('hello');
    expect(WELCOME_PAGE_IDS.length - 1).toBeGreaterThanOrEqual(2);
    expect(WELCOME_PAGE_IDS.length - 1).toBeLessThanOrEqual(3);
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
      'camera',
      'health',
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

  it('a re-run from Settings on an install with history has no intake (it has its own row)', () => {
    const steps = kinds(onboardingSteps(input({ fresh: false })));
    expect(steps).not.toContain('intake');
    expect(steps[0]).toBe('welcome:hello');
    expect(steps).toContain('camera');
  });

  it('permission order is camera, Health, mic, notifications', () => {
    expect(PERMISSION_ORDER).toEqual(['camera', 'health', 'mic', 'notifications']);
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
