import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_NAME, APP_TAGLINE } from '../core/brand';
import { PERMISSION_ORDER, WELCOME_PAGE_IDS, shouldOnboard } from '../core/onboarding';
import { checkCopy } from '../core/trainer/replies';
import { exportAll, importAll } from './backup';
import { GymDb } from './db';
import {
  INTAKE_SKIPPED_KEY,
  ONBOARDING_BUTTONS,
  ONBOARDING_KEY,
  PERMISSION_CATCH_UP_KEY,
  PERMISSION_PAGES,
  UNITS_PAGE,
  WELCOME_PAGES,
  getOnboarding,
  loadOnboardingFacts,
  loadPermissionCatchUp,
  markOnboarding,
  markPermissionCatchUp,
} from './onboarding';
import { saveIntake } from './trainerKit/store';
import infoPlist from '../../ios/App/App/Info.plist?raw';

// Made-up data only (public repo).
const T0 = new Date(2026, 10, 17, 9).getTime();

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter((x) => x.trim() !== '');
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** The iPhone app's Health permission text (task 6 wrote it; M13d task 18 owns its copy). */
const healthUsage = (): string => {
  const m = /<key>NSHealthShareUsageDescription<\/key>\s*<string>([^<]*)<\/string>/.exec(infoPlist);
  return m?.[1] ?? '';
};

/** Every shown string on the pages and buttons. */
const allCopy = (): string[] => [
  ...Object.values(WELCOME_PAGES).flatMap((p) => [p.title, p.body]),
  ...Object.values(PERMISSION_PAGES).flatMap((p) => [
    p.title,
    p.why,
    ...(p.action.kind === 'none' ? [p.action.note] : [p.action.label]),
  ]),
  ...Object.values(ONBOARDING_BUTTONS),
  UNITS_PAGE.title,
  UNITS_PAGE.body,
  UNITS_PAGE.weight.label,
  UNITS_PAGE.length.label,
  ...Object.values(UNITS_PAGE.weight.options),
  ...Object.values(UNITS_PAGE.length.options),
];

describe('onboarding copy (data)', () => {
  it('has a page for every welcome id and every permission', () => {
    expect(Object.keys(WELCOME_PAGES).sort()).toEqual([...WELCOME_PAGE_IDS].sort());
    expect(Object.keys(PERMISSION_PAGES).sort()).toEqual([...PERMISSION_ORDER].sort());
  });

  it('the hello page is the lockup: the name from the brand constant, the tagline shown', () => {
    expect(WELCOME_PAGES.hello.title).toBe(APP_NAME);
    expect(WELCOME_PAGES.hello.tagline).toBe(APP_TAGLINE);
  });

  // M13d task 18 (SPEC M13d goal 4, "some screens have too much text"): first-run pages are
  // measured at ≤ 30 words on screen (readability spec), so the data keeps each page short.
  it('M13d budget: each welcome page is a title + one sentence of ≤ 15 words', () => {
    for (const p of Object.values(WELCOME_PAGES)) {
      expect(sentences(p.body), p.body).toHaveLength(1);
      expect(words(p.body), p.body).toBeLessThanOrEqual(15);
      expect(words(p.title), p.title).toBeLessThanOrEqual(5);
    }
  });

  it('M13d budget: each permission "why" is one sentence of ≤ 20 words', () => {
    for (const p of Object.values(PERMISSION_PAGES)) {
      expect(sentences(p.why), p.why).toHaveLength(1);
      expect(words(p.why), p.why).toBeLessThanOrEqual(20);
    }
  });

  it('the hello page keeps its privacy line (first-launch e2e looks for it)', () => {
    expect(WELCOME_PAGES.hello.body).toContain('Everything stays on this phone.');
  });

  it('Units page: a title, one line of ≤ 15 words, weight kg / lb and height-and-body cm / ft·in', () => {
    expect(UNITS_PAGE.title).toBe('Units');
    expect(sentences(UNITS_PAGE.body)).toHaveLength(1);
    expect(words(UNITS_PAGE.body)).toBeLessThanOrEqual(15);
    // Goal 3: the units can be changed later right where you type a number.
    expect(UNITS_PAGE.body).toMatch(/later/i);
    expect(UNITS_PAGE.weight).toEqual({ label: 'Weight', options: { kg: 'kg', lb: 'lb' } });
    expect(UNITS_PAGE.length).toEqual({
      label: 'Height and body',
      options: { cm: 'cm', in: 'ft·in' },
    });
  });

  it('every string passes checkCopy', () => {
    for (const s of allCopy()) expect(checkCopy(s), s).toEqual({ ok: true, hits: [] });
  });

  it('is written to "you": no he/his/she/her, no "man", "guys" or "bro"', () => {
    for (const s of allCopy())
      expect(s, s).not.toMatch(/\b(he|him|his|she|her|hers|man|men|guys?|bro)\b/i);
  });

  it('assumes no goal (no "build muscle", "lose fat", "bulk", "cut", "get big")', () => {
    for (const s of allCopy())
      expect(s, s).not.toMatch(/build muscle|lose (fat|weight)|\bbulk|\bcut\b|get (big|lean)/i);
  });

  it('does not spell the app name (reads APP_NAME)', () => {
    for (const s of allCopy().filter((x) => x !== APP_NAME)) expect(s).not.toContain(APP_NAME);
  });

  it('the four "why" texts say what happens to the data', () => {
    expect(PERMISSION_PAGES.camera.why).toMatch(/count/i);
    expect(PERMISSION_PAGES.camera.why).toMatch(/no video is saved or sent/i);
    expect(PERMISSION_PAGES.health.why).toMatch(/read-only/i);
    expect(PERMISSION_PAGES.health.why).toMatch(/stays on this phone/i);
    // M13d-q2: Health also pre-fills Set up Fuel with height, birth year and sex.
    expect(PERMISSION_PAGES.health.why).toMatch(/\bheight\b/i);
    expect(PERMISSION_PAGES.health.why).toMatch(/\bbirthday\b/i);
    expect(PERMISSION_PAGES.health.why).toMatch(/\bsex\b/i);
    expect(PERMISSION_PAGES.health.why).toMatch(/\bFuel\b/);
    expect(PERMISSION_PAGES.mic.why).toMatch(/hold/i);
    expect(PERMISSION_PAGES.mic.why).toMatch(/never stored/i);
    expect(PERMISSION_PAGES.notifications.why).toMatch(/off/i);
  });

  it('every permission page has one button: camera and mic ask, notifications switch the session reminder on, Health connects', () => {
    expect(PERMISSION_PAGES.camera.action).toEqual({ kind: 'ask', label: 'Allow camera' });
    expect(PERMISSION_PAGES.health.action.kind).toBe('connect');
    expect(PERMISSION_PAGES.mic.action).toEqual({ kind: 'ask', label: 'Allow microphone' });
    expect(PERMISSION_PAGES.notifications.action.kind).toBe('reminder');
    for (const p of Object.values(PERMISSION_PAGES)) expect(p.action.kind).not.toBe('none');
  });

  it('the mic page says speech is set up on this phone, how long it takes, and that audio stays put', () => {
    const why = PERMISSION_PAGES.mic.why;
    expect(why).toMatch(/\bhold\b/i);
    expect(why).toMatch(/setup|set up/i);
    expect(why).toMatch(/speech/i);
    expect(why).toMatch(/on this phone/i);
    expect(why).toMatch(/minute/i);
    expect(why).toMatch(/wi-fi/i);
    expect(why).toMatch(/never stored or sent/i);
  });

  it('the iPhone Health permission text (Info.plist): what is read and why, private, short, to "you"', () => {
    const text = healthUsage();
    expect(text).not.toBe('');
    for (const w of [/\bsleep\b/i, /\bworkouts\b/i, /\bweight\b/i, /\bheight\b/i, /\bbirthday\b/i, /\bsex\b/i])
      expect(text, String(w)).toMatch(w);
    expect(text).toMatch(/\bFuel\b/);
    expect(text).toMatch(/stays on this phone/i);
    expect(words(text)).toBeLessThanOrEqual(25);
    expect(checkCopy(text)).toEqual({ ok: true, hits: [] });
    expect(text).not.toMatch(/\b(he|him|his|she|her|hers)\b/i);
  });

  it('every permission page has "Not now"; buttons have Skip, Back, Next', () => {
    for (const p of Object.values(PERMISSION_PAGES)) expect(p.notNow).toBe('Not now');
    expect(ONBOARDING_BUTTONS).toMatchObject({ skip: 'Skip', back: 'Back', next: 'Next' });
  });
});

let n = 0;
let db: GymDb;
beforeEach(async () => {
  db = new GymDb(`onboarding-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('onboarding store', () => {
  it('no row on a fresh install', async () => {
    expect(await getOnboarding(db)).toBeUndefined();
  });

  it('finishing stores doneAt once; a later skip does not change it', async () => {
    expect(await markOnboarding(db, 'done', T0)).toEqual({ doneAt: T0 });
    expect(await markOnboarding(db, 'skipped', T0 + 1000)).toEqual({ doneAt: T0 });
    expect((await db.settings.get(ONBOARDING_KEY))?.value).toEqual({ doneAt: T0 });
    expect(await getOnboarding(db)).toEqual({ doneAt: T0 });
  });

  it('skipping stores skippedAt once', async () => {
    expect(await markOnboarding(db, 'skipped', T0)).toEqual({ skippedAt: T0 });
    expect(await markOnboarding(db, 'done', T0 + 1000)).toEqual({ skippedAt: T0 });
  });

  it('facts: fresh install → onboard; after finishing → not again', async () => {
    let facts = await loadOnboardingFacts(db);
    expect(facts).toEqual({ sessions: 0, row: undefined, intakeSkipped: false, intakeDone: false });
    expect(shouldOnboard(facts)).toBe(true);
    await markOnboarding(db, 'done', T0);
    facts = await loadOnboardingFacts(db);
    expect(shouldOnboard(facts)).toBe(false);
  });

  it('facts: an install with a session never gets it', async () => {
    await db.sessions.add({ sessionId: 's1', dayId: 'push-a', startedAt: T0 });
    const facts = await loadOnboardingFacts(db);
    expect(facts.sessions).toBe(1);
    expect(shouldOnboard(facts)).toBe(false);
  });

  it('facts: intake answered / intake skipped are read', async () => {
    await saveIntake(db, {
      goalKind: 'general',
      days: 3,
      sessionMin: 45,
      experience: 'some',
      easyOn: [],
      at: T0,
    });
    const answered = await loadOnboardingFacts(db);
    expect(answered.intakeDone).toBe(true);
    // A pre-1.15 install that answered the intake but logged no session is existing: no welcome.
    expect(answered.sessions).toBe(0);
    expect(shouldOnboard(answered)).toBe(false);
    await db.settings.put({ key: INTAKE_SKIPPED_KEY, value: T0 });
    const facts = await loadOnboardingFacts(db);
    expect(facts.intakeSkipped).toBe(true);
    expect(shouldOnboard(facts)).toBe(false);
  });

  it('the row rides along in a backup and comes back on restore', async () => {
    await markOnboarding(db, 'skipped', T0);
    const file = JSON.parse(JSON.stringify(await exportAll(db, { now: T0 }))) as unknown;
    const other = new GymDb(`onboarding-restore-${n++}`);
    await other.open();
    try {
      await importAll(other, file, { now: T0 });
      expect(await getOnboarding(other)).toEqual({ skippedAt: T0 });
    } finally {
      other.close();
      await other.delete();
    }
  });
});

describe('permission catch-up store (seen release, phone-only)', () => {
  it('undefined until marked; marking stores the release; a later release replaces it', async () => {
    expect(await loadPermissionCatchUp(db)).toBeUndefined();
    await markPermissionCatchUp(db, '1.15.0');
    expect(await loadPermissionCatchUp(db)).toBe('1.15.0');
    expect((await db.settings.get(PERMISSION_CATCH_UP_KEY))?.value).toBe('1.15.0');
    await markPermissionCatchUp(db, '1.16.0');
    expect(await loadPermissionCatchUp(db)).toBe('1.16.0');
  });

  it('a damaged row reads as never seen', async () => {
    await db.settings.put({ key: PERMISSION_CATCH_UP_KEY, value: 42 });
    expect(await loadPermissionCatchUp(db)).toBeUndefined();
    await db.settings.put({ key: PERMISSION_CATCH_UP_KEY, value: '' });
    expect(await loadPermissionCatchUp(db)).toBeUndefined();
  });

  it("is not backed up, and a restore keeps this phone's row (permissions belong to the phone)", async () => {
    await markPermissionCatchUp(db, '1.15.0');
    const file = JSON.parse(JSON.stringify(await exportAll(db, { now: T0 }))) as {
      tables: { settings: { key: string }[] };
    };
    expect(file.tables.settings.map((r) => r.key)).not.toContain(PERMISSION_CATCH_UP_KEY);

    // A file that does carry the row (hand-made) does not overwrite this phone's.
    file.tables.settings.push({ key: PERMISSION_CATCH_UP_KEY, value: '9.9.9' } as never);
    const other = new GymDb(`onboarding-restore-${n++}`);
    await other.open();
    try {
      await importAll(other, file, { now: T0 });
      expect(await loadPermissionCatchUp(other)).toBeUndefined();
      await markPermissionCatchUp(other, '1.14.0');
      await importAll(other, file, { now: T0 });
      expect(await loadPermissionCatchUp(other)).toBe('1.14.0');
    } finally {
      other.close();
      await other.delete();
    }
  });
});
