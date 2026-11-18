import 'fake-indexeddb/auto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDate, localDate, weekdayOf } from '../../core/trainer/plan';
import type { FoodEntry, Goal, OwnerMode, SetLog, TrainerState } from '../../core/types';
import { BACKUP_TABLES, importAll, validateBackup } from '../backup';
import { program } from '../catalog';
import { GymDb, type SessionRow } from '../db';
import { getNutritionSettings, listWeighIns } from '../nutrition/store';
import { ONBOARDING_KEY } from '../onboarding';
import { OWNER_MODE_KEY } from '../ownerMode';
import { defaultProgramChanged, loadTrainerState } from '../plan';
import { getIntake, listGoals } from '../trainerKit/store';
import { buildDemoBackup } from './demoBackup';

// A made-up moment (a Tuesday evening, local time); the demo is built back from it.
const NOW = new Date(2026, 10, 17, 19, 30).getTime();
const TODAY = localDate(NOW);

const rows = <T>(b: ReturnType<typeof buildDemoBackup>, t: (typeof BACKUP_TABLES)[number]) =>
  (b.tables[t] ?? []) as T[];
const setting = (b: ReturnType<typeof buildDemoBackup>, key: string): unknown =>
  rows<{ key: string; value: unknown }>(b, 'settings').find((r) => r.key === key)?.value;

describe('buildDemoBackup(now): a made-up person for the store screenshots (M13 task 34)', () => {
  let db: GymDb;
  beforeEach(() => {
    db = new GymDb(`demo-${Math.random()}`);
  });
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('passes validateBackup, as an object and as the JSON text a file holds', () => {
    const b = buildDemoBackup(NOW);
    expect(() => validateBackup(db, b)).not.toThrow();
    expect(() => validateBackup(db, JSON.stringify(b))).not.toThrow();
    expect(b.dexieVersion).toBe(db.verno);
    expect(b.createdAt).toBe(NOW);
    for (const t of Object.keys(b.tables)) expect(BACKUP_TABLES as readonly string[]).toContain(t);
  });

  it('is the same for the same moment (no clock read, no randomness)', () => {
    expect(JSON.stringify(buildDemoBackup(NOW))).toBe(JSON.stringify(buildDemoBackup(NOW)));
  });

  it('about 6 weeks of finished sessions, with sets for each', () => {
    const b = buildDemoBackup(NOW);
    const sessions = rows<SessionRow>(b, 'sessions');
    const sets = rows<SetLog>(b, 'sets');
    expect(sessions.length).toBeGreaterThanOrEqual(14);
    const first = Math.min(...sessions.map((s) => s.startedAt));
    expect(NOW - first).toBeGreaterThanOrEqual(5 * 7 * 86_400_000);
    expect(NOW - first).toBeLessThanOrEqual(6 * 7 * 86_400_000);
    for (const s of sessions) {
      expect(s.endedAt).toBeGreaterThan(s.startedAt);
      expect(s.endedAt).toBeLessThan(NOW);
      const mine = sets.filter((l) => l.sessionId === s.sessionId);
      expect(mine.length, s.sessionId).toBeGreaterThan(0);
      expect(s.setsDone).toBe(mine.length);
    }
    expect(new Set(sessions.map((s) => s.sessionId)).size).toBe(sessions.length);
  });

  it('the weights go up over the weeks (a progress chart worth showing)', () => {
    const sets = rows<SetLog>(buildDemoBackup(NOW), 'sets').filter((l) => l.weightKg > 0);
    const byEx = new Map<string, SetLog[]>();
    for (const l of sets) byEx.set(l.exerciseId, [...(byEx.get(l.exerciseId) ?? []), l]);
    const rising = [...byEx.values()].filter((ls) => {
      const sorted = [...ls].sort((a, c) => a.startedAt - c.startedAt);
      return (sorted.at(-1)?.weightKg ?? 0) > (sorted[0]?.weightKg ?? 0);
    });
    expect(rising.length).toBeGreaterThanOrEqual(2);
  });

  it('restores: plan with a focus block, a goal, intake, Fuel targets and days, owner mode off', async () => {
    const b = buildDemoBackup(NOW);
    const r = await importAll(db, b);
    expect(r.counts.sessions).toBe(rows(b, 'sessions').length);

    const state: TrainerState = await loadTrainerState(db, program);
    expect(state.plan.edited).toBe(true);
    expect(state.blocks?.length).toBe(1);
    const block = state.blocks?.[0];
    expect(block?.days.some((d) => d.date >= TODAY)).toBe(true);
    // Every planned exercise has a weight to start from (the starter plan leaves them open).
    for (const d of state.plan.days)
      for (const p of d.exercises) expect(typeof p.startWeightKg, p.exerciseId).toBe('number');

    const goals: Goal[] = await listGoals(db);
    expect(goals).toHaveLength(1);
    expect((goals[0]?.due ?? '') > TODAY).toBe(true);

    expect(await getIntake(db)).toBeDefined();
    const fuel = await getNutritionSettings(db);
    expect(fuel?.goalKind).toBe((await getIntake(db))?.goalKind);

    const entries = rows<FoodEntry>(b, 'foodEntries');
    const days = new Set(entries.map((e) => e.date));
    expect(days.has(TODAY)).toBe(true);
    expect(days.size).toBeGreaterThanOrEqual(5);
    expect((await listWeighIns(db)).length).toBeGreaterThanOrEqual(6);

    const owner = setting(b, OWNER_MODE_KEY) as OwnerMode;
    expect(owner.on).toBe(false);
    expect(setting(b, ONBOARDING_KEY)).toMatchObject({ doneAt: expect.any(Number) });
  });

  it('its body numbers are round, obviously made-up demo values (no real person near home)', async () => {
    await importAll(db, buildDemoBackup(NOW));
    const fuel = await getNutritionSettings(db);
    expect(fuel?.heightCm).toBe(170);
    expect(fuel?.birthYear).toBe(1990);
    const weighIns = await listWeighIns(db);
    const first = [...weighIns].sort((a, b) => a.date.localeCompare(b.date))[0];
    expect(first?.kg).toBe(70);
    const sites = rows<{ date: string; cm: number }>(buildDemoBackup(NOW), 'measurements');
    const firstDate = sites.map((m) => m.date).sort()[0];
    for (const m of sites.filter((x) => x.date === firstDate)) expect(m.cm % 5).toBe(0);
  });

  it('restored, Today offers no "new default program" (the plan counts as seen against program.json)', async () => {
    await importAll(db, buildDemoBackup(NOW));
    const state = await loadTrainerState(db, program);
    expect(state.plan.edited).toBe(true);
    expect(defaultProgramChanged(state, program)).toBe(false);
  });

  it('no session falls on a rest weekday of the restored schedule', () => {
    const b = buildDemoBackup(NOW);
    const state = rows<{ state: TrainerState }>(b, 'trainer')[0]?.state;
    const rest = new Set(state?.schedule.restWeekdays ?? []);
    for (const s of rows<SessionRow>(b, 'sessions'))
      expect(rest.has(weekdayOf(localDate(s.startedAt))), s.sessionId).toBe(false);
  });

  it('holds no secrets, no Health days, no chat and no developer log', () => {
    const text = JSON.stringify(buildDemoBackup(NOW));
    expect(text).not.toMatch(/apiKey|token|password/i);
    for (const t of ['healthDays', 'chatMessages', 'progressPhotos', 'devlogSessions'])
      expect(text).not.toContain(`"${t}"`);
  });

  it('dates are inside the 6 weeks or ahead (goal due, focus block)', () => {
    const b = buildDemoBackup(NOW);
    const start = addDate(TODAY, -42);
    for (const e of rows<FoodEntry>(b, 'foodEntries')) {
      expect(e.date >= start && e.date <= TODAY, e.id).toBe(true);
    }
  });
});

describe('the demo is not part of the app', () => {
  const SRC = fileURLToPath(new URL('../..', import.meta.url));
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });

  it('no non-test file in src imports it', () => {
    const importers = walk(SRC)
      .filter((p) => /\.ts$/.test(p) && !/\.test\.ts$/.test(p))
      .filter((p) => /demo\/demoBackup|['"]\.\/demoBackup['"]/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SRC, p).split(sep).join('/'));
    expect(importers).toEqual([]);
  });
});
