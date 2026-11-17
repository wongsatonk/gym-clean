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
  PERMISSION_PAGES,
  WELCOME_PAGES,
  getOnboarding,
  loadOnboardingFacts,
  markOnboarding,
} from './onboarding';
import { saveIntake } from './trainerKit/store';

// Made-up data only (public repo).
const T0 = new Date(2026, 10, 17, 9).getTime();

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter((x) => x.trim() !== '');

/** Every shown string on the pages and buttons. */
const allCopy = (): string[] => [
  ...Object.values(WELCOME_PAGES).flatMap((p) => [p.title, p.body]),
  ...Object.values(PERMISSION_PAGES).flatMap((p) => [
    p.title,
    p.why,
    ...(p.action.kind === 'none' ? [p.action.note] : [p.action.label]),
  ]),
  ...Object.values(ONBOARDING_BUTTONS),
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

  it('each page is at most 2 short sentences', () => {
    for (const p of Object.values(WELCOME_PAGES)) {
      expect(sentences(p.body).length, p.body).toBeLessThanOrEqual(2);
      for (const s of sentences(p.body)) expect(s.split(/\s+/).length, s).toBeLessThanOrEqual(14);
    }
    for (const p of Object.values(PERMISSION_PAGES)) {
      expect(sentences(p.why).length, p.why).toBeLessThanOrEqual(2);
      for (const s of sentences(p.why)) expect(s.split(/\s+/).length, s).toBeLessThanOrEqual(14);
    }
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
    expect(PERMISSION_PAGES.mic.why).toMatch(/hold/i);
    expect(PERMISSION_PAGES.mic.why).toMatch(/never stored/i);
    expect(PERMISSION_PAGES.notifications.why).toMatch(/off/i);
  });

  it('keeps the slice 2 rules: mic explains only, notifications switch the session reminder on, Health connects', () => {
    expect(PERMISSION_PAGES.camera.action.kind).toBe('ask');
    expect(PERMISSION_PAGES.health.action.kind).toBe('connect');
    expect(PERMISSION_PAGES.mic.action.kind).toBe('none');
    expect(PERMISSION_PAGES.notifications.action.kind).toBe('reminder');
    // The mic page has no Allow button: its note says when the phone asks.
    const mic = PERMISSION_PAGES.mic.action;
    expect(mic.kind === 'none' && mic.note).toMatch(/first time/i);
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
