import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TodoStep } from '../../core/types';
import { GymDb } from '../db';
import { exportAll as exportDevLog, startDevLogSession } from '../devlog';
import {
  TODO_SETTINGS_KEY,
  TODO_SIGNALS_KEY,
  WHATS_NEW_KEY,
  applyDecision,
  getTodoSettings,
  getTodoSignals,
  getWhatsNew,
  listAnswers,
  markSeen,
  markSent,
  noteBuildSeen,
  noteSignal,
  recordAutoTicks,
  saveAnswer,
  skipTopic,
} from './store';
import { TODO_TOPICS, TRAINER_KIT_DEFAULTS } from './topics';

// Made-up data only (public repo).
const T0 = new Date(2026, 10, 16, 9).getTime();
const R = '1.12.0';

let n = 0;
let db: GymDb;
beforeEach(async () => {
  db = new GymDb(`todos-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

type AskStep = Extract<TodoStep, { kind: 'ask' }>;
const decision = (topicId: string): AskStep => {
  const s = TODO_TOPICS.find((t) => t.id === topicId)?.steps.find(
    (x): x is AskStep => x.kind === 'ask' && x.setting !== undefined,
  );
  if (!s) throw new Error(topicId);
  return s;
};

describe('answers', () => {
  it('saves an ask answer and lists it (round trip)', async () => {
    const a = await saveAnswer(
      db,
      { topicId: 'camera', stepId: 'cues', optionIds: ['yes'], note: 'Made-up note' },
      T0,
      R,
    );
    expect(a).toMatchObject({
      topicId: 'camera',
      stepId: 'cues',
      kind: 'ask',
      optionIds: ['yes'],
      note: 'Made-up note',
      at: T0,
      release: R,
    });
    expect(a.sentAt).toBeUndefined();
    expect(await listAnswers(db)).toEqual([a]);
  });

  it('changes an unsent answer in place', async () => {
    const a = await saveAnswer(db, { topicId: 't', stepId: 's', optionIds: ['x'] }, T0, R);
    const b = await saveAnswer(
      db,
      { topicId: 't', stepId: 's', optionIds: ['y'], note: 'n' },
      T0 + 5,
      R,
    );
    expect(b.id).toBe(a.id);
    expect(await listAnswers(db)).toEqual([
      expect.objectContaining({ id: a.id, optionIds: ['y'], note: 'n', at: T0 + 5 }),
    ]);
    const c = await saveAnswer(db, { topicId: 't', stepId: 's', optionIds: ['x'] }, T0 + 6, R);
    expect(c.note).toBeUndefined();
    expect((await listAnswers(db))[0]?.note).toBeUndefined();
  });

  it('after a copy, a change is a new answer', async () => {
    const a = await saveAnswer(db, { topicId: 't', stepId: 's', optionIds: ['x'] }, T0, R);
    await markSent(db, [a.id], T0 + 1);
    const b = await saveAnswer(db, { topicId: 't', stepId: 's', optionIds: ['y'] }, T0 + 2, R);
    expect(b.id).not.toBe(a.id);
    const all = await listAnswers(db);
    expect(all.map((x) => [x.optionIds, x.sentAt])).toEqual([
      [['x'], T0 + 1],
      [['y'], undefined],
    ]);
  });

  it('removes key-like strings from a note and caps it at 500 characters', async () => {
    const a = await saveAnswer(
      db,
      { topicId: 't', stepId: 's', optionIds: [], note: `x sk-ant-api03-madeupMADEUP0123456789 ${'y'.repeat(600)}` },
      T0,
      R,
    );
    expect(a.note).toMatch(/^x \[key removed\] y+$/);
    expect(a.note).toHaveLength(500);
  });

  it('records auto ticks once per step', async () => {
    const ticks = [
      { topicId: 'coach-calendar', stepId: 'asked' },
      { topicId: 'camera', stepId: 'learning' },
    ];
    expect(await recordAutoTicks(db, ticks, T0, R)).toBe(2);
    expect(await recordAutoTicks(db, ticks, T0 + 9, R)).toBe(0);
    const all = await listAnswers(db);
    expect(all).toHaveLength(2);
    expect(all.every((a) => a.kind === 'auto' && a.at === T0 && a.release === R)).toBe(true);
  });

  it('skips a topic once', async () => {
    const s = await skipTopic(db, 'vesync', T0, R);
    expect(s).toMatchObject({ topicId: 'vesync', stepId: '', kind: 'skip', at: T0 });
    await skipTopic(db, 'vesync', T0 + 1, R);
    expect(await listAnswers(db)).toHaveLength(1);
  });

  it('marks answers sent and remembers the last copy', async () => {
    const a = await saveAnswer(db, { topicId: 't', stepId: 'a', optionIds: ['x'] }, T0, R);
    const b = await saveAnswer(db, { topicId: 't', stepId: 'b', optionIds: ['x'] }, T0, R);
    await markSent(db, [a.id, 'missing'], T0 + 3);
    const rows = await listAnswers(db);
    expect(rows.find((r) => r.id === a.id)?.sentAt).toBe(T0 + 3);
    expect(rows.find((r) => r.id === b.id)?.sentAt).toBeUndefined();
    expect(await getTodoSettings(db)).toEqual({ lastCopiedAt: T0 + 3 });
    expect((await db.settings.get(TODO_SETTINGS_KEY))?.value).toEqual({ lastCopiedAt: T0 + 3 });
  });

  it('lists answers oldest first', async () => {
    await saveAnswer(db, { topicId: 't', stepId: 'b', optionIds: [] }, T0 + 2, R);
    await saveAnswer(db, { topicId: 't', stepId: 'a', optionIds: [] }, T0 + 1, R);
    expect((await listAnswers(db)).map((a) => a.stepId)).toEqual(['a', 'b']);
  });

  it('puts nothing in the developer log', async () => {
    const rec = await startDevLogSession(db, { dayId: 'push-a', settings: {} }, { now: () => T0 });
    await rec.finish(T0 + 1);
    await saveAnswer(
      db,
      { topicId: 'camera', stepId: 'cues', optionIds: ['yes'], note: 'Made-up private note' },
      T0,
      R,
    );
    await skipTopic(db, 'vesync', T0, R);
    const text = JSON.stringify(await exportDevLog(db, T0 + 2));
    expect(text).not.toMatch(/Made-up private note|vesync|camera/);
  });
});

describe('applyDecision', () => {
  it('sets coach.appleCardReasons and keeps the rest of the coach row', async () => {
    await db.settings.put({ key: 'coach', value: { answeredMissed: ['2026-11-10'] } });
    expect(await applyDecision(db, decision('apple-card'), 'no')).toBe(true);
    expect((await db.settings.get('coach'))?.value).toEqual({
      answeredMissed: ['2026-11-10'],
      appleCardReasons: false,
    });
  });

  it('sets coach.claudeWanted only (never a key)', async () => {
    await applyDecision(db, decision('claude'), 'later');
    expect((await db.settings.get('coach'))?.value).toEqual({ claudeWanted: 'later' });
  });

  it('confirms the trainer-kit defaults; "change something" leaves settings untouched', async () => {
    expect(await applyDecision(db, decision('trainer-kit'), 'change')).toBe(false);
    expect(await db.settings.get('trainerKit')).toBeUndefined();
    expect(await applyDecision(db, decision('trainer-kit'), 'keep')).toBe(true);
    expect((await db.settings.get('trainerKit'))?.value).toEqual(TRAINER_KIT_DEFAULTS);
  });

  it('sets signing', async () => {
    await applyDecision(db, decision('resign'), 'paid');
    expect((await db.settings.get('signing'))?.value).toEqual({ signing: 'paid' });
  });

  it('touches only its own setting key', async () => {
    const before = [
      { key: 'unit', value: 'lb' },
      { key: 'health', value: { enabled: { sleep: true } } },
      { key: 'trainerKit', value: { reviewWeeks: 6 } },
    ];
    await db.settings.bulkPut(before);
    await applyDecision(db, decision('apple-card'), 'yes');
    const rows = await db.settings.toArray();
    expect(rows.filter((r) => r.key !== 'coach')).toEqual(
      [...before].sort((a, b) => a.key.localeCompare(b.key)),
    );
  });

  it('does nothing for an unknown option or a step without a setting', async () => {
    expect(await applyDecision(db, decision('apple-card'), 'maybe')).toBe(false);
    const plain: AskStep = { id: 'q', title: 'Q?', kind: 'ask', options: [{ id: 'a', label: 'A' }] };
    expect(await applyDecision(db, plain, 'a')).toBe(false);
    expect(await db.settings.count()).toBe(0);
  });

  it('replaces a non-object value when writing a path into it', async () => {
    await db.settings.put({ key: 'coach', value: 'garbage' });
    await applyDecision(db, decision('apple-card'), 'yes');
    expect((await db.settings.get('coach'))?.value).toEqual({ appleCardReasons: true });
  });
});

describe("What's New state", () => {
  it('starts empty, marks a release seen and keeps the builds', async () => {
    expect(await getWhatsNew(db)).toEqual({});
    await noteBuildSeen(db, 'abc-1', T0);
    await markSeen(db, '1.12.0');
    expect(await getWhatsNew(db)).toEqual({ seenRelease: '1.12.0', builds: { 'abc-1': T0 } });
    expect((await db.settings.get(WHATS_NEW_KEY))?.value).toEqual({
      seenRelease: '1.12.0',
      builds: { 'abc-1': T0 },
    });
  });

  it('never moves the seen release backwards', async () => {
    await markSeen(db, '1.13.0');
    await markSeen(db, '1.12.0');
    expect((await getWhatsNew(db)).seenRelease).toBe('1.13.0');
  });

  it('notes a build the first time only', async () => {
    expect(await noteBuildSeen(db, 'b1', T0)).toBe(T0);
    expect(await noteBuildSeen(db, 'b1', T0 + 99)).toBe(T0);
    expect(await noteBuildSeen(db, 'b2', T0 + 100)).toBe(T0 + 100);
    expect((await getWhatsNew(db)).builds).toEqual({ b1: T0, b2: T0 + 100 });
  });

  it('keeps the oldest build and the latest ones when the list grows', async () => {
    for (let i = 0; i < 30; i++) await noteBuildSeen(db, `b${i}`, T0 + i);
    const builds = (await getWhatsNew(db)).builds ?? {};
    expect(Object.keys(builds)).toHaveLength(10);
    expect(builds.b0).toBe(T0);
    expect(builds.b29).toBe(T0 + 29);
  });

  it('reads a damaged row as empty', async () => {
    await db.settings.put({ key: WHATS_NEW_KEY, value: { seenRelease: 5, builds: { x: 'y', z: 3 } } });
    expect(await getWhatsNew(db)).toEqual({ builds: { z: 3 } });
  });
});

describe('noteSignal', () => {
  const day = (d: number, h: number) => new Date(2026, 10, d, h).getTime();

  it('records Calendar opened only when a finished session exists that day', async () => {
    expect(await noteSignal(db, 'calendarAfterSession', day(16, 20))).toBe(false);
    await db.sessions.put({ sessionId: 's0', dayId: 'push-a', startedAt: day(15, 18), endedAt: day(15, 19) });
    await db.sessions.put({ sessionId: 's1', dayId: 'push-a', startedAt: day(16, 8) }); // not finished
    expect(await noteSignal(db, 'calendarAfterSession', day(16, 20))).toBe(false);
    expect(await getTodoSignals(db)).toEqual({});
    await db.sessions.update('s1', { endedAt: day(16, 9) });
    expect(await noteSignal(db, 'calendarAfterSession', day(16, 20))).toBe(true);
    expect(await getTodoSignals(db)).toEqual({ calendarAfterSessionAt: day(16, 20) });
    expect((await db.settings.get(TODO_SIGNALS_KEY))?.value).toEqual({
      calendarAfterSessionAt: day(16, 20),
    });
  });

  it('keeps the first time', async () => {
    await db.sessions.put({ sessionId: 's1', dayId: 'x', startedAt: day(16, 8), endedAt: day(16, 9) });
    await noteSignal(db, 'calendarAfterSession', day(16, 10));
    await noteSignal(db, 'calendarAfterSession', day(16, 11));
    expect(await getTodoSignals(db)).toEqual({ calendarAfterSessionAt: day(16, 10) });
  });
});
